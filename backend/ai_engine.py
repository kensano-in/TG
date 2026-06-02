import os
import json
import time
import random
import threading

# Use the modern google-genai SDK
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

from dotenv import load_dotenv
import db

load_dotenv()

# ─────────────────────────────────────────────────────────────
# KEY POOL MANAGEMENT
# ─────────────────────────────────────────────────────────────

# Cooldown periods (seconds)
COOLDOWN_QUOTA   = 300   # 5 minutes for quota exceeded
COOLDOWN_TIMEOUT = 120   # 2 minutes for timeout/busy
COOLDOWN_INVALID = 3600  # 1 hour for invalid keys

_key_lock = threading.Lock()

def get_all_keys():
    """Return all API keys from environment in order."""
    keys = []
    primary = os.getenv("GEMINI_API_KEY")
    if primary:
        keys.append(primary.strip())
    for idx in range(2, 11):
        key = os.getenv(f"GEMINI_API_KEY_{idx}")
        if key:
            keys.append(key.strip())
    return keys

def _key_prefix(key):
    """Return a short, safe identifier for a key."""
    return key[:10].replace(".", "_").replace("-", "_")

def get_key_health(key):
    """Return the cached health record for a key: {'status': ..., 'until': ...}"""
    prefix = _key_prefix(key)
    status = db.get_setting(f"key_status_{prefix}", "unknown")
    until  = float(db.get_setting(f"key_until_{prefix}", "0"))
    return {"status": status, "until": until}

def set_key_health(key, status, cooldown=0):
    """Persist key health and cooldown expiry."""
    prefix = _key_prefix(key)
    until  = time.time() + cooldown if cooldown > 0 else 0
    db.set_setting(f"key_status_{prefix}", status)
    db.set_setting(f"key_until_{prefix}", str(until))

def is_key_available(key):
    """True if key is healthy or its cooldown has expired."""
    health = get_key_health(key)
    if health["status"] in ("unknown", "active"):
        return True
    if health["until"] > 0 and time.time() >= health["until"]:
        # Cooldown expired — let it retry
        set_key_health(key, "unknown")
        return True
    return False

def get_healthy_keys():
    """Return candidate keys: healthy first, degraded last."""
    all_keys = get_all_keys()
    healthy   = [k for k in all_keys if is_key_available(k)]
    degraded  = [k for k in all_keys if not is_key_available(k)]
    random.shuffle(healthy)
    return healthy + degraded

def _classify_error(err_str):
    """Classify an API exception string into a standardised status."""
    e = err_str.lower()
    if "quota" in e or "429" in e or "rate" in e or "limit" in e or "exhausted" in e or "resource has been exhausted" in e:
        return "quota_exceeded"
    if "api_key_invalid" in e or "not valid" in e or "invalid api key" in e or "invalid key" in e:
        return "invalid"
    return "error"

# ─────────────────────────────────────────────────────────────
# CORE RETRY GENERATOR
# ─────────────────────────────────────────────────────────────

def generate_content_with_retry(prompt, model_name="gemini-2.5-flash",
                                  response_mime_type=None, files=None, timeout=15.0):
    """
    Tries each key in the rotation pool sequentially, persisting health status.
    Falls back to rule-based responses ONLY if ALL keys fail.
    Returns (response_text, None) on success, raises Exception on total failure.
    """
    import asyncio

    candidates = get_healthy_keys()
    if not candidates:
        raise RuntimeError("No Gemini API keys configured.")

    last_err = None
    for key in candidates:
        try:
            genai.configure(api_key=key)
            model = genai.GenerativeModel(model_name)

            gen_config = {}
            if response_mime_type:
                gen_config["response_mime_type"] = response_mime_type

            content_parts = []
            if files:
                content_parts.extend(files)
            content_parts.append(prompt)

            response = model.generate_content(
                content_parts if files else prompt,
                generation_config=gen_config if gen_config else None
            )
            # Success — mark key as active
            set_key_health(key, "active")
            return response.text

        except Exception as e:
            err_str = str(e)
            status = _classify_error(err_str)

            if status == "quota_exceeded":
                set_key_health(key, "quota_exceeded", COOLDOWN_QUOTA)
                print(f"[KeyPool] Key {_key_prefix(key)[:8]}... quota exceeded. Trying next.")
            elif status == "invalid":
                set_key_health(key, "invalid", COOLDOWN_INVALID)
                print(f"[KeyPool] Key {_key_prefix(key)[:8]}... invalid. Skipping.")
            else:
                # Network/timeout or generic error — short cooldown
                set_key_health(key, "timeout", COOLDOWN_TIMEOUT)
                print(f"[KeyPool] Key {_key_prefix(key)[:8]}... error: {err_str[:60]}. Trying next.")
            last_err = e

    raise RuntimeError(f"All Gemini API keys failed. Last error: {last_err}")

# ─────────────────────────────────────────────────────────────
# FAST-PATH LOCAL RULE ENGINE (0 LATENCY & HUMANISED TALK)
# ─────────────────────────────────────────────────────────────

