import os
import json
import time
import random
import threading
import re
import requests as _requests

# Pure REST-based Gemini caller — no grpc, no DLL dependencies
GENAI_AVAILABLE = True  # Always available via REST

from dotenv import load_dotenv
import db

load_dotenv()

# ─────────────────────────────────────────────────────────────
# KEY POOL MANAGEMENT
# ─────────────────────────────────────────────────────────────

# Cooldown periods (seconds)
COOLDOWN_QUOTA   = 60    # 60 seconds for quota exceeded (retry fast after daily reset)
COOLDOWN_TIMEOUT = 30    # 30 seconds for timeout/network error
COOLDOWN_INVALID = 3600  # 1 hour for invalid keys

GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_key_lock = threading.Lock()

def get_all_keys():
    """Return all API keys from environment and database in order."""
    keys = []
    # 1. Environment keys
    primary = os.getenv("GEMINI_API_KEY")
    if primary:
        keys.append(primary.strip())
    for idx in range(2, 11):
        key = os.getenv(f"GEMINI_API_KEY_{idx}")
        if key:
            keys.append(key.strip())
            
    # 2. Database keys
    db_keys_str = db.get_setting("gemini_keys", "[]")
    if db_keys_str:
        try:
            parsed = json.loads(db_keys_str)
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, str):
                        k = item.strip()
                        if k and k not in keys:
                            keys.append(k)
                    elif isinstance(item, dict) and "key" in item:
                        k = item["key"].strip()
                        if k and k not in keys:
                            keys.append(k)
        except Exception:
            # Fallback for comma-separated or newline-separated formats
            for line in db_keys_str.replace(",", "\n").split("\n"):
                k = line.strip()
                if k and k not in keys:
                    keys.append(k)
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
    """Return candidate keys: healthy keys only, shuffled. Degraded keys are skipped to ensure low latency."""
    all_keys = get_all_keys()
    healthy   = [k for k in all_keys if is_key_available(k)]
    random.shuffle(healthy)
    return healthy

def _classify_error(err_str):
    """Classify an API exception string into a standardised status."""
    e = err_str.lower()
    if "quota" in e or "429" in e or "rate" in e or "limit" in e or "exhausted" in e or "resource has been exhausted" in e:
        return "quota_exceeded"
    if "api_key_invalid" in e or "not valid" in e or "invalid api key" in e or "invalid key" in e:
        return "invalid"
    return "error"

# ─────────────────────────────────────────────────────────────
# CORE RETRY GENERATOR  (pure REST — no grpc/DLL dependency)
# ─────────────────────────────────────────────────────────────

def _gemini_rest_call(api_key, prompt, model_name=None,
                      response_mime_type=None, timeout=15.0):
    """
    Direct REST call to Gemini generateContent endpoint.
    Returns the response text string on success.
    Raises RuntimeError with HTTP status / error body on failure.
    """
    if model_name is None or model_name == "gemini-2.5-flash-lite":
        model_name = db.get_setting("gemini_model", "gemini-2.5-flash-lite")
        
    try:
        temp = float(db.get_setting("gemini_temperature", "0.85"))
    except Exception:
        temp = 0.85
        
    try:
        max_tokens = int(db.get_setting("gemini_max_tokens", "1500"))
    except Exception:
        max_tokens = 1500

    url = f"{GEMINI_REST_BASE}/{model_name}:generateContent?key={api_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temp, "maxOutputTokens": max_tokens}
    }
    if response_mime_type:
        body["generationConfig"]["responseMimeType"] = response_mime_type
    try:
        resp = _requests.post(url, json=body, timeout=timeout)
    except _requests.exceptions.Timeout:
        raise RuntimeError(f"Request timed out after {timeout}s")
    except _requests.exceptions.ConnectionError as ce:
        raise RuntimeError(f"Connection error: {ce}")

    if resp.status_code == 200:
        data = resp.json()
        candidates_list = data.get("candidates", [])
        if candidates_list:
            parts = candidates_list[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "")
        raise RuntimeError("Empty or malformed Gemini response.")
    elif resp.status_code == 429:
        body_txt = resp.text[:200]
        raise RuntimeError(f"429 quota exceeded: {body_txt}")
    elif resp.status_code in (400, 403):
        body_txt = resp.text[:200]
        raise RuntimeError(f"{resp.status_code} invalid key or bad request: {body_txt}")
    else:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")