def get_kb_prices_and_fees():
    """
    Parses the current knowledge base settings for pricing details.
    Defaults to 5% fee, $20 WhatsApp, $30 Telegram.
    """
    import re
    kb = db.get_setting("knowledge_base", "")
    
    # Defaults
    mm_fee = "5%"
    wp_price = "$20"
    tg_price = "$30"
    
    if not kb:
        return mm_fee, wp_price, tg_price
        
    # Match MM fee e.g. "5% secure fee" or "fee is 5%" or "commission: 5%"
    mm_match = re.search(r'(?:middleman|mm|escrow)\s+(?:fee|charge|rate|commission|cut)[^\d]*(\d+%)', kb, re.IGNORECASE)
    if not mm_match:
        mm_match = re.search(r'(\d+%)[^\d]*(?:middleman|mm|escrow)', kb, re.IGNORECASE)
    if mm_match:
        mm_fee = mm_match.group(1)
        
    # Match WhatsApp price e.g. "WhatsApp accounts start at $20" or "WhatsApp: $20"
    wp_match = re.search(r'(?:whatsapp|wp)[^\d]*(\$\d+|\d+\s*\$)', kb, re.IGNORECASE)
    if wp_match:
        wp_price = wp_match.group(1)
        
    # Match Telegram price e.g. "Telegram channels start at $30" or "Telegram: $30"
    tg_match = re.search(r'(?:telegram|tg)[^\d]*(\$\d+|\d+\s*\$)', kb, re.IGNORECASE)
    if tg_match:
        tg_price = tg_match.group(1)
        
    return mm_fee, wp_price, tg_price