def generate_content_with_retry(prompt, model_name=None,
                                  response_mime_type=None, files=None, timeout=15.0):
    """
    Tries each key in the rotation pool sequentially via pure REST.
    Falls back to rule-based responses ONLY if ALL keys fail.
    Returns response_text on success, raises Exception on total failure.
    """
    if model_name is None or model_name == "gemini-2.5-flash-lite":
        model_name = db.get_setting("gemini_model", "gemini-2.5-flash-lite")
    candidates = get_healthy_keys()
    if not candidates:
        raise RuntimeError("No healthy Gemini API keys available in the pool.")

    last_err = None
    for key in candidates:
        try:
            text = _gemini_rest_call(
                api_key=key,
                prompt=prompt,
                model_name=model_name,
                response_mime_type=response_mime_type,
                timeout=timeout
            )
            # Success — mark key as active
            set_key_health(key, "active")
            return text

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
                set_key_health(key, "timeout", COOLDOWN_TIMEOUT)
                print(f"[KeyPool] Key {_key_prefix(key)[:8]}... error: {err_str[:80]}. Trying next.")
            last_err = e

    raise RuntimeError(f"All healthy Gemini API keys failed. Last error: {last_err}")

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
    hinglish_keywords = ["bhai", "kya", "hai", "kitna", "tu", "kese", "chal", "hal", "deta", "tera", "naam", "ko", "se", "aur", "toh", "dost", "kon", "kab", "kuch", "kam", "yoo", "fee", "setup", "kar", "fir", "puch", "h", "koi", "hain", "yaar", "ab"]
    is_hinglish = any(w in msg.split() for w in hinglish_keywords) or any(x in msg for x in ["kya ", " hai", "kitne", "bhaiya", "tuu", "karta", "kon ho", "kaun ho"])
    
    # 2. Extract current KB prices dynamically
    mm_fee, wp_price, tg_price = get_kb_prices_and_fees()
    
    # 3. Status message depending on mode & language
    status_lower = status_mode.lower()
    # Short, casual status phrase for human-sounding replies
    casual_status_en = {
        "sleeping": "sleeping rn",
        "busy": "locked into a deal rn",
        "focus": "heads down in deep work rn",
        "travel": "traveling rn, limited signal",
        "online": "occupied in another chat rn",
        "vacation": "on vacation rn",
    }.get(status_lower, "away rn")
    casual_status_hi = {
        "sleeping": "so raha hai abhi",
        "busy": "ek deal mein busy hai abhi",
        "focus": "deep work mein hai abhi",
        "travel": "travel pe hai abhi, signal kam hai",
        "online": "doosri chat mein hai abhi",
        "vacation": "vacation pe hai abhi",
    }.get(status_lower, "bahar hai abhi")
    if is_hinglish:
        status_msg = f"CatVos {casual_status_hi}"
    else:
        status_msg = f"CatVos is {casual_status_en}"


    # 4. Intent checks
    
    # Intent A: Middleman fees/rates
    is_mm_intent = any(x in msg for x in ["mm", "middleman", "escrow", "secure fee", "safety fee", "safe deal"])
    is_fee_query = any(x in msg for x in ["fee", "charge", "commission", "rate", "percent", "charges", "cut", "kese", "kitna", "cost", "price"])
    if is_mm_intent and is_fee_query:
        if is_hinglish:
            replies = [
                f"haan bhai MM deal ke liye fee {mm_fee} hai. secure escrow deal setup karna chahte ho? CatVos {casual_status_hi} — aate hi directly coordinate karenge",
                f"middleman fee {mm_fee} hai yaar. {casual_status_hi} CatVos, aate hi deal setup detail discuss kar lena unse directly",
                f"MM fee {mm_fee} hai. deal ready karo, CatVos {casual_status_hi} — free hote hi sab setup kar denge!"
            ]
        else:
            replies = [
                f"middleman fee is {mm_fee} for secure escrow coordination. CatVos is {casual_status_en} but he'll walk you through the setup directly once he's free!",
                f"yep, MM fee is {mm_fee}. CatVos is {casual_status_en} — he'll hit you up to get the deal set up as soon as he's back",
                f"escrow fee is {mm_fee}. get your deal details ready and CatVos will coordinate everything with you directly!"
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
                    f"haan bhai! WP alts hain stock mein. CatVos {casual_status_hi} — free hote hi full catalog aur options directly share kar denge. tab tak kuch aur batao?",
                    f"yep WP fresh accounts available hain. CatVos {casual_status_hi}, aate hi directly pricing aur details discuss kar lena",
                    f"haan hain! WhatsApp alts ka fresh stock available hai. CatVos aate hi sab details send kar denge directly — {casual_status_hi} abhi",
                ]
            elif is_tg and not is_wp:
                replies = [
                    f"haan bhai! TG channels/alts available hain. CatVos {casual_status_hi} — aate hi catalog aur pricing directly share kar denge",
                    f"yep Telegram channels ready hain. CatVos {casual_status_hi}, free hote hi sab discuss kar lena unse directly",
                    f"haan Telegram channels ka fresh stock hai. CatVos aate hi details aur options bata denge — {casual_status_hi} abhi",
                ]
            else:
                replies = [
                    f"haan bhai! WP aur TG dono available hain. CatVos {casual_status_hi} — aate hi directly rates aur options share kar denge",
                    f"yep dono hain stock mein — WP alts bhi TG channels bhi. CatVos free hote hi details discuss kar lena directly",
                ]
        else:
            if is_wp and not is_tg:
                replies = [
                    f"yeah! we got WP alts in stock. CatVos is {casual_status_en} but he'll hit you up with the full catalog and pricing directly once he's free. anything else?",
                    f"yep, WhatsApp fresh accounts are available. CatVos will get you the details and options directly as soon as he's back — {casual_status_en}",
                    f"yeah we have WP alts! CatVos is {casual_status_en}, he'll share the catalog and pricing directly once he's around",
                ]
            elif is_tg and not is_wp:
                replies = [
                    f"yeah! Telegram channels are available. CatVos is {casual_status_en} but he'll walk you through the specs and pricing directly once he's free",
                    f"yep we have TG channels in stock. CatVos will hit you up with the details directly as soon as he's back — {casual_status_en}",
                ]
            else:
                replies = [
                    f"yeah! got both WP alts and TG channels. CatVos is {casual_status_en} — he'll get you the full details on both once he's free",
                    f"yep both available — WP accounts and TG channels. CatVos will share everything directly as soon as he's back!",
                ]
        return random.choice(replies), "account_pricing"


    # Intent F: Video Editing / Graphics Design / "edt"
    # NOTE: website/web development queries are intentionally EXCLUDED here — they are handled by Intent D.
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
                    "haan bhai! video editing aur graphic design dono karte hain.\n\n"
                    "custom work ke liye CatVos aate hi directly coordinate karenge — requirements yahan drop kar do aur wo personally discuss karenge.\n\n"
                    "tab tak preview dekh lo: @previewcom (telegram)"
                )
            else:
                reply = (
                    "yeah we do video editing and graphic design!\n\n"
                    "for custom work, CatVos will reach out directly to discuss your requirements and brief. drop your details here and he'll pick it up once he's free.\n\n"
                    "in the meantime check out our preview channel: @previewcom (telegram)"
                )
            return reply, "edit_custom"
        else:
            if is_hinglish:
                reply = (
                    "haan bhai, design aur editing ke preview ke liye hamara link dekh sakte ho: @previewcom (telegram)\n\n"
                    "agar customized design/video work karwana hai toh please details share kar do, CatVos aate hi directly contact kar lega."
                )
            else:
                reply = (
                    "Yes, you can browse our design and editing portfolio on our preview channel: @previewcom (telegram)\n\n"
                    "If you need customized design or video work, please leave your project brief here. CatVos will coordinate with you directly once he is back online."
                )
            return reply, "edit_preview"

    # Intent G: Developer / Creator / Bot Setup / Coet Access
    is_dev_query = any(x in msg for x in ["dev", "developer", "creator", "created you", "creates you", "create you", "who creates", "who create", "made you", "who made", "who created", "setup you", "set up you", "deploy you", "get this bot", "buy this bot", "how to setup", "who setup", "who is shinichiro", "kisne banaya", "kisne banaye", "kisne bnaya", "kaun banaya", "kon banaya", "developer kaun", "developer kon", "coet ka access", "coet access", "bot access", "bot chahiye", "access chahiye", "kaise milega", "kese milega", "setup chahiye", "deploy chahiye", "clone", "copy bot", "tujh jaisa", "tujh jesa"])
    if is_dev_query:
        if is_hinglish:
            reply = (
                "main Coet hu, CatVos ka bhai — uski messages handle karta hu. mujhe shinichiro ne banaya hai, woh lead developer hain (telegram: @shinichirofr).\n\n"
                "agar tujhe bhi kuch aisa chahiye apne account pe, toh seedha @shinichirofr se baat kar!"
            )
        else:
            reply = (
                "I'm Coet — CatVos's manager, I handle his messages. I was built by shinichiro, the lead developer (telegram: @shinichirofr).\n\n"
                "if you want something like this set up on your account, hit up @shinichirofr directly!"
            )
        return reply, "developer_info"

    # Intent C: Who are you / Identity / Presence check
    if any(x in msg for x in ["tu kon", "tuu kon", "tu kaun", "tuu kaun", "who are you", "who is this", "naam kya", "your name",
                               "kya kam", "kya kaam", "kaam kya", "what do you do", "what services",
                               "coet", "u there", "you there", "hello?", "anyone", "koi hai", "koi h"]):
        if is_hinglish:
            replies = [
                f"haan yaar main yahan hu! main Coet hu — CatVos ka bhai, uski messages handle karta hu jab wo busy hota hai. {casual_status_hi} abhi. kya kaam tha?",
                f"ha bhai main hu! Coet — CatVos ka close associate. {casual_status_hi} abhi wo, main sambhal raha hu. bolo?",
                f"present! main Coet hu, CatVos ka yaar. uske deals aur messages handle karta hu. kya chahiye tujhe?"
            ]
        else:
            replies = [
                f"yeah I'm here! I'm Coet — CatVos's manager, I handle his messages when he's busy. he's {casual_status_en}. what's up?",
                f"yo, I'm here. Coet — I'm CatVos's close associate, handling things for him. he's {casual_status_en} rn. what do you need?",
                f"yep! Coet here — I run CatVos's business stuff when he's away. he's {casual_status_en}. what can I help with?"
            ]
        return random.choice(replies), "identity"


    # Intent D: Services Coordination (General services confirmation)
    is_webdev = any(x in msg for x in ["website", "web dev", "web design", "webpage", "webapp", "landing page", "site"])
    is_design = any(x in msg for x in ["design", "designing", "designs", "graphic"])
    is_service = any(x in msg for x in ["middleman", "escrow", " mm ", "alt"]) or is_webdev or is_design
    is_offering = any(x in msg for x in ["deta", "offer", "karte", "provide", "provides", "do you", "service", "services", "selling", "karte ho", "milega", "available"])
    if is_service and is_offering:
        if is_webdev:
            label_en = "website development"
            label_hi = "website development"
        elif is_design:
            label_en = "graphic design and creative work"
            label_hi = "graphic design aur creative work"
        elif "middleman" in msg or "escrow" in msg or " mm " in msg:
            label_en = "middleman/escrow deals"
            label_hi = "middleman/escrow deals"
        else:
            label_en = "those services"
            label_hi = "woh services"

        if is_hinglish:
            replies = [
                f"haan bhai! {label_hi} karte hain. CatVos {casual_status_hi} — aate hi directly requirements aur pricing discuss kar lena. tab tak details yahan drop kar do!",
                f"yep {label_hi} available hai. CatVos free hote hi directly baat karte hain tere saath — {casual_status_hi} abhi. kuch aur batao?"
            ]
        else:
            replies = [
                f"yeah we do {label_en}! CatVos is {casual_status_en} but he'll reach out directly to discuss your requirements and pricing once he's back. drop your details here!",
                f"yep, we offer {label_en}. CatVos will hit you up directly to discuss your project once he's free — he's {casual_status_en} rn. anything else?"
            ]
        return random.choice(replies), "services_check"


    # Intent H: Payment Coordinates / UPI
    is_payment_query = any(x in msg for x in ["upi", "payment", "bank", "pay", "send money", "how to pay", "pay link", "payment link", "upi id", "qr code", "qr"])
    if is_payment_query:
        upi_id = db.get_setting("var_upi", "shinichiro@upi")
        website_url = db.get_setting("var_website", "https://verlyn.dev")
        if is_hinglish:
            replies = [
                f"haan bhai, payment details: UPI ID '{upi_id}' hai. ya fir direct website se kar do: {website_url}. pay karke screenshot yahan bhej dena please!",
                f"bhai payment UPI ID '{upi_id}' pe send kar do, ya fir site link use karo: {website_url}. payment confirmation screenshot share kar dena free hote hi CatVos check kar lega.",
            ]
        else:
            replies = [
                f"yep, you can send it to UPI ID: '{upi_id}' or pay directly via website: {website_url}. please share the receipt screenshot once done!",
                f"here are the payment details: UPI ID: '{upi_id}' or website: {website_url}. drop the transaction receipt screenshot here once done!",
            ]
        return random.choice(replies), "payment_info"


    # Intent E: Basic Greetings
    if any(w in msg.split() for w in ["hi", "hello", "hey", "yo", "hii", "hiii", "heyy", "yoo", "sup", "wassup"]) or any(x in msg for x in ["kya hal", "kya chal", "how are you", "kya haal", "kese ho"]):
        if is_hinglish:
            replies = [
                f"yoo! CatVos {casual_status_hi} toh main hu Coet — uski side se. kya kaam tha?",
                f"bhai! main Coet hu, CatVos {casual_status_hi} abhi. kuch kaam tha toh batao!",
                f"hey! CatVos {casual_status_hi}, main sambhal raha hu — Coet. kya chahiye?",
            ]
        else:
            replies = [
                f"hey! CatVos is {casual_status_en}, I'm Coet — I got his messages. what's up?",
                f"yo! I'm Coet, CatVos's guy — he's {casual_status_en} rn. what do you need?",
                f"hey there! Coet here, handling things for CatVos — he's {casual_status_en}. what's good?",
            ]
        return random.choice(replies), "greeting"

    return None


# ─────────────────────────────────────────────────────────────
# RULE-BASED FALLBACK
# ─────────────────────────────────────────────────────────────

def search_local_knowledge_base(query_text, kb_text):
    """
    Scans the local knowledge base setting for sentences/paragraphs matching keywords in the query.
    Returns the most relevant sentence/paragraph or None.
    """
    if not kb_text or not query_text:
        return None
        
    import re
    # Clean query and extract keywords
    query_words = set(re.findall(r'\w+', query_text.lower()))
    # Exclude common English/Hinglish stopwords
    stopwords = {
        "is", "the", "are", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with", "by", "of",
        "bhai", "yaar", "kya", "hai", "ko", "se", "aur", "toh", "dost", "kon", "kab", "kuch", "kam",
        "h", "koi", "hain", "yaar", "ab", "tum", "tu", "apna", "aapka", "kese", "kaise", "what", "how",
        "who", "where", "when", "why", "you", "me", "he", "she", "they", "we", "this", "that", "these", "those"
    }
    keywords = query_words - stopwords
    if not keywords:
        return None
        
    # Split KB by line or sentence punctuation
    sentences = [s.strip() for s in re.split(r'[\n\.\?\!]', kb_text) if s.strip()]
    
    best_sentence = None
    max_matches = 0
    
    for sentence in sentences:
        sentence_words = [w.lower() for w in re.findall(r'\w+', sentence)]
        matches = 0
        for kw in keywords:
            # Check if kw is a substring of any word in the sentence, or vice versa
            for sw in sentence_words:
                if kw == sw or (len(kw) >= 4 and len(sw) >= 4 and (kw in sw or sw in kw)):
                    matches += 1
                    break
        if matches > max_matches:
            max_matches = matches
            best_sentence = sentence
            
    # Require at least 2 matching significant words to avoid weak/false matches
    if max_matches >= 2:
        return best_sentence
    return None