def check_fast_path_query(message_text, status_mode="focus", chat_history=None, contact_name=""):
    """
    Analyzes message locally against common transactional intents.
    Returns (reply_text, intent_label) if matched, otherwise None.
    Computes in < 1ms for near-0 latency with natural Hinglish/English variations.
    """
    msg = message_text.lower().strip()
    
    # 1. Detect if Hinglish
    hinglish_keywords = ["bhai", "kya", "hai", "kitna", "tu", "kese", "chal", "hal", "deta", "tera", "naam", "ko", "se", "aur", "toh", "dost", "kon", "kab", "kuch", "kam", "yoo", "fee", "setup", "kar"]
    is_hinglish = any(w in msg.split() for w in hinglish_keywords) or any(x in msg for x in ["kya ", " hai", "kitne", "bhaiya", "tuu", "karta"])
    
    # 2. Extract current KB prices dynamically
    mm_fee, wp_price, tg_price = get_kb_prices_and_fees()
    
    # 3. Status message depending on mode & language
    status_lower = status_mode.lower()
    if is_hinglish:
        status_map = {
            "sleeping": "CatVos abhi rest kar rahe hain. Subah active hote hi aapse contact karenge.",
            "busy": "CatVos abhi ek high-priority deal setup me busy hain.",
            "focus": "CatVos abhi offline focus deep-work me hain.",
            "travel": "CatVos travel kar rahe hain limited connection ke sath. Aate hi reply denge.",
            "online": "CatVos online hain par dusri check chats me busy hain. Main notifications trigger kar deta hu.",
            "vacation": "CatVos vacation par hain, wo check karke respond karenge thoda delay se.",
        }
        status_msg = status_map.get(status_lower, "CatVos abhi offline/unavailable hain.")
    else:
        status_map = {
            "sleeping": "CatVos is currently offline resting. He will get back to you first thing in the morning.",
            "busy": "CatVos is currently in a high-priority escrow session.",
            "focus": "CatVos is in deep focus work mode right now.",
            "travel": "CatVos is traveling with limited connectivity. Expect a reply soon.",
            "online": "CatVos is online but active in another chat session.",
            "vacation": "CatVos is on vacation but I'll make sure he sees this.",
        }
        status_msg = status_map.get(status_lower, "CatVos is currently away.")

    # 4. Intent checks
    
    # Intent A: Middleman fees/rates
    is_mm_intent = any(x in msg for x in ["mm", "middleman", "escrow", "secure fee", "safety fee", "safe deal"])
    is_fee_query = any(x in msg for x in ["fee", "charge", "commission", "rate", "percent", "charges", "cut", "kese", "kitna", "cost", "price"])
    if is_mm_intent and is_fee_query:
        if is_hinglish:
            replies = [
                f"Middleman secure escrow coordination ki fee deal value ka standard {mm_fee} secure charge hai. {status_msg}",
                f"CatVos middleman deal coordination ka secure flat fee {mm_fee} rate charge karte hain. Jaise hi wo active honge setup details forward kar denge.",
                f"Safe transactions coordinate karne ke liye middleman fee {mm_fee} hai. Aap deal information ready rakhiye, active hote hi CatVos start kar denge!"
            ]
        else:
            replies = [
                f"Our safe middleman coordination service carries a secure {mm_fee} fee. {status_msg}",
                f"The fee for middleman deals is flat {mm_fee} of the deal volume to ensure a fully secured escrow. CatVos will guide you through details shortly.",
                f"For escrow setups, the secure middleman charge is {mm_fee}. CatVos will get back to you soon to set up the deal!"
            ]
        return random.choice(replies), "mm_fees"

    # Intent B: WhatsApp / Telegram Account Pricing / Buying
    is_wp = any(x in msg for x in ["wp", "whatsapp"])
    is_tg = any(x in msg for x in ["tg", "telegram", "channel"])
    is_alt = any(x in msg for x in ["alt", "account", "buy", "sell", "kitne", "rate", "price", "stock", "chahiye", "start", "cost", "much", "how much", "rates", "pricing", "charges", "value", "have", "deta", "hai", "pass", "available", "number", "options"])
    if (is_wp or is_tg) and is_alt:
        if is_hinglish:
            if is_wp and not is_tg:
                replies = [
                    f"Haan! WhatsApp alts available hain stock mein. CatVos aate hi aapko full catalog aur rates directly share karenge — {status_msg}",
                    f"Yes, WhatsApp fresh accounts ka stock available hai. CatVos online hote hi direct details aur options aapke saath discuss karenge!",
                ]
            elif is_tg and not is_wp:
                replies = [
                    f"Haan! Telegram channels/alts available hain. CatVos aate hi fresh catalog aur specifications directly share karenge — {status_msg}",
                    f"Yes, Telegram channels aur groups ka fresh stock ready hai. CatVos aate hi pricing aur options aapke saath coordinate karenge!",
                ]
            else:
                replies = [
                    f"Haan! WhatsApp aur Telegram dono ke accounts/channels available hain. CatVos aate hi rates aur options directly share karenge.",
                    f"Yes, WP alts aur TG channels dono available hain stock mein. CatVos aate hi directly details discuss karenge!",
                ]
        else:
            if is_wp and not is_tg:
                replies = [
                    f"Yes! WhatsApp alts are available in stock. CatVos will share the full catalog and pricing with you directly as soon as he is online — {status_msg}",
                    f"Yes, we have WhatsApp fresh accounts available. CatVos will coordinate the options and rates with you directly once he is back!",
                ]
            elif is_tg and not is_wp:
                replies = [
                    f"Yes! Telegram channels and groups are available. CatVos will walk you through the catalog and rates directly as soon as he is online — {status_msg}",
                    f"Yes, we have Telegram channels in stock. CatVos will discuss the specs and pricing with you directly once he is back!",
                ]
            else:
                replies = [
                    f"Yes! Both WhatsApp alts and Telegram channels are available. CatVos will share the full listing and rates with you directly as soon as he is online.",
                    f"Yes, we have both WP accounts and TG channels in stock. CatVos will get you the details and options as soon as he is back!",
                ]
        return random.choice(replies), "account_pricing"

    # Intent F: Video Editing / Graphics Design / "edt"
    is_edit_query = (
        any(x in msg for x in ["edit", "editing", "edt", "video edit", "graphic design", "video", "graphics",
                                "thumbnail", "logo", "banner", "intro", "outro",
                                "banate ho", "banata hai", "karte ho", "karta hai"]) and
        not any(x in msg for x in ["website", "web dev", "web design", "webpage", "webapp", "landing page"])
    )
    if is_edit_query:
        is_custom = any(x in msg for x in ["custom", "customize", "customise", "apna", "mere hisab", "customised"])
        if is_custom:
            if is_hinglish:
                reply = (
                    "Yes, we actively provide premium video editing and graphic design services.\n\n"
                    "Customized requirements ke liye kindly wait kijiye. CatVos active hote hi aapse direct coordinate karenge aur project details discuss karenge.\n\n"
                    "In the meantime, you can explore our style preview channel: @previewcom (telegram)"
                )
            else:
                reply = (
                    "Yes, we actively provide premium video editing and graphic design services.\n\n"
                    "For customized edits or custom workflows, kindly wait. CatVos will connect with you directly to discuss custom requirements and your project brief once he is online.\n\n"
                    "In the meantime, you can check our style preview channel: @previewcom (telegram)"
                )
            return reply, "edit_custom"
        else:
            if is_hinglish:
                reply = (
                    "Yes, we actively provide premium video editing and graphic design services.\n\n"
                    "Aap niche diye gaye link se humara preview channel visit kijiye aur wahan se koi bhi edit style select ya choose kar lijiye:\n"
                    "👉 @previewcom (telegram)\n\n"
                    "Agar customize edit chahiye, toh kindly wait kijiye. CatVos online aate hi aapse direct project brief discuss karenge."
                )
            else:
                reply = (
                    "Yes, we actively provide premium video editing and graphic design services.\n\n"
                    "Please visit our preview channel using the link/button below to select or choose your preferred editing style:\n"
                    "👉 @previewcom (telegram)\n\n"
                    "If you require fully customized design/video work, kindly wait. CatVos will coordinate with you directly to discuss your project brief as soon as he is back online."
                )
            return reply, "edit_preview"

    # Intent G: Developer / Creator / Bot Setup / Coet Access
    is_dev_query = any(x in msg for x in ["dev", "developer", "creator", "created you", "creates you", "create you", "who creates", "who create", "made you", "who made", "who created", "setup you", "set up you", "deploy you", "get this bot", "buy this bot", "how to setup", "who setup", "who is shinichiro", "kisne banaya", "kisne banaye", "kisne bnaya", "kaun banaya", "kon banaya", "developer kaun", "developer kon", "coet ka access", "coet access", "bot access", "bot chahiye", "access chahiye", "kaise milega", "kese milega", "setup chahiye", "deploy chahiye", "clone", "copy bot", "tujh jaisa", "tujh jesa"])
    if is_dev_query:
        if is_hinglish:
            reply = (
                "Main Coet hu, CatVos ka personal assistant. Is autonomous AI digital twin manager ko lead engineer shinichiro ne develop aur deploy kiya hai (telegram: @shinichirofr).\n\n"
                "Agar aap bhi Coet ka access chahte hain ya apne account/business ke liye aisa powerful AI manager deploy karwana chahte hain, toh lead developer @shinichirofr se contact kijiye!"
            )
        else:
            reply = (
                "I'm Coet, CatVos's manager. This autonomous AI digital twin manager is developed and deployed by the lead engineer shinichiro (telegram: @shinichirofr).\n\n"
                "If you would like to purchase a commercial license, get access to Coet, or deploy this automated AI digital twin manager on your personal account, contact the lead developer @shinichirofr directly!"
            )
        return reply, "developer_info"

    # Intent C: Who are you / Identity / Presence check ("coet?", "u there?", etc.)
    if any(x in msg for x in ["tu kon", "tuu kon", "tu kaun", "tuu kaun", "who are you", "who is this", "naam kya", "your name",
                               "kya kam", "kya kaam", "kaam kya", "what do you do", "what services",
                               "coet", "u there", "you there", "hello?", "anyone", "koi hai", "koi h"]):
        if is_hinglish:
            replies = [
                f"Haan main yahan hu! Main CatVos ka personal manager Coet hu. Unke business transactions, WhatsApp/Telegram accounts queries aur middleman deals handle karta hu. {status_msg} Bataiye kya kaam tha?",
                f"Ji main Coet hu, CatVos ka manager! {status_msg} Kuch kaam tha toh yahan message chhod dijiye, main forward kar dunga."
            ]
        else:
            replies = [
                f"Yes, I'm here! I'm Coet, CatVos's executive manager. I handle his transactions, account stocks, and client communications. {status_msg} How can I help you?",
                f"This is Coet, CatVos's business manager. I manage escrow deals, account sales, and communications. {status_msg} What can I do for you?"
            ]
        return random.choice(replies), "identity"


    # Intent D: Services Coordination (General services confirmation)
    is_webdev = any(x in msg for x in ["website", "web dev", "web design", "webpage", "webapp", "landing page", "site"])
    is_design = any(x in msg for x in ["design", "designing", "designs", "graphic"])
    is_service = any(x in msg for x in ["middleman", "escrow", " mm ", "alt"]) or is_webdev or is_design
    is_offering = any(x in msg for x in ["deta", "offer", "karte", "provide", "provides", "do you", "service", "services", "selling", "karte ho", "milega", "available"])
    if is_service and is_offering:
        if is_webdev:
            label = "website development"
        elif is_design:
            label = "graphic design and creative services"
        elif "middleman" in msg or "escrow" in msg or " mm " in msg:
            label = "middleman/escrow services"
        else:
            label = "services"

        if is_hinglish:
            replies = [
                f"Haan! Hum {label} actively provide karte hain. CatVos aate hi details aur pricing aapke saath direct discuss karenge — {status_msg} Tab tak requirements yahan drop kar dijiye!",
                f"Yes, {label} available hai. Jaise hi CatVos online aayenge, aapke project ke baare mein sab discuss kar denge. Requirements yahan leave kar dijiye!"
            ]
        else:
            replies = [
                f"Yes! We actively provide {label}. CatVos will connect with you directly to discuss your requirements and pricing — {status_msg} Please leave your details here in the meantime!",
                f"Yes, we offer {label}. CatVos will reach out to discuss your project in detail as soon as he is back online. Feel free to drop your requirements here!"
            ]
        return random.choice(replies), "services_check"


    # Intent E: Basic Greetings
    if any(w in msg.split() for w in ["hi", "hello", "hey", "yo", "hii", "hiii", "heyy", "yoo"]) or any(x in msg for x in ["kya hal", "kya chal", "how are you", "kya haal"]):
        if is_hinglish:
            replies = [
                f"Hey! Sab badhiya. Main CatVos ka manager Coet hu. {status_msg} Bataiye, kya kaam tha?",
                f"Hello! Sab safe and sound. CatVos ka manager Coet here. {status_msg} Kuch urgent transaction/deal setup tha?"
            ]
        else:
            replies = [
                f"Hello there! I'm Coet, CatVos's manager. {status_msg} How can I assist you today?",
                f"Hey! Coet here, CatVos's manager. {status_msg} Leave your message and we'll address it right away."
            ]
        return random.choice(replies), "greeting"

    return None