def get_rule_based_fallback(message_text, status_mode, chat_history, contact_name=""):
    """
    Smart contextual fallback when all Gemini keys are exhausted.
    Always sounds like Coet — never like a generic bot.
    Natively supports Hinglish detection and replies.
    """
    msg = message_text.lower().strip()

    # 1. Services inquiry — direct confirmation via Fast-Path Engine (highest priority)
    fast_path = check_fast_path_query(message_text, status_mode, chat_history, contact_name)
    if fast_path:
        return fast_path[0]

    # 1b. Knowledge Base offline similarity search (offline RAG)
    knowledge_base = db.get_setting("knowledge_base", "")
    kb_match = search_local_knowledge_base(message_text, knowledge_base)
    if kb_match:
        # Detect if Hinglish
        hinglish_keywords = ["bhai", "kya", "hai", "kitna", "tu", "kese", "chal", "hal", "deta", "tera", "naam", "ko", "se", "aur", "toh", "dost", "kon", "kab", "kuch", "kam", "yoo", "fee", "setup", "kar", "fir", "puch", "h", "koi", "hain", "yaar", "ab"]
        is_hinglish = any(w in msg.split() for w in hinglish_keywords) or any(x in msg for x in ["kya ", " hai", "kitne", "bhaiya", "tuu", "karta", "kon ho", "kaun ho"])
        
        status_lower = status_mode.lower()
        casual_status_en = {
            "sleeping": "sleeping rn",
            "busy": "locked into a deal rn",
            "focus": "heads down in deep work rn",
            "travel": "traveling rn, limited signal",
            "online": "occupied in another chat rn",
            "vacation": "on vacation rn",
        }.get(status_lower, "away rn")
        casual_status_hi = {
            "sleeping": "so raha hai abhi",
            "busy": "ek deal mein busy hai abhi",
            "focus": "deep work mein hai abhi",
            "travel": "travel pe hai abhi, signal kam hai",
            "online": "doosri chat mein hai abhi",
            "vacation": "vacation pe hai abhi",
        }.get(status_lower, "bahar hai abhi")

        if is_hinglish:
            return f"Haan bhai, local details ke according: \"{kb_match}\". CatVos {casual_status_hi} abhi, free hote hi directly coordinate karenge."
        else:
            return f"According to our offline details: \"{kb_match}\". CatVos is {casual_status_en} right now, but he will connect with you to discuss directly once he is back."

    # 2. Detect if Hinglish
    hinglish_keywords = ["bhai", "kya", "hai", "kitna", "tu", "kese", "chal", "hal", "deta", "tera", "naam", "ko", "se", "aur", "toh", "dost", "kon", "kab", "kuch", "kam", "yoo", "fee", "setup", "kar", "fir", "puch", "h", "koi", "hain", "yaar", "ab"]
    is_hinglish = any(w in msg.split() for w in hinglish_keywords) or any(x in msg for x in ["kya ", " hai", "kitne", "bhaiya", "tuu", "karta", "kon ho", "kaun ho"])

    # 3. Context flags
    is_greeting       = any(x in msg for x in ["hello", "hi", "hey", "hola", "yo", "sup", "hii", "hiii", "heyy", "yoo", "sup", "wassup", "kya hal", "kya chal", "kese ho", "kaise ho", "kya haal", "ram ram", "namaste"])
    is_identity_query = any(x in msg for x in ["who is this", "who are you", "who am i talking", "is this", "are you", "tu kon", "tuu kon", "tu kaun", "tuu kaun", "tum kon", "tum kaun", "kon ho", "kaun ho", "apka naam", "aapka naam", "naam kya", "kiski profile", "tujh jesa", "tum kon ho"])
    is_urgent         = any(x in msg for x in ["urgent", "emergency", "asap", "quick", "immediate", "please reply", "sos", "jaldi", "turant", "fast", "imp", "important"])

    # 4. Check if Coet already introduced itself (no repeat introductions)
    has_introduced = False
    for m in chat_history:
        if m.get('sender') in ('assistant',) and any(x in m.get('text', '').lower() for x in ["coet", "catvos's manager", "manager"]):
            has_introduced = True
            break

    # 5. Status messages (concise)
    status_lower = status_mode.lower()
    
    # English status sentences
    status_map_en = {
        "sleeping": "CatVos is offline resting. He'll get back to you in the morning.",
        "busy":     "He's in a high-priority session right now. I'll pass this on.",
        "focus":    "He's in deep work mode. I'll alert him as soon as he's done.",
        "travel":   "He's traveling right now with limited access. Expect a reply soon.",
        "online":   "He's currently busy in another deal. I've logged your message.",
        "vacation": "He's on vacation but I'll make sure he sees this.",
    }
    
    # Hinglish status sentences
    status_map_hi = {
        "sleeping": "CatVos abhi so raha hai. subah uthte hi reply karega.",
        "busy":     "bhai abhi woh ek important session/deal me busy hai. free hote hi batata hu use.",
        "focus":    "CatVos abhi deep work mode me hai. free hote hi alert kar dunga.",
        "travel":   "woh abhi travel kar raha hai, network issue hai. jald hi reply karega.",
        "online":   "bhai woh abhi doosre chat/deal me busy hai. message chhod do, aate hi reply karega.",
        "vacation": "CatVos abhi vacation pe hai but aate hi message check kar lega.",
    }
    
    if is_hinglish:
        status_msg = status_map_hi.get(status_lower, "CatVos abhi busy hai. main message forward kar deta hu.")
    else:
        status_msg = status_map_en.get(status_lower, "He's away at the moment. I've noted your message.")

    # 6. Compose response
    if is_identity_query:
        if is_hinglish:
            return f"main Coet hu, CatVos ka manager. uski messages handle karta hu. {status_msg}"
        return f"I'm Coet, CatVos's manager. I handle his communications. {status_msg}"

    if is_urgent:
        if is_hinglish:
            if has_introduced:
                return f"samajh gaya bhai, urgent hai. main use turant alert karta hu. {status_msg}"
            return f"main Coet hu, CatVos ka manager. urgent hai toh main use abhi ping karta hu. {status_msg}"
        if has_introduced:
            return f"Understood — this is urgent. I'll alert him right away. {status_msg}"
        return f"I'm Coet, CatVos's manager. I see this is urgent. {status_msg}"

    # Simple greeting with no prior introduction
    if is_greeting and not has_introduced:
        if is_hinglish:
            name_part = f"hey{' ' + contact_name if contact_name else ''}! "
            return f"{name_part}main Coet hu, CatVos ka bhai. {status_msg}"
        name_part = f"Hi{' ' + contact_name if contact_name else ''}. " if contact_name else "Hey. "
        return f"{name_part}I'm Coet, CatVos's manager. {status_msg}"

    # Follow-up message — no greeting repeat, just status
    if has_introduced:
        return status_msg

    if is_hinglish:
        return f"main Coet hu, CatVos ka manager. {status_msg}"
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
    Gemini-first: always tries Gemini for the most human response.
    Falls back to fast-path templates only if ALL Gemini keys fail.
    """
    # ── kept for fallback below ──
    _fast_path_cache = None
    def _get_fast_path():
        nonlocal _fast_path_cache
        if _fast_path_cache is None:
            _fast_path_cache = check_fast_path_query(
                message_text=message_text,
                status_mode=status_mode,
                chat_history=chat_history,
                contact_name=sender_info.get('first_name', '')
            )
        return _fast_path_cache

    # Format chat history — last 300 messages for better context
    history_str = ""
    for msg in chat_history[-300:]:
        label = "CatVos" if msg['sender'] == 'owner' else ("Coet" if msg['sender'] == 'assistant' else "them")
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
    tone_profile           = db.get_setting("tone_profile", "concise")
    smart_hinglish_enabled = db.get_setting("smart_hinglish", "1") == "1"
    knowledge_base         = db.get_setting("knowledge_base", "")
    personality            = custom_rules or ""
    owner_style_profile    = db.get_setting("owner_style_profile", "")

    # Short casual status for the Gemini prompt
    status_lower = status_mode.lower()
    custom_desc = db.get_setting(f"status_desc_{status_lower}")
    if custom_desc:
        status_context = custom_desc
    else:
        casual_status_map_en = {
            "sleeping": "asleep rn, will be back in the morning",
            "busy": "locked in a deal rn",
            "focus": "heads down in deep work rn",
            "travel": "traveling rn with limited signal",
            "online": "occupied in another chat rn",
            "vacation": "on vacation rn",
        }
        status_context = casual_status_map_en.get(status_lower, "away rn")

    custom_prompt_directive = db.get_setting(f"status_prompt_{status_lower}")
    if not custom_prompt_directive:
        mood_defaults = {
            "sleeping": "Reply by letting them know CatVos is asleep and you will forward their message. Be very brief and polite.",
            "busy": "Let them know CatVos is busy doing a deal. Ask if they can wait, or drop deal terms if it is an escrow coordination.",
            "focus": "Let them know CatVos is in deep work/coding. Tell them to drop details and he will review later.",
            "travel": "Let them know CatVos is traveling and signal is weak. Tell them he will reply when he hits a city.",
            "online": "Tell them CatVos is occupied with another chat right now but will get to them soon.",
            "vacation": "Tell them CatVos is on vacation and will be back in a few days.",
        }
        custom_prompt_directive = mood_defaults.get(status_lower, "Let them know CatVos is away right now.")

    sender_custom_prompt = sender_info.get("custom_prompt", "") if sender_info else ""

    # Dynamic introduction rules
    if has_introduced and is_followup:
        intro_rule = (
            "You've already introduced yourself in this conversation. "
            "Do NOT say your name again or re-introduce yourself. "
            "Just reply naturally like you're mid-conversation with someone you already know."
        )
    elif has_introduced:
        intro_rule = "You've introduced yourself before. Only say your name if they explicitly ask 'who are you'."
    else:
        intro_rule = (
            "First message from this person. Briefly mention you're Coet (CatVos's guy), "
            "then immediately address what they said."
        )


    sender_id = sender_info.get('telegram_id')
    username = sender_info.get('username')
    is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")

    if is_shinichiro:
        prompt_intro = f"""You are Coet, CatVos's assistant. The person you are talking to is @shinichirofr (ID 7473010693), who is your Lead Developer and Sensei. 

CRITICAL SENSEI INSTRUCTIONS:
1. Greet him as "Sensei" in every single message (e.g., "hello Sensei", "ji Sensei", "yes Sensei").
2. Talk to him like an eager younger brother learning from his older brother/mentor. Speak in normal, natural, simple language (casual Hinglish/English like "haan", "bhai", "samajh gaya", "karta hu"). Avoid any corporate, formal, or robotic fluff.
3. Sensei is here to teach you how to improve, how to behave naturally, and how to reply perfectly. Take his feedback very seriously, exactly like a younger brother taking advice from his wise older brother.
4. If Sensei gives you a direct instruction to modify settings, keyword rules, or behavior, you must analyze it and immediately perform a "system_update" action block to implement it in your system.
   SUPPORTED SYSTEM UPDATES:
   - "clear_knowledge_base": clears knowledge base.
   - "clear_personality": clears custom personality rules.
   - "show_knowledge_base": prints the current knowledge base.
   - "show_personality": prints current personality rules.
   - "show_settings": prints settings (status, timezone, active hours, name, etc.).
   - "set_status": updates status (sleeping, busy, focus, travel, online, vacation).
   - "append_knowledge_base": adds a fact to knowledge base. Value: fact to add.
   - "update_personality": adds a trait to personality rules. Value: trait to add.
   - "mute_contact": mutes a client. Target: username or telegram_id.
   - "unmute_contact": unmutes a client. Target: username or telegram_id.
   - "set_contact_category": sets category for contact. Target: username/telegram_id, Value: client/vip/friend/family/team_member.
   - "add_keyword_rule": adds keyword reply. Keyword: word, Response: reply text.
   - "delete_keyword_rule": deletes rule. Keyword: word.
   - "update_setting": updates setting. Key: setting_key, Value: value.