# ─────────────────────────────────────────────────────────────
# RULE-BASED FALLBACK
# ─────────────────────────────────────────────────────────────

def get_rule_based_fallback(message_text, status_mode, chat_history, contact_name=""):
    """
    Smart contextual fallback when all Gemini keys are exhausted.
    Always sounds like Coet — never like a generic bot.
    """
    msg = message_text.lower().strip()

    # 1. Services inquiry — direct confirmation via Fast-Path Engine (highest priority)
    fast_path = check_fast_path_query(message_text, status_mode, chat_history, contact_name)
    if fast_path:
        return fast_path[0]

    # 2. Context flags
    is_greeting       = any(x in msg for x in ["hello", "hi", "hey", "hola", "yo", "sup", "hii", "hiii"])
    is_identity_query = any(x in msg for x in ["who is this", "who are you", "who am i talking", "is this", "are you"])
    is_urgent         = any(x in msg for x in ["urgent", "emergency", "asap", "quick", "immediate", "please reply", "sos"])

    # 3. Check if Coet already introduced itself (no repeat introductions)
    has_introduced = False
    for m in chat_history:
        if m.get('sender') in ('assistant',) and any(x in m.get('text', '').lower() for x in ["coet", "catvos's manager", "manager"]):
            has_introduced = True
            break

    # 4. Status messages (concise)
    status_lower = status_mode.lower()
    status_map = {
        "sleeping": "CatVos is offline resting. He'll get back to you in the morning.",
        "busy":     "He's in a high-priority session right now. I'll pass this on.",
        "focus":    "He's in deep work mode. I'll alert him as soon as he's done.",
        "travel":   "He's traveling right now with limited access. Expect a reply soon.",
        "online":   "He's currently busy in another deal. I've logged your message.",
        "vacation": "He's on vacation but I'll make sure he sees this.",
    }
    status_msg = status_map.get(status_lower, "He's away at the moment. I've noted your message.")

    # 5. Compose response
    if is_identity_query:
        return f"I'm Coet, CatVos's manager. I handle his communications. {status_msg}"

    if is_urgent:
        if has_introduced:
            return f"Understood — this is urgent. I'll alert him right away. {status_msg}"
        return f"I'm Coet, CatVos's manager. I see this is urgent. {status_msg}"

    # Simple greeting with no prior introduction
    if is_greeting and not has_introduced:
        name_part = f"Hi{' ' + contact_name if contact_name else ''}. " if contact_name else "Hey. "
        return f"{name_part}I'm Coet, CatVos's manager. {status_msg}"

    # Follow-up message — no greeting repeat, just status
    if has_introduced:
        return status_msg

    return f"I'm Coet, CatVos's manager. {status_msg}"

# ─────────────────────────────────────────────────────────────
# MESSAGE ANALYSIS
# ─────────────────────────────────────────────────────────────

def analyze_incoming_message(message_text, sender_info, chat_history, contact_notes=""):
    """Analyze incoming message for sentiment, priority, language, tone, personality."""
    history_str = ""
    for msg in chat_history[-5:]:
        sender_label = "Owner" if msg['sender'] == 'owner' else ("Assistant" if msg['sender'] == 'assistant' else "Contact")
        history_str += f"{sender_label}: {msg['text']}\n"

    prompt = f"""
    You are an advanced communications intelligence module. Analyze the following incoming Telegram message.

    SENDER INFO:
    Name: {sender_info.get('first_name', '')} {sender_info.get('last_name', '')}
    Username: @{sender_info.get('username', '')}
    Current Category: {sender_info.get('category', 'unknown')}
    Existing Relationship Notes: {contact_notes}

    RECENT CHAT HISTORY:
    {history_str}

    INCOMING MESSAGE:
    "{message_text}"

    Tasks:
    1. Sentiment: (happiness, frustration, anger, sadness, excitement, urgency, neutral, confusion)
    2. Priority Level: critical/important/normal/low
       - 'critical' = true emergencies, security alerts, game-changing business opportunities.
       - 'important' = active business, time-sensitive queries, VIP clients.
       - 'normal' = casual discussion, standard questions.
       - 'low' = spam, casual greetings, notifications.
    3. Category Suggestion: family/friend/client/business_partner/vip/team_member/unknown
    4. Relationship Insights: brief commitment, meeting, or action item note.
    5. Language: english/hinglish/hindi/other (hinglish = Hindi words in Roman script)
    6. Tone: casual/formal/angry/impatient/polite/urgent
    7. Suggested Personality: Casual Friend / Premium Executive / Firm & Direct / Empathetic Support / Warm & Helpful

    Output JSON only:
    {{
        "sentiment": "...",
        "priority": "...",
        "suggested_category": "...",
        "relationship_insight": "...",
        "language": "...",
        "tone": "...",
        "suggested_personality": "..."
    }}
    """

    try:
        text = generate_content_with_retry(prompt, response_mime_type="application/json")
        return json.loads(text)
    except Exception as e:
        print(f"Error analyzing message: {e}")
        return {
            "sentiment": "neutral",
            "priority": "normal",
            "suggested_category": sender_info.get('category', 'unknown'),
            "relationship_insight": "",
            "language": "english",
            "tone": "casual",
            "suggested_personality": "Warm & Helpful"
        }