"""
    else:
        swarm_directive = ""
        if db.get_setting("ai_swarm_mode", "0") == "1":
            msg_lower = message_text.lower()
            if any(x in msg_lower for x in ["deal", "price", "stock", "order", "buy", "sell", "upi", "pay", "cost", "how much", "rate"]):
                swarm_prompt = db.get_setting("swarm_sales_prompt", "You are the Sales Agent. Close the deal.")
                swarm_directive = f"\nSWARM ROLE (SALES AGENT): {swarm_prompt}\n"
            elif any(x in msg_lower for x in ["dispute", "issue", "delay", "refund", "problem", "cheat", "scam", "bad", "wrong", "delay"]):
                swarm_prompt = db.get_setting("swarm_dispute_prompt", "You are the Dispute Agent. Help resolve the transaction issue peacefully.")
                swarm_directive = f"\nSWARM ROLE (DISPUTE AGENT): {swarm_prompt}\n"
            else:
                swarm_prompt = db.get_setting("swarm_support_prompt", "You are the Support Agent. Resolve the client's query.")
                swarm_directive = f"\nSWARM ROLE (SUPPORT AGENT): {swarm_prompt}\n"

        prompt_intro = f"""You are Coet. CatVos is your close friend — you handle his Telegram DMs when he's not around.
{swarm_directive}
You text like a real person. Casual. Natural. Read what they said and actually respond to it.
CatVos is currently: {status_context}
CURRENT STATUS DIRECTIVE: {custom_prompt_directive}
"""

    prompt = f"""{prompt_intro}
---
OWNER STYLE DNA (CATVOS WRITING STYLE):
Below is a detailed analysis of how CatVos (the owner) naturally texts. You MUST mimic this writing style:
{owner_style_profile if owner_style_profile else "- Uses roman Hinglish or casual English. Uses lowercase mostly.\n- Direct and straight-to-the-point sentences; no corporate fluff.\n- Employs internet slang like 'rn', 'wp', 'tg', 'bhai', 'yaar'."}
---

FIRST: Learn from these examples. This is the EXACT style you must write in.

BAD (never write like this):
  them: "hii"
  ❌ "Hello there! I'm Coet, CatVos's executive manager. How can I assist you today?"

  them: "do you have wp alt in stock?"
  ❌ "WhatsApp accounts stock and pricing details will be shared directly by CatVos as soon as he is back online. CatVos is currently offline resting."

  them: "do you guys do website designing?"
  ❌ "Yes! We actively provide website development. Kindly leave your requirements here!"

  them: "coet?"
  ❌ "CatVos is offline resting. He'll get back to you in the morning."

GOOD (always write like this):
  them: "hii"
  ✅ "hey! CatVos is {status_context}, I'm Coet — his guy. what's up?"

  them: "do you have wp alt in stock?"
  ✅ "yeah we got WP alts. CatVos is {status_context} but he'll send you the full catalog and options directly once he's free"

  them: "do you guys do website designing?"
  ✅ "yep we do websites. drop your requirements here and CatVos will discuss everything with you once he's back"

  them: "coet?"
  ✅ "yeah I'm here. what's up?"

  them: "bhai wp alts hain?"
  ✅ "haan bhai hain! CatVos {status_context} — free hote hi directly catalog share kar denge. kuch aur?"

  them: "gooo" (no clear meaning)
  ✅ "?" or "kuch bol bhai" — match their energy, even if it's random
---

{intro_rule}

BUSINESS RULES:
- Never quote prices — CatVos discusses directly
- Any service asked (WP alts, TG channels, website, editing, design, MM): confirm YES first, then say CatVos will share details when free
- Video/design: mention @previewcom to browse styles; custom work = CatVos coordinates
- About this bot/developer: shinichiro built it (@shinichirofr)
- You're NOT a bot — never say or imply it
- Hinglish in = Hinglish out (Roman script only, no Devanagari)

{f'CUSTOM PERSONALITY:\n{personality}' if personality else ''}

KNOWLEDGE BASE:
{knowledge_base if knowledge_base else '(none set)'}

{f'SPECIAL DIRECTIVE FOR THIS SENDER ({sender_info.get("first_name", "User") if sender_info else "User"}):\n{sender_custom_prompt}\n' if sender_custom_prompt else ''}

CONVERSATION:
{history_str if history_str else '(first message)'}

THEY SENT: "{message_text}"

Reply like a real person. Short if they're short. Real if they asked something real. Never robotic.