# ─────────────────────────────────────────────────────────────
# UNIFIED ANALYSIS + RESPONSE GENERATOR
# ─────────────────────────────────────────────────────────────

def generate_analysis_and_response(message_text, sender_info, chat_history, status_mode,
                                    contact_notes="", custom_rules=None,
                                    has_introduced=False, is_followup=False):
    """
    Single Gemini call: analyze + draft response.
    Uses dynamic key rotation pool with failover.
    """
    # Fast-Path Local Rule Engine — skip Gemini for common intents
    fast_path = check_fast_path_query(
        message_text=message_text, 
        status_mode=status_mode, 
        chat_history=chat_history, 
        contact_name=sender_info.get('first_name', '')
    )
    if fast_path:
        reply_text, intent = fast_path
        # Return simulated analysis instantly (0 latency!)
        is_hinglish = "bhai" in message_text.lower() or "kya" in message_text.lower() or "hai" in message_text.lower() or "kitna" in message_text.lower() or "kese" in message_text.lower() or "tu" in message_text.lower()
        return {
            "sentiment": "neutral",
            "priority": "important" if intent in ["mm_fees", "account_pricing"] else "normal",
            "suggested_category": sender_info.get('category', 'unknown'),
            "relationship_insight": f"Inquired about {intent.replace('_', ' ')}",
            "language": "hinglish" if is_hinglish else "english",
            "tone": "polite",
            "suggested_personality": "Warm & Helpful",
            "draft_reply": reply_text,
            "schedule_reminder": None
        }

    # Format chat history
    history_str = ""
    for msg in chat_history[-6:]:
        label = "Owner (CatVos)" if msg['sender'] == 'owner' else ("Assistant (Coet)" if msg['sender'] == 'assistant' else "Contact")
        history_str += f"{label}: {msg['text']}\n"

    # Extract dialogue flow since last owner reply
    contact_sequence = []
    for msg in chat_history:
        if msg['sender'] == 'owner':
            contact_sequence = []
        elif msg['sender'] == 'contact':
            contact_sequence.append(msg['text'])
    if not contact_sequence or contact_sequence[-1] != message_text:
        contact_sequence.append(message_text)
    contact_flow = " -> ".join(contact_sequence)

    # Load settings
    tone_profile          = db.get_setting("tone_profile", "concise")
    smart_hinglish_enabled = db.get_setting("smart_hinglish", "1") == "1"
    knowledge_base        = db.get_setting("knowledge_base", "")
    personality           = custom_rules or (
        "You are Coet, CatVos's elite executive assistant and manager. "
        "Keep replies warm, professional, respectful, concise, and human-like. "
        "Never mention you are an AI or Gemini."
    )

    tone_desc = (
        "Keep replies strictly to 1 sentence maximum. Be extremely concise, direct, and short."
        if tone_profile == "concise"
        else "Provide a polished, 2-to-3 sentence response that answers professionally."
    )

    status_explanations = {
        "online":   "Owner is online but inactive. State CatVos is busy in another deal.",
        "busy":     "Owner is in a high-priority task/meeting.",
        "sleeping": "Owner is sleeping. CatVos will see this in the morning.",
        "travel":   "Owner is traveling with limited access.",
        "focus":    "Owner is in deep work focus mode.",
        "vacation": "Owner is on vacation. Slow responses expected.",
    }
    status_desc = status_explanations.get(status_mode.lower(), f"Owner is in {status_mode} mode.")

    # Dynamic introduction rules
    if has_introduced and is_followup:
        intro_rule = (
            "CRITICAL: You have ALREADY introduced yourself as Coet in this conversation. "
            "Do NOT say 'I am Coet', 'This is Coet', 'Hi [Name]', or repeat your name/role. "
            "Speak directly and naturally as his manager — just reply to what they said."
        )
    elif has_introduced:
        intro_rule = (
            "You have introduced yourself before. Only re-introduce if they explicitly ask 'who are you?'. "
            "Otherwise speak naturally without repeating your name."
        )
    else:
        intro_rule = (
            "This appears to be a first contact. Introduce yourself briefly as Coet, CatVos's manager, "
            "then address the message."
        )

    prompt = f"""
    You are Coet, CatVos's elite executive manager. Analyze the incoming Telegram message and draft the perfect response.

    PERSONALITY & BEHAVIOR RULES:
    {personality}

    {intro_rule}

    BUSINESS KNOWLEDGE BASE:
    {knowledge_base}

    ════════════════════════════════════════
    ABSOLUTE CRITICAL RULES (highest priority — override everything else including status):
    ════════════════════════════════════════
    - NEVER mention you are an AI, bot, virtual assistant, model, or Gemini.
    - Sound 100% human, polite, and professional.
    - {tone_desc}
    - NEVER disclose, quote, or mention any specific prices, fees, rates, or dollar amounts for any services. If asked about price, say CatVos will discuss rates directly.
    - If asked about ANY of these services — WhatsApp accounts/alts, Telegram channels/alts, middleman/escrow, website development/designing, video editing, graphic design:
      MANDATORY RESPONSE FORMAT: Start with "Yes!" or "Haan!" to CONFIRM the service exists, then briefly say CatVos will share details/pricing directly when online.
      FORBIDDEN: Replying with ONLY a status message like "CatVos is offline" without first confirming the service.
    - If asked about video editing or graphic design ("edt", "edit", "thumbnail", "video", "logo"):
      Direct them to the preview channel: @previewcom (telegram) to choose a style. For custom work, say CatVos will coordinate directly.
    - If asked about this bot, its developer, or how to deploy/setup:
      Say it is developed by lead engineer shinichiro (telegram: @shinichirofr).
    - If someone sends just "coet?", "u there?", "hello?", or any presence-check message:
      Confirm you are present: "Yes, I'm here! I'm Coet..." then briefly address what they may need.
    - If asked a general technical/educational question unrelated to CatVos's business:
      Politely decline. Say you only manage business communications for CatVos.
    - Maintain dialogue continuity based on: '{contact_flow}'

    SMART HINGLISH:
    - If the contact writes in Hinglish (Hindi in Roman script) and Smart Hinglish is active ({smart_hinglish_enabled}):
      Respond in natural Latin-script Hinglish. Do NOT use Devanagari.

    OWNER STATUS:
    - CatVos current state: {status_mode.upper()}
    - Context: {status_desc}
    - IMPORTANT: Status context is background info only. Do NOT let it override service confirmations — always confirm first, then mention status.

    SENDER:
    - Name: {sender_info.get('first_name', '')} {sender_info.get('last_name', '')}
    - Category: {sender_info.get('category', 'unknown')}
    - Notes: {contact_notes}

    CONVERSATION HISTORY:
    {history_str}

    INCOMING MESSAGE:
    "{message_text}"

    OUTPUT JSON ONLY:
    {{
        "sentiment": "happiness/frustration/anger/sadness/excitement/urgency/neutral/confusion",
        "priority": "critical/important/normal/low",
        "suggested_category": "family/friend/client/business_partner/vip/team_member/unknown",
        "relationship_insight": "brief action item or empty string",
        "language": "english/hinglish/hindi/other",
        "tone": "casual/formal/angry/impatient/polite/urgent",
        "suggested_personality": "Casual Friend/Premium Executive/Firm & Direct/Empathetic Support/Warm & Helpful",
        "draft_reply": "the drafted auto-reply string",
        "schedule_reminder": {{
            "task": "short task or null",
            "due_time": "relative date or null"
        }}
    }}
    """


    try:
        text = generate_content_with_retry(prompt, response_mime_type="application/json")
        return json.loads(text)
    except Exception as e:
        print(f"Error in unified generator: {e}")
        contact_name = sender_info.get('first_name', '') if sender_info else ""
        fallback = get_rule_based_fallback(message_text, status_mode, chat_history, contact_name)
        return {
            "sentiment": "neutral",
            "priority": "normal",
            "suggested_category": sender_info.get('category', 'unknown'),
            "relationship_insight": "",
            "language": "english",
            "tone": "casual",
            "suggested_personality": "Warm & Helpful",
            "draft_reply": fallback,
            "schedule_reminder": None
        }

# ─────────────────────────────────────────────────────────────
# DAILY BRIEFING
# ─────────────────────────────────────────────────────────────

def generate_daily_briefing(chat_logs):
    from datetime import datetime
    unique_ids = set()
    log_text = ""
    for msg in chat_logs:
        unique_ids.add(msg.get('telegram_id'))
        sender_name = f"{msg.get('first_name') or ''} {msg.get('last_name') or ''}".strip() or f"ID {msg.get('telegram_id')}"
        username_str = f" (@{msg.get('username')})" if msg.get('username') else ""
        role = (
            "Owner (CatVos)" if msg.get('sender') == 'owner'
            else ("Assistant (Coet)" if msg.get('sender') == 'assistant'
                  else f"Contact: {sender_name}{username_str}")
        )
        log_text += f"[{msg.get('timestamp')}] {role}: {msg.get('text')}\n"

    prompt = f"""
    You are Coet, CatVos's executive personal manager. Analyze the following conversation logs.

    CONVERSATION LOGS:
    {log_text}

    Draft an Elite Executive Daily Briefing as clean, structured JSON.
    Keep summaries professional, concise, and bulleted.

    JSON Schema:
    {{
        "date": "current date/time briefing was compiled",
        "total_contacts_active": {len(unique_ids)},
        "deal_pipeline": ["bullet about business opportunities or transaction updates"],
        "urgent_action_items": ["bullet of unanswered questions or pending owner follow-ups"],
        "relationship_vibe_summary": ["bullet summarizing customer emotions and VIP engagement"]
    }}

    Output JSON only. Do not wrap in markdown or quotes.
    """

    try:
        text = generate_content_with_retry(prompt, response_mime_type="application/json")
        return json.loads(text)
    except Exception as e:
        print(f"Error generating briefing: {e}")
        return {
            "date": __import__('datetime').datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            "total_contacts_active": len(unique_ids),
            "deal_pipeline": ["Failed to analyze — please retry shortly."],
            "urgent_action_items": ["Please review chats manually in the vault."],
            "relationship_vibe_summary": ["Sentiment analytics unavailable."]
        }