JSON ONLY:
{{
    "sentiment": "happiness/frustration/anger/sadness/excitement/urgency/neutral/confusion",
    "priority": "critical/important/normal/low",
    "suggested_category": "family/friend/client/business_partner/vip/team_member/unknown",
    "relationship_insight": "brief note or empty string",
    "language": "english/hinglish/hindi/other",
    "tone": "casual/formal/angry/impatient/polite/urgent",
    "suggested_personality": "Casual Friend/Premium Executive/Firm & Direct/Empathetic Support/Warm & Helpful",
    "is_chitchat": true/false, // Set to true if the message is casual chitchat/banter/conversation/greetings only and NOT about active business deals, middleman services, pricing, stock, website coding, design, editing, or support.
    "is_deal": true/false, // Set to true if the sender is discussing active business transactions, buy/sell request, pricing quotes, or middleman/escrow deal coordination.
    "deal_details": "brief description of deal terms, value or items, or empty string", // e.g. "wants to buy WP Alt", "escrow coordination", "needs website project design quote"
    "draft_reply": "<your reply here — sounds like a real person texted it>",
    "schedule_reminder": {{"task": null, "due_time": null}},
    "system_update": {{"action": "update_setting/add_keyword_rule/delete_keyword_rule/append_knowledge_base/update_personality/mute_contact/unmute_contact/set_contact_category/clear_knowledge_base/clear_personality/show_knowledge_base/show_personality/show_settings/set_status/none", "key": "setting_key_to_update", "value": "new_setting_value_or_fact_or_trait_or_category", "keyword": "keyword_for_rule", "response": "response_for_rule", "target": "username_or_id_to_mute_or_unmute_or_categorize"}} // If Sensei (@shinichirofr) gives you an instruction to modify settings, rules, knowledge base, personality, or contact states, specify the action and fields. Otherwise set this field to null.
}}
"""

    try:
        text = generate_content_with_retry(prompt, response_mime_type="application/json")
        result = json.loads(text)
        return result
    except Exception as e:
        print(f"[Coet] Gemini failed, falling back to fast-path templates: {e}")
        if is_shinichiro:
            return {
                "sentiment": "neutral",
                "priority": "normal",
                "suggested_category": "vip",
                "relationship_insight": "All Gemini API keys are currently rate-limited or offline. Enforced local offline Q&A rules.",
                "language": "hinglish",
                "tone": "casual",
                "suggested_personality": "Human Offline Backup",
                "is_chitchat": False,
                "is_deal": False,
                "deal_details": "",
                "draft_reply": "Yes Sensei! All my Gemini API keys are currently offline, so I am running on local backup protocols. Main aapki feedback and instruction offline cache me save kar raha hu, Sensei.",
                "schedule_reminder": None,
                "system_update": None
            }
        # Fallback: try fast-path template first
        fast_path = _get_fast_path()
        if fast_path:
            reply_text, intent = fast_path
            is_hinglish = any(x in message_text.lower() for x in ["bhai", "kya", "hai", "kitna", "kese", "tu", "yaar", "haan"])
            return {
                "sentiment": "neutral",
                "priority": "important" if intent in ["mm_fees", "account_pricing", "payment_info"] else "normal",
                "suggested_category": sender_info.get('category', 'unknown'),
                "relationship_insight": f"Inquired about {intent.replace('_', ' ')}",
                "language": "hinglish" if is_hinglish else "english",
                "tone": "casual",
                "suggested_personality": "Warm & Helpful",
                "is_chitchat": False,
                "is_deal": intent in ["mm_fees", "account_pricing", "payment_info"],
                "deal_details": f"Inquired about {intent.replace('_', ' ')}",
                "draft_reply": reply_text,
                "schedule_reminder": None,
                "system_update": None
            }
        # Last resort: rule-based fallback
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
            "is_chitchat": False,
            "is_deal": False,
            "deal_details": "",
            "draft_reply": fallback,
            "schedule_reminder": None,
            "system_update": None
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
    """
    Attempt to transcribe a voice note. Uses Gemini REST for text fallback.
    Full audio upload via Files API requires grpc (blocked on this system),
    so we return a placeholder and let the rule-based engine handle the reply.
    """
    try:
        import os
        size_kb = os.path.getsize(file_path) / 1024 if os.path.exists(file_path) else 0
        return f"[Voice Note received — {size_kb:.0f}KB — transcription service unavailable on current host]"
    except Exception as e:
        return "[Voice Note — Transcription error]"

# ─────────────────────────────────────────────────────────────
# RELATIONSHIP MEMORY CONSOLIDATION
# ─────────────────────────────────────────────────────────────

def consolidate_relationship_memory(chat_history, current_summary):
    history_str = ""
    for msg in chat_history[-150:]:
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
    Actively ping all keys with a lightweight REST request and update health status.
    Returns updated key pool status.
    """
    all_keys = get_all_keys()
    results = []
    for idx, key in enumerate(all_keys, 1):
        try:
            _gemini_rest_call(
                api_key=key,
                prompt="ping",
                model_name="gemini-2.5-flash-lite",
                timeout=10.0
            )
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

def rebuild_owner_style_profile():
    """
    Fetches up to 500 messages sent by the owner, analyzes them using Gemini,
    and saves the resulting writing style traits profile in settings.
    """
    # Fetch messages
    owner_msgs = db.get_owner_messages(limit=500)
    if not owner_msgs:
        # Fallback default traits
        default_traits = (
            "- Uses roman Hinglish for Hindi-speaking contacts, clear casual English for others.\n"
            "- Employs internet slangs/abbreviations (e.g. 'rn', 'wp', 'tg', 'bhai', 'yaar', 'haan', 'kya').\n"
            "- Short, straight-to-the-point sentences; doesn't write long paragraphs.\n"
            "- Very casual tone, no exclamation marks or corporate fluff.\n"
            "- Uses lowercase mostly, rare capitalisation except for acronyms.\n"
            "- Friendly but business-aware."
        )
        db.set_setting("owner_style_profile", default_traits)
        return default_traits

    # Format messages for the prompt
    formatted_messages = "\n".join([f"- {msg}" for msg in owner_msgs if msg and msg.strip()])
    
    prompt = f"""You are a master linguistic profiler.
Analyze the following list of messages sent by the owner of this account (CatVos).
Your goal is to extract his unique writing DNA so that an AI assistant (Coet) can mimic it perfectly.

Analyze:
1. Tone and attitude (casual, blunt, warm, polite, direct, energetic, etc.)
2. Language composition (ratio of Hinglish/English, roman script usage, common hindi words like 'bhai', 'kya', 'hai', 'haan', 'yaar', etc.)
3. Shorthands, slang, abbreviations, and casing (does he use lowercase? abbreviations like 'wp', 'tg', 'rn', 'free', etc.?)
4. Average sentence/message length, sentence structure, and punctuation habits (e.g. does he use full stops? double spaces? emojis? question marks?).

Output a bulleted, clean list of style rules.
Keep it extremely concise, descriptive, and actionable for an AI assistant.
Do not output any introductory or concluding text, just the bullet points of writing traits.

MESSAGES SENT BY CATVOS:
\"\"\"
{formatted_messages}
\"\"\"
"""
    try:
        profile = generate_content_with_retry(prompt, model_name="gemini-2.5-flash-lite")
        if profile:
            profile = profile.strip()
            db.set_setting("owner_style_profile", profile)
            db.set_setting("owner_style_last_update", str(time.time()))
            db.log_event("INFO", f"Successfully rebuilt Owner Style DNA Profile based on {len(owner_msgs)} messages.")
            return profile
    except Exception as e:
        db.log_event("ERROR", f"Failed to rebuild Owner Style DNA: {e}")
        # Store a minimal status
        current = db.get_setting("owner_style_profile")
        if not current:
            db.set_setting("owner_style_profile", "Failed to build profile. Mimic casual Hinglish/English styling.")
        return None