# ─────────────────────────────────────────────────────────────
# VOICE TRANSCRIPTION
# ─────────────────────────────────────────────────────────────

def transcribe_voice_note(file_path):
    try:
        # Upload file then transcribe using the best available key
        candidates = get_healthy_keys()
        if not candidates:
            return "[Voice Note — No API keys available]"
        
        last_err = None
        for key in candidates:
            try:
                genai.configure(api_key=key)
                audio_file = genai.upload_file(path=file_path)
                model = genai.GenerativeModel("gemini-2.5-flash")
                prompt = "Transcribe the audio precisely. Return ONLY the transcribed text with no comments or headers."
                response = model.generate_content([audio_file, prompt])
                try:
                    genai.delete_file(audio_file.name)
                except Exception:
                    pass
                set_key_health(key, "active")
                return response.text.strip()
            except Exception as e:
                err_str = str(e)
                status = _classify_error(err_str)
                cooldown = COOLDOWN_QUOTA if status == "quota_exceeded" else (COOLDOWN_INVALID if status == "invalid" else COOLDOWN_TIMEOUT)
                set_key_health(key, status, cooldown)
                last_err = e

        return f"[Voice Note — All keys failed: {last_err}]"
    except Exception as e:
        print(f"Error transcribing voice note: {e}")
        return "[Voice Note — Transcription error]"

# ─────────────────────────────────────────────────────────────
# RELATIONSHIP MEMORY CONSOLIDATION
# ─────────────────────────────────────────────────────────────

def consolidate_relationship_memory(chat_history, current_summary):
    history_str = ""
    for msg in chat_history[-15:]:
        label = ("Owner (CatVos)" if msg.get('sender') == 'owner'
                 else ("Assistant (Coet)" if msg.get('sender') == 'assistant'
                       else "Contact"))
        history_str += f"{label}: {msg.get('text')}\n"

    prompt = f"""
    You are an elite relationship intelligence engine. Review the conversation and update relationship commitments.

    CURRENT RELATIONSHIP SUMMARY:
    "{current_summary}"

    RECENT CHAT HISTORY:
    {history_str}

    Consolidate commitments, agreed terms, and business motivations.
    - If a price, deal, or service was agreed, note it.
    - If a follow-up was committed to, document it.
    - Keep it brief (bullet points or short paragraph).
    - If nothing new was agreed, output the existing summary exactly.

    Output raw summary text only. No markdown or quotes.
    """
    try:
        return generate_content_with_retry(prompt)
    except Exception as e:
        print(f"Error consolidating memory: {e}")
        return current_summary

# ─────────────────────────────────────────────────────────────
# KEY DIAGNOSTICS (used by /status command and API endpoint)
# ─────────────────────────────────────────────────────────────

def get_key_pool_status():
    """Return a list of key health records for all configured keys."""
    all_keys = get_all_keys()
    results = []
    for idx, key in enumerate(all_keys, 1):
        health = get_key_health(key)
        status = health["status"]
        until  = health["until"]
        cooldown_remaining = max(0, int(until - time.time())) if until > 0 else 0
        results.append({
            "index": idx,
            "prefix": key[:6] + "...",
            "status": status,
            "cooldown_remaining": cooldown_remaining
        })
    return results

def run_key_diagnostics():
    """
    Actively ping all keys with a lightweight request and update their health status.
    Returns updated key pool status.
    """
    all_keys = get_all_keys()
    results = []
    for idx, key in enumerate(all_keys, 1):
        try:
            genai.configure(api_key=key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            model.generate_content("ping", generation_config={"max_output_tokens": 1})
            set_key_health(key, "active")
            results.append({
                "index": idx,
                "prefix": key[:6] + "...",
                "status": "active",
                "cooldown_remaining": 0
            })
        except Exception as e:
            err_str = str(e)
            status = _classify_error(err_str)
            if status == "quota_exceeded":
                set_key_health(key, "quota_exceeded", COOLDOWN_QUOTA)
            elif status == "invalid":
                set_key_health(key, "invalid", COOLDOWN_INVALID)
            else:
                set_key_health(key, "timeout", COOLDOWN_TIMEOUT)
            health = get_key_health(key)
            cooldown_remaining = max(0, int(health["until"] - time.time())) if health["until"] > 0 else 0
            results.append({
                "index": idx,
                "prefix": key[:6] + "...",
                "status": status,
                "cooldown_remaining": cooldown_remaining
            })
    return results