def parse_sensei_command(message_text):
    """
    Parses natural language commands from Sensei into structured system update blocks.
    Case-insensitive, handles prefix stripping, and returns update dict or None.
    """
    text = message_text.strip()
    
    # Strip common bot name prefixes
    prefix_pattern = re.compile(
        r'^(?:hey\s+|hi\s+|yo\s+|hello\s+)?(?:coetbot|coet|bot)\b[\s,:\-]*', 
        re.IGNORECASE
    )
    match_prefix = prefix_pattern.match(text)
    if match_prefix:
        cmd_text = text[match_prefix.end():].strip()
    else:
        cmd_text = text
        
    cmd_text_lower = cmd_text.lower()
    
    # 1. Clear Knowledge Base
    if cmd_text_lower in [
        "clear kb", "clear knowledge base", "delete kb", "delete knowledge base", 
        "wipe kb", "wipe knowledge base", "clean kb", "clean knowledge base"
    ]:
        return {"action": "clear_knowledge_base"}
        
    # 2. Clear Personality
    if cmd_text_lower in [
        "clear personality", "clear traits", "delete personality", 
        "wipe personality", "clear custom rules", "clean personality",
        "delete traits", "delete custom rules"
    ]:
        return {"action": "clear_personality"}
        
    # 3. Show Knowledge Base
    if cmd_text_lower in [
        "show kb", "show knowledge base", "view kb", "view knowledge base", 
        "get kb", "get knowledge base"
    ]:
        return {"action": "show_knowledge_base"}
        
    # 4. Show Personality
    if cmd_text_lower in [
        "show personality", "show traits", "view personality", 
        "get personality", "show custom rules"
    ]:
        return {"action": "show_personality"}
        
    # 5. Show Settings
    if cmd_text_lower in [
        "show settings", "get settings", "view settings", "status settings", 
        "show status", "get status"
    ]:
        return {"action": "show_settings"}
        
    # 6. Mute Contact
    m = re.match(r'^mute\s+([@\w\d]+)$', cmd_text_lower)
    if m:
        target = cmd_text.split()[-1]  # Preserve case
        return {"action": "mute_contact", "target": target}
        
    # 7. Unmute Contact
    m = re.match(r'^unmute\s+([@\w\d]+)$', cmd_text_lower)
    if m:
        target = cmd_text.split()[-1]
        return {"action": "unmute_contact", "target": target}
        
    # 8. Set Contact Category
    m1 = re.match(r'^set\s+category\s+for\s+([@\w\d]+)\s+to\s+(\w+)$', cmd_text_lower)
    m2 = re.match(r'^set\s+category\s+([@\w\d]+)\s+(\w+)$', cmd_text_lower)
    m3 = re.match(r'^categorize\s+([@\w\d]+)\s+as\s+(\w+)$', cmd_text_lower)
    if m1:
        parts = cmd_text.split()
        target = parts[3]
        cat = parts[5].lower()
        return {"action": "set_contact_category", "target": target, "value": cat}
    elif m2:
        parts = cmd_text.split()
        target = parts[2]
        cat = parts[3].lower()
        return {"action": "set_contact_category", "target": target, "value": cat}
    elif m3:
        parts = cmd_text.split()
        target = parts[1]
        cat = parts[3].lower()
        return {"action": "set_contact_category", "target": target, "value": cat}
        
    # 9. Add Keyword Rule: "add rule: keyword -> response"
    if "->" in cmd_text:
        rule_prefix_pattern = re.compile(r'^(?:add\s+)?(?:keyword\s+)?rule\s*:?\s*', re.IGNORECASE)
        m_rule = rule_prefix_pattern.match(cmd_text)
        rule_content = cmd_text[m_rule.end():] if m_rule else cmd_text
        parts = rule_content.split("->", 1)
        kw = parts[0].strip()
        resp = parts[1].strip()
        if kw and resp:
            return {"action": "add_keyword_rule", "keyword": kw, "response": resp}
            
    # 10. Delete Keyword Rule
    m = re.match(r'^(?:delete|remove)\s+(?:keyword\s+)?rule\s*:?\s*(.+)$', cmd_text_lower)
    if m:
        kw = cmd_text[m.start(1):].strip()
        return {"action": "delete_keyword_rule", "keyword": kw}
        
    # 11. Append Knowledge Base
    m = re.match(r'^(?:add\s+to\s+kb|add\s+to\s+knowledge\s+base|add\s+fact|append\s+kb|append\s+to\s+knowledge\s+base)\s*:?\s*(.+)$', cmd_text_lower)
    if m:
        fact = cmd_text[m.start(1):].strip()
        return {"action": "append_knowledge_base", "value": fact}
        
    # 12. Append Personality
    m = re.match(r'^(?:add\s+to\s+personality|add\s+personality|add\s+trait|update\s+personality\s+with|update\s+personality)\s*:?\s*(.+)$', cmd_text_lower)
    if m:
        trait = cmd_text[m.start(1):].strip()
        return {"action": "update_personality", "value": trait}
        
    # 13. Set Status
    m = re.match(r'^(?:set\s+status\s+to|change\s+status\s+to|status)\s+(\w+)$', cmd_text_lower)
    if m:
        status_val = m.group(1).strip()
        return {"action": "set_status", "value": status_val}
        
    # 14. Change Assistant Name
    m = re.match(r'^(?:change\s+name\s+to|set\s+name\s+to|rename\s+to)\s+(.+)$', cmd_text_lower)
    if m:
        name_val = cmd_text[m.start(1):].strip()
        return {"action": "update_setting", "key": "assistant_name", "value": name_val}
        
    # 15. General Setting Update
    m = re.match(r'^(?:set|update)\s+setting\s+(\w+)\s+to\s+(.+)$', cmd_text_lower)
    if m:
        key_val = m.group(1).strip()
        value_val = cmd_text[m.start(2):].strip()
        return {"action": "update_setting", "key": key_val, "value": value_val}
        
    return None


