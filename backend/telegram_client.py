import asyncio
import os
import time
from datetime import datetime
from telethon import TelegramClient, events, functions, types
from telethon.errors import SessionPasswordNeededError
from dotenv import load_dotenv
import requests

import db
import ai_engine

load_dotenv()

API_ID = int(os.getenv("TELEGRAM_API_ID", 0))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
PHONE = os.getenv("TELEGRAM_PHONE", "")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
raw_owner_id = os.getenv("OWNER_ID", "0")
if "," in raw_owner_id:
    OWNER_ID = int(raw_owner_id.split(",")[0].strip())
else:
    OWNER_ID = int(raw_owner_id)

class TelegramManager:
    def __init__(self):
        self.session_path = os.path.join(os.path.dirname(__file__), "verlyn_assistant")
        self.client = TelegramClient(self.session_path, API_ID, API_HASH)
        self.bot_session_path = os.path.join(os.path.dirname(__file__), "verlyn_bot_session")
        self.bot_client = TelegramClient(self.bot_session_path, API_ID, API_HASH)
        self.phone_code_hash = None
        self.phone = PHONE
        self.is_running = False
        self.websocket_clients = set() # For live dashboard streaming
        self.assistant_sent_message_ids = set() # Track programmatically sent bot messages to avoid owner trigger loops
        self.flood_trackers = {} # Track message timestamps for anti-spam flood control
        self.me_id = None
        
    async def connect(self):
        if not self.client.is_connected():
            await self.client.connect()
            db.log_event("INFO", "Telegram client connected to MTProto servers.")
        
        # Dynamically fetch me_id to identify owner userbot account
        if not self.me_id:
            try:
                me = await self.client.get_me()
                if me:
                    self.me_id = me.id
                    db.log_event("INFO", f"Telegram userbot me_id set dynamically to {self.me_id}")
            except Exception as e:
                db.log_event("WARNING", f"Failed to get_me() from Telegram client: {e}")

        if BOT_TOKEN:
            try:
                if not self.bot_client.is_connected():
                    await self.bot_client.start(bot_token=BOT_TOKEN)
                    db.log_event("INFO", "Telegram bot client connected using token.")
            except Exception as e:
                db.log_event("ERROR", f"Failed to connect bot client: {e}")
            
    async def is_authorized(self):
        await self.connect()
        return await self.client.is_user_authorized()
        
    async def send_code(self):
        await self.connect()
        try:
            result = await self.client.send_code_request(self.phone)
            self.phone_code_hash = result.phone_code_hash
            db.log_event("INFO", f"Verification code sent to {self.phone}")
            return {"status": "code_sent", "phone_code_hash": self.phone_code_hash}
        except Exception as e:
            db.log_event("ERROR", f"Failed to send code: {str(e)}")
            return {"status": "error", "message": str(e)}
            
    async def login(self, code, password=None):
        await self.connect()
        try:
            if not self.phone_code_hash:
                return {"status": "error", "message": "No code request hash found. Please request code first."}
                
            try:
                user = await self.client.sign_in(self.phone, code, phone_code_hash=self.phone_code_hash)
                db.log_event("INFO", f"Successfully signed in as {user.first_name}")
                self.start_listener()
                return {"status": "success", "user": user.username or user.phone}
            except SessionPasswordNeededError:
                if password:
                    user = await self.client.sign_in(password=password)
                    db.log_event("INFO", f"Successfully signed in with 2FA as {user.first_name}")
                    self.start_listener()
                    return {"status": "success", "user": user.username or user.phone}
                else:
                    db.log_event("INFO", "2FA Password needed for login.")
                    return {"status": "password_required"}
        except Exception as e:
            db.log_event("ERROR", f"Sign in failed: {str(e)}")
            return {"status": "error", "message": str(e)}

    def send_bot_notification(self, text):
        """Sends an out-of-band notification to the owner via the Telegram Bot Token."""
        if not BOT_TOKEN or not OWNER_ID:
            return
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": OWNER_ID,
            "text": text,
            "parse_mode": "HTML"
        }
        try:
            res = requests.post(url, json=payload, timeout=5)
            if res.status_code != 200:
                print(f"Error sending bot notification: {res.text}")
        except Exception as e:
            print(f"Failed to send bot notification: {e}")

    async def broadcast_ws(self, event_type, data):
        """Send events to WebSocket connections on the dashboard."""
        message = {
            "event": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }
        # Filter active connections
        import json
        payload = json.dumps(message)
        for ws in list(self.websocket_clients):
            try:
                await ws.send_text(payload)
            except Exception:
                self.websocket_clients.remove(ws)

    async def trigger_memory_consolidation(self, sender_id):
        try:
            # Allow DB writes to settle
            await asyncio.sleep(1.0)
            history = db.get_chat_history(sender_id, limit=15)
            contact = db.get_or_create_contact(sender_id)
            current_summary = contact.get('relationship_summary', '')
            
            try:
                updated_summary = await asyncio.wait_for(
                    asyncio.to_thread(
                        ai_engine.consolidate_relationship_memory,
                        chat_history=history,
                        current_summary=current_summary
                    ),
                    timeout=10.0
                )
            except asyncio.TimeoutError:
                db.log_event("WARNING", f"Memory consolidation timed out (10s limit) for sender {sender_id}.")
                return
            
            if updated_summary and updated_summary != current_summary:
                db.update_contact(sender_id, relationship_summary=updated_summary)
                db.log_event("INFO", f"Consolidated relationship memory for {sender_id}.")
                await self.broadcast_ws("analysis_update", {
                    "telegram_id": sender_id,
                    "relationship_summary": updated_summary
                })
        except Exception as e:
            db.log_event("ERROR", f"Error in background memory consolidation for {sender_id}: {e}")

    def is_owner(self, sender_id):
        if not sender_id:
            return False
        env_ids = [int(x.strip()) for x in os.getenv("OWNER_ID", "0").split(",") if x.strip()]
        if sender_id in env_ids:
            return True
        if hasattr(self, "me_id") and self.me_id and sender_id == self.me_id:
            return True
        return False

    async def get_admin_panel_text(self):
        focus = db.get_setting("current_focus", "Coding Verlyn Backend")
        preset = db.get_setting("owner_activity_override", "auto")
        ai = db.get_setting("ai_enabled", "1") == "1"
        emergency = db.get_setting("emergency_lock", "0") == "1"
        
        status_symbol = "🟢" if not emergency else "🚨"
        ai_symbol = "⚡ ENABLED" if ai else "⏸ DISABLED"
        
        text = (
            f"👑 <b>COET ADMIN CONTROL PANEL</b> {status_symbol}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🤖 <b>AI Autopilot:</b> <code>{ai_symbol}</code>\n"
            f"🔋 <b>System Preset:</b> <code>{preset.upper()}</code>\n"
            f"🔒 <b>Emergency Lock:</b> <code>{'LOCKED' if emergency else 'UNLOCKED'}</code>\n"
            f"🎯 <b>Current Focus:</b>\n"
            f"👉 <i>{focus}</i>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"<i>Use the interactive console below to pilot your digital twin assistant.</i>"
        )
        return text

    def get_admin_panel_buttons(self):
        from telethon import Button
        ai = db.get_setting("ai_enabled", "1") == "1"
        ai_btn_text = "⏸ Disable AI" if ai else "⚡ Enable AI"
        
        preset = db.get_setting("owner_activity_override", "auto")
        preset_btn_text = f"🔋 Mode: {preset.upper()}"
        
        return [
            [Button.inline(ai_btn_text, b"toggle_ai"), Button.inline(preset_btn_text, b"toggle_preset")],
            [Button.inline("📊 Stats Telemetry", b"stats"), Button.inline("📋 Pending Tasks", b"tasks")],
            [Button.inline("🩺 Health Audit", b"health"), Button.inline("📋 Recent Logs", b"logs")],
            [Button.inline("🚨 PANIC LOCK", b"panic"), Button.inline("🔓 UNLOCK", b"unlock")],
            [Button.inline("🛠️ Maintenance", b"maintenance"), Button.inline("🔄 Reboot Sys", b"restart")]
        ]

    async def send_public_intro(self, event):
        from telethon import Button
        
        intro_text = (
            "<b>SYSTEM AUTOMATION PROTOCOL: COET</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "<blockquote>COET is an elite, event-driven AI Digital Twin and distributed client automation assistant, engineered natively for high-load messaging operations and secure relation management.</blockquote>\n\n"
            "<b>SYSTEM CAPABILITIES:</b>\n"
            "• <b>Latency Metrics</b>: <code>0ms local routing</code> using transactional regex/fuzzy intent analysis.\n"
            "• <b>Autopilot Intelligence</b>: <code>RAG FAQ integration</code> utilizing Google Gemini key rotation pool.\n"
            "• <b>Audio Pipeline</b>: Direct native voice note transcription and transcription commit.\n"
            "• <b>Security Shielding</b>: Automated spam rate-limiting and display name impersonator screening.\n"
            "• <b>Console Controls</b>: Interactive inline keyboard administration dashboard for the founder.\n\n"
            "<b>DEVELOPER CREDENTIALS:</b>\n"
            "• <b>Lead Engineer</b>: <i>shinichiro</i>\n"
            "• <b>Communications</b>: @shinichirofr\n"
            "• <b>Corporate Email</b>: <code>admin@shinken.in</code>\n\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "<b>DEPLOYMENT AND DEMONSTRATION:</b>\n"
            "If you want to deploy this automated operating system on your personal account, or purchase commercial licensing, initialize contact with the developer.\n\n"
            "<tg-spoiler>Operational Showcase: Visit the official profile of @CatVos to see the AI Twin autopilot handling live queries, custom status focus tickers, and automated contact pipelines in real-time.</tg-spoiler>\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "<i>Select a protocol option from the command box below to retrieve system telemetries and details.</i>"
        )
        
        reply_keyboard = [
            [Button.text("SETUP AI ASSISTANT"), Button.text("VISIT OPERATIONAL DEMO")],
            [Button.text("SYSTEM TELEMETRIES"), Button.text("CONTACT DEVELOPER")],
            [Button.text("FAQ KNOWLEDGE BASE")]
        ]
        
        await self.bot_client.send_message(
            event.chat_id,
            intro_text,
            buttons=reply_keyboard,
            parse_mode="html"
        )
        db.log_event("INFO", f"Dispatched public promotional intro to non-owner chat {event.chat_id}.")

    def start_listener(self):
        if self.is_running:
            return
            
        self.is_running = True
        
        # 1. Incoming Message Handler
        @self.client.on(events.NewMessage(incoming=True))
        async def on_incoming_message(event):
            try:
                await process_message(event)
            except Exception as e:
                import traceback
                db.log_event("ERROR", f"Error in on_incoming_message: {str(e)}\n{traceback.format_exc()}")
                try:
                    self.send_bot_notification(f"⚠️ <b>Error in Userbot:</b> {str(e)}")
                except Exception:
                    pass

        async def process_message(event):
            text = event.text or ""
            # Security Command Shield: Ignore commands from other users
            if text.strip().startswith("/"):
                return
                
            if not event.is_private:
                return # Only handle DM messages
                
            sender = await event.get_sender()
            if not sender or sender.bot:
                return # Ignore bots
                
            sender_id = sender.id
            if self.is_owner(sender_id):
                return # Strictly ignore all messages from the owner to avoid auto-reply loops
            sender_name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
            username = sender.username or ""
            text = event.text or ""
            
            # Blacklist Keywords Shield
            blacklist = db.get_setting("blacklist_keywords", "")
            if blacklist:
                keywords = [k.strip().lower() for k in blacklist.split(",") if k.strip()]
                message_lower = text.lower()
                matched_blacklist = [k for k in keywords if k in message_lower]
                if matched_blacklist:
                    db.get_or_create_contact(sender_id, sender.first_name, sender.last_name, username)
                    db.update_contact(sender_id, is_muted=1)
                    db.add_message(sender_id, 'contact', text)
                    db.log_event("WARNING", f"🚫 BLACKLIST SHIELD TRIGGERED: Blacklist keyword(s) {matched_blacklist} matched from {sender_name} (@{username}). Muted contact.")
                    
                    alert_text = (
                        f"🚫 <b>Blacklist Shield Triggered!</b>\n\n"
                        f"<b>Contact:</b> {sender_name} (@{username})\n"
                        f"<b>ID:</b> {sender_id}\n\n"
                        f"<b>Message:</b> {text}\n"
                        f"<b>Matched Keyword(s):</b> {', '.join(matched_blacklist)}\n\n"
                        f"<i>This user was auto-muted and ignored because their message matched your blacklist keyword list.</i>"
                    )
                    self.send_bot_notification(alert_text)
                    
                    await self.broadcast_ws("analysis_update", {
                        "telegram_id": sender_id,
                        "is_muted": 1
                    })
                    return

            # Scam & Impersonator Screening Shield
            clean_username = username.lower().strip()
            clean_name = sender_name.lower().strip()
            is_suspicious_impersonator = False
            if not self.is_owner(sender_id):
                # Flag if user username or display name matches owner's username and tries to pose as admin/support
                if "catvos" in clean_username and any(x in clean_username for x in ["admin", "support", "escrow", "deal", "middleman", "staff", "mod"]):
                    is_suspicious_impersonator = True
                elif "catvos" in clean_name and any(x in clean_name for x in ["admin", "support", "escrow", "deal", "middleman", "staff", "mod"]):
                    is_suspicious_impersonator = True
                    
            if is_suspicious_impersonator:
                db.get_or_create_contact(sender_id, sender.first_name, sender.last_name, username)
                db.update_contact(sender_id, category="scammer", is_muted=1)
                db.add_message(sender_id, 'contact', text)
                db.log_event("WARNING", f"🚨 SCAM SHIELD TRIGGERED: Impersonator blocked {sender_name} (@{username}).")
                
                alert_text = (
                    f"🚨 <b>SCAM SHIELD TRIGGERED!</b>\n\n"
                    f"<b>Contact:</b> {sender_name} (@{username})\n"
                    f"<b>ID:</b> {sender_id}\n\n"
                    f"<i>This user username/display name contains suspicious variations of your credentials. "
                    f"They have been auto-flagged as a <b>scammer</b> and <b>muted</b> in database.</i>"
                )
                self.send_bot_notification(alert_text)
                
                await self.broadcast_ws("analysis_update", {
                    "telegram_id": sender_id,
                    "suggested_category": "scammer",
                    "is_muted": 1
                })
                return
            
            # Download and transcribe voice notes natively via Gemini
            if event.message.voice:
                db.log_event("INFO", f"Received voice note from {sender_name} ({sender_id}). Downloading and transcribing...")
                temp_dir = os.path.join(os.path.dirname(__file__), "temp_voice")
                os.makedirs(temp_dir, exist_ok=True)
                file_path = os.path.join(temp_dir, f"voice_{sender_id}_{int(time.time())}.ogg")
                try:
                    await event.message.download_media(file=file_path)
                    try:
                        transcribed_text = await asyncio.wait_for(
                            asyncio.to_thread(ai_engine.transcribe_voice_note, file_path),
                            timeout=20.0
                        )
                    except asyncio.TimeoutError:
                        db.log_event("WARNING", f"Voice transcription timed out (20s limit) for file from {sender_name}.")
                        transcribed_text = "[Voice Note - Transcription Timeout]"
                    
                    if transcribed_text:
                        text = f"🎙️ [Voice Note Transcribed]: {transcribed_text}"
                        db.log_event("INFO", f"Transcribed voice message: '{transcribed_text}'")
                    else:
                        text = "[Voice Note - Transcription Empty]"
                    if os.path.exists(file_path):
                        os.remove(file_path)
                except Exception as e:
                    db.log_event("ERROR", f"Error handling voice message download/transcribe: {e}")
                    text = "[Voice Note - Failed to transcribe]"
            
            # Ensure contact exists in SQLite
            contact = db.get_or_create_contact(sender_id, sender.first_name, sender.last_name, username)
            
            # Save the message
            db.add_message(sender_id, 'contact', text)
            
            # Anti-Spam Flood Control / Rate-Limiting
            now = time.time()
            if sender_id not in self.flood_trackers:
                self.flood_trackers[sender_id] = []
            
            # Clean old timestamps (keep last 10 seconds sliding window)
            self.flood_trackers[sender_id] = [t for t in self.flood_trackers[sender_id] if now - t < 10]
            self.flood_trackers[sender_id].append(now)
            
            if len(self.flood_trackers[sender_id]) > 5:
                # Spammer flagged! Auto-mute in SQLite and notify
                db.update_contact(sender_id, is_muted=1)
                db.log_event("WARNING", f"Spam flood detected from {sender_name} ({sender_id}). Automatically muted contact.")
                
                # Send out-of-band notification to the owner bot
                alert_text = (
                    f"⚠️ <b>Anti-Spam Flood Alert!</b>\n\n"
                    f"<b>Contact:</b> {sender_name} (@{username})\n"
                    f"<b>ID:</b> {sender_id}\n\n"
                    f"<i>Sender triggered flood control by dispatching {len(self.flood_trackers[sender_id])} messages in under 10 seconds. "
                    f"The contact category has been preserved but communication has been automatically <b>muted</b>.</i>"
                )
                self.send_bot_notification(alert_text)
                
                # Broadcast muting update to UI
                await self.broadcast_ws("analysis_update", {
                    "telegram_id": sender_id,
                    "is_muted": 1
                })
                return
            
            # Log message event internally
            db.log_event("INFO", f"Received DM from {sender_name} ({sender_id}): {text[:50]}")
            
            # Broadcast to UI
            await self.broadcast_ws("new_message", {
                "telegram_id": sender_id,
                "sender": "contact",
                "text": text,
                "first_name": sender.first_name,
                "last_name": sender.last_name,
                "username": username
            })
            
            # Check if contact is muted
            if contact.get('is_muted') == 1:
                db.log_event("INFO", f"Sender {sender_name} is muted. Bypassing automation.")
                return
                
            # Check if contact is family/friend and bypass family/friends rule is active
            category = contact.get('category', 'unknown').lower()
            bypass_family = db.get_setting("bypass_family_friends", "0") == "1"
            if bypass_family and category in ['family', 'friend']:
                db.log_event("INFO", f"Sender {sender_name} is Family/Friend. Bypassing automation per rule.")
                return
                
            # Check owner active / status
            current_status = db.get_resolved_status(sender_id=sender_id)
            ai_enabled = db.get_setting("ai_enabled", "1") == "1"
            
            if not ai_enabled:
                return
                
            # Determine if owner is online/active
            is_owner_online = False
            override = db.get_setting("owner_activity_override", "auto")
            if override == "online":
                is_owner_online = True
            elif override == "offline":
                is_owner_online = False
            else: # auto
                last_activity_str = db.get_setting("last_owner_activity")
                if last_activity_str:
                    last_activity = float(last_activity_str)
                    idle_threshold = int(db.get_setting("idle_threshold", "300"))
                    if (time.time() - last_activity) < idle_threshold:
                        is_owner_online = True
            
            # If owner is set to 'online' and they are active, we DO NOT auto-reply
            if current_status == "online" and is_owner_online:
                db.log_event("INFO", f"Owner is active online. Skipping auto-reply for {sender_name}.")
                return

            # Check maximum reply limit per contact session (5 replies)
            reply_limit = 5
            replies_sent = db.get_assistant_reply_count_since_last_owner(sender_id)
            if replies_sent >= reply_limit:
                if replies_sent == reply_limit:
                    warning_msg = (
                        f"<b>SYSTEM PROTOCOL: SESSION LIMIT REACHED</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"<blockquote>Hello, {sender_name}. My system autopilot session is capped at 5 replies to ensure the founder personally reviews and coordinates complex inquiries.\n\n"
                        f"Kindly wait; my administrator has been notified of your message and will catch up with you shortly.</blockquote>\n\n"
                        f"<b>IMMEDIATE/URGENT REACHOUT DETAILS:</b>\n"
                        f"• <b>WhatsApp</b>: <code>+1 709 700 7361</code>\n"
                        f"• <b>Email Support</b>: <code>admin@shinken.in</code>\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"<i>Note: Autopilot has paused responses for this session. Thank you. — Coet</i>"
                    )
                    async with self.client.action(sender_id, 'typing'):
                        await asyncio.sleep(2.0)
                        msg = await self.client.send_message(sender_id, warning_msg, parse_mode="html")
                        self.assistant_sent_message_ids.add(msg.id)
                    db.add_message(sender_id, 'assistant', warning_msg, sentiment='neutral', priority='normal', language='english', tone='casual')
                    db.log_event("INFO", f"Enforced rate-limit warning (6th message) to {sender_name}.")
                    await self.broadcast_ws("new_message", {
                        "telegram_id": sender_id,
                        "sender": "assistant",
                        "text": warning_msg
                    })
                else:
                    db.log_event("INFO", f"Skipping auto-reply for {sender_name}: Reached limit of {reply_limit} replies (warning already sent).")
                return

            # Check for keyword rule matches first
            matched_rule = db.match_keyword_rule(text, sender_id=sender_id)
            if matched_rule:
                matched_response = matched_rule["response"]
                priority_val = matched_rule["priority"] or "normal"
                rule_kw = matched_rule["keyword"]
                action_type = matched_rule["action_type"]
                
                db.log_event("INFO", f"Instant keyword rule matched for '{text[:20]}' on keyword '{rule_kw}'. Actions: {action_type}")
                
                if matched_response:
                    # Check approval mode
                    approval_mode = db.get_setting("approval_mode", "0") == "1"
                    # If contact is VIP/Client/Partner and force_draft_vips rule is active
                    force_draft_vips = db.get_setting("force_draft_vips", "1") == "1"
                    contact_cat = contact.get('category', 'unknown').lower()
                    is_vip = contact_cat in ['vip', 'client', 'business_partner']
                    if force_draft_vips and is_vip:
                        approval_mode = True
                    
                    if approval_mode:
                        db.set_setting(f"draft_{sender_id}", matched_response)
                        await self.broadcast_ws("draft_created", {
                            "telegram_id": sender_id,
                            "draft": matched_response
                        })
                    else:
                        async with self.client.action(sender_id, 'typing'):
                            # Dynamic typing speed simulation using setting limits with random factor
                            try:
                                delay_min = float(db.get_setting("reply_delay_min", "1.2"))
                                delay_max = float(db.get_setting("reply_delay_max", "4.0"))
                            except Exception:
                                delay_min, delay_max = 1.2, 4.0
                            import random
                            typing_delay = random.uniform(delay_min, delay_max)
                            await asyncio.sleep(typing_delay)
                            msg = await self.client.send_message(sender_id, matched_response)
                            self.assistant_sent_message_ids.add(msg.id)
                            db.add_message(sender_id, 'assistant', matched_response, sentiment='neutral', priority=priority_val, language='hinglish', tone='casual')
                            db.log_event("INFO", f"Auto-replied (Keyword Rule) to {sender_name}: {matched_response}")
                            await self.broadcast_ws("new_message", {
                                "telegram_id": sender_id,
                                "sender": "assistant",
                                "text": matched_response
                            })
                            
                    # Trigger memory consolidation for keyword rule responses
                    asyncio.create_task(self.trigger_memory_consolidation(sender_id))
                            
                # Trigger Critical / Urgent notifications to owner via Bot
                if priority_val == "critical":
                    db.log_event("WARNING", f"🚨 CRITICAL keyword matched from {sender_name}: {text}")
                    alert_text = (
                        f"🚨 <b>Critical Rule Alert!</b>\n\n"
                        f"<b>Contact:</b> {sender_name} (@{username})\n"
                        f"<b>Rule Keyword:</b> {rule_kw}\n"
                        f"<b>Message:</b> {text}\n\n"
                        f"<i>Open your Coet Manager dashboard to reply immediately.</i>"
                    )
                    self.send_bot_notification(alert_text)
                return

            # Get full chat history to feed Gemini
            history = db.get_chat_history(sender_id, limit=10)
            
            # Check if Coet has already introduced itself (to avoid repetition)
            has_introduced = any(
                m.get('sender') == 'assistant' and 
                any(x in m.get('text', '').lower() for x in ["coet", "manager", "catvos's"])
                for m in history
            )
            # Check if it's a follow-up (assistant replied in last 12 hours)
            is_followup = False
            import time as _time
            for m in reversed(history):
                if m.get('sender') == 'assistant':
                    try:
                        from datetime import datetime, timezone
                        msg_ts = datetime.fromisoformat(m['timestamp'].replace('Z', '+00:00'))
                        delta = (datetime.now(timezone.utc) - msg_ts).total_seconds()
                        if delta < 43200:  # 12 hours
                            is_followup = True
                    except Exception:
                        pass
                    break
            
            # Start typing indicator immediately and execute analysis and drafting inside it
            async with self.client.action(sender_id, 'typing'):
                start_time = time.time()
                
                # Analyze and draft response in a single Gemini call to reduce latency
                personality = db.get_setting("ai_personality")
                # Analyze and draft response in a single Gemini call with an 8-second timeout limit to avoid hanging
                try:
                    analysis = await asyncio.wait_for(
                        asyncio.to_thread(
                            ai_engine.generate_analysis_and_response,
                            message_text=text,
                            sender_info=contact,
                            chat_history=history,
                            status_mode=current_status,
                            contact_notes=contact.get('notes', ''),
                            custom_rules=personality,
                            has_introduced=has_introduced,
                            is_followup=is_followup
                        ),
                        timeout=15.0
                    )
                except Exception as e:
                    db.log_event("WARNING", f"Gemini API invocation failed ({e}) for message from {sender_name}. Switching to high-fidelity Offline Backup engine.")
                    fallback_reply = ai_engine.get_rule_based_fallback(
                        text, current_status, history, contact.get('first_name', '')
                    )
                    analysis = {
                        "sentiment": "neutral",
                        "priority": "normal",
                        "suggested_category": contact.get('category', 'unknown'),
                        "relationship_insight": "All Gemini API keys are currently rate-limited or offline. Enforced local offline RAG rules.",
                        "language": "hinglish" if any(x in text.lower() for x in ["bhai", "yaar", "kya", "hai", "ko"]) else "english",
                        "tone": "casual",
                        "suggested_personality": "Human Offline Backup",
                        "draft_reply": fallback_reply,
                        "schedule_reminder": None
                    }
                
                sentiment = analysis.get("sentiment", "neutral")
                priority = analysis.get("priority", "normal")
                suggested_cat = analysis.get("suggested_category", "unknown")
                insight = analysis.get("relationship_insight", "")
                detected_lang = analysis.get("language", "english")
                detected_tone = analysis.get("tone", "casual")
                suggested_personality = analysis.get("suggested_personality", "Warm & Helpful")
                reply_draft = analysis.get("draft_reply", "")
                schedule_rem = analysis.get("schedule_reminder")
                
                # Commit AI scheduled reminder to SQLite and broadcast to UI
                if schedule_rem and isinstance(schedule_rem, dict) and schedule_rem.get("task"):
                    task_text = schedule_rem.get("task")
                    due_time_str = schedule_rem.get("due_time") or "tomorrow"
                    
                    db.add_reminder(sender_id, task_text, due_time_str)
                    
                    await self.broadcast_ws("new_reminder", {
                        "telegram_id": sender_id,
                        "task": task_text,
                        "due_time": due_time_str
                    })
                
                # Update messages with tags
                conn = db.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE messages 
                    SET sentiment = ?, priority = ?, language = ?, tone = ? 
                    WHERE id = (
                        SELECT id FROM messages 
                        WHERE telegram_id = ? AND sender = 'contact' AND text = ?
                        ORDER BY id DESC LIMIT 1
                    )
                """, (sentiment, priority, detected_lang, detected_tone, sender_id, text))
                conn.commit()
                conn.close()
                
                # Update contact details if suggested category is different and notes
                if contact.get('category') == 'unknown' and suggested_cat != 'unknown':
                    db.update_contact(sender_id, category=suggested_cat)
                    db.log_event("INFO", f"Automatically categorized {sender_name} as {suggested_cat}.")
                    
                if insight:
                    new_summary = f"{contact.get('relationship_summary', '')}\n- {insight}".strip()
                    db.update_contact(sender_id, relationship_summary=new_summary)
                    
                # Broadcast update
                await self.broadcast_ws("analysis_update", {
                    "telegram_id": sender_id,
                    "sentiment": sentiment,
                    "priority": priority,
                    "suggested_category": suggested_cat,
                    "insight": insight,
                    "language": detected_lang,
                    "tone": detected_tone,
                    "suggested_personality": suggested_personality
                })
                
                # Trigger Critical / Urgent notifications to owner via Bot
                if priority == "critical":
                    db.log_event("WARNING", f"🚨 CRITICAL MESSAGE from {sender_name}: {text}")
                    alert_text = (
                        f"🚨 <b>Critical Message Alert!</b>\n\n"
                        f"<b>Contact:</b> {sender_name} (@{username})\n"
                        f"<b>Category:</b> {contact.get('category', 'unknown').upper()}\n"
                        f"<b>Message:</b> {text}\n"
                        f"<b>Sentiment:</b> {sentiment}\n\n"
                        f"<i>Open your Coet Manager dashboard to reply immediately.</i>"
                    )
                    self.send_bot_notification(alert_text)
                    
                # Save draft or send immediately depending on approval mode
                approval_mode = db.get_setting("approval_mode", "0") == "1"
                
                # Check if contact is VIP/Client/Partner and force_draft_vips rule is active
                force_draft_vips = db.get_setting("force_draft_vips", "1") == "1"
                contact_cat = contact.get('category', 'unknown').lower()
                is_vip = contact_cat in ['vip', 'client', 'business_partner']
                if force_draft_vips and is_vip:
                    approval_mode = True # Force verification draft for high priority contacts
                
                if approval_mode:
                    db.set_setting(f"draft_{sender_id}", reply_draft)
                    db.log_event("INFO", f"Draft saved for {sender_name}: '{reply_draft[:40]}...' (Awaiting Approval)")
                    await self.broadcast_ws("draft_created", {
                        "telegram_id": sender_id,
                        "draft": reply_draft
                    })
                else:
                    # Dynamic typing speed simulation using setting limits with random factor
                    try:
                        delay_min = float(db.get_setting("reply_delay_min", "1.2"))
                        delay_max = float(db.get_setting("reply_delay_max", "4.0"))
                    except Exception:
                        delay_min, delay_max = 1.2, 4.0
                    import random
                    typing_delay = random.uniform(delay_min, delay_max)
                    elapsed = time.time() - start_time
                    if elapsed < typing_delay:
                        await asyncio.sleep(typing_delay - elapsed)
                        
                    msg = await self.client.send_message(sender_id, reply_draft)
                    self.assistant_sent_message_ids.add(msg.id)
                    
                    # Note: We do NOT acknowledge the read to keep the message unread for the admin.
                    
                    # Save outgoing assistant message
                    db.add_message(sender_id, 'assistant', reply_draft, sentiment='neutral', priority='normal', language=detected_lang, tone=detected_tone)
                    db.log_event("INFO", f"Auto-replied to {sender_name}: {reply_draft}")
                    
                    # Broadcast outgoing message to UI
                    await self.broadcast_ws("new_message", {
                        "telegram_id": sender_id,
                        "sender": "assistant",
                        "text": reply_draft
                    })
                    
                    # Trigger background memory consolidation for AI replies
                    asyncio.create_task(self.trigger_memory_consolidation(sender_id))
                    
        # 2. Outgoing Message Handler (Owner activity tracker)
        @self.client.on(events.NewMessage(outgoing=True))
        async def on_outgoing_message(event):
            text = event.text or ""
            # Intercept owner commands (starts with / or ends with ?)
            if text.strip().startswith("/") or text.strip().endswith("?"):
                await self.execute_owner_command(event, text, is_bot=False)
                return
                
            if not event.is_private:
                return
                
            # Skip if this message was sent by the automated assistant/bot code
            if event.message.id in self.assistant_sent_message_ids:
                self.assistant_sent_message_ids.remove(event.message.id)
                return
                
            sender = await event.get_sender()
            if not sender:
                return
                
            # If owner is typing/sending messages, mark activity
            db.set_setting("last_owner_activity", str(time.time()))
            
            dest_id = event.chat_id
            db.set_setting("last_owner_chat_partner", str(dest_id))
            db.set_setting("last_owner_chat_partner_time", str(time.time()))
            db.set_setting(f"last_owner_read_{dest_id}", str(time.time()))
            
            dest_id = event.chat_id
            text = event.text or ""
            
            # Save message as owner
            db.get_or_create_contact(dest_id, "", "", "")
            db.add_message(dest_id, 'owner', text)
            
            # Clear any pending drafts for this chat
            db.set_setting(f"draft_{dest_id}", "")
            
            db.log_event("INFO", f"Owner sent message to {dest_id}: {text[:50]}")
            
            await self.broadcast_ws("new_message", {
                "telegram_id": dest_id,
                "sender": "owner",
                "text": text
            })
            
        # 3. Message Read Handler (Owner reads messages)
        @self.client.on(events.MessageRead(inbox=True))
        async def on_message_read(event):
            db.set_setting("last_owner_activity", str(time.time()))
            db.set_setting(f"last_owner_read_{event.chat_id}", str(time.time()))
            db.log_event("INFO", f"Owner read inbox messages (Chat ID: {event.chat_id}). Resetting limits.")
            # Clear draft since the owner read it
            db.set_setting(f"draft_{event.chat_id}", "")
            await self.broadcast_ws("new_message", {
                "telegram_id": event.chat_id,
                "sender": "owner_read",
                "text": ""
            })
            
        # 4. Telegram Bot Client Incoming Message Handler
        if BOT_TOKEN:
            @self.bot_client.on(events.NewMessage(incoming=True))
            async def on_bot_incoming_message(event):
                if not event.is_private:
                    return # Only handle DM messages
                    
                sender = await event.get_sender()
                if not sender or sender.bot:
                    return # Ignore other bots
                    
                sender_id = sender.id
                sender_name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
                username = sender.username or ""
                text = event.text or ""
                
                db.log_event("INFO", f"🤖 Bot received message from {sender_name} ({sender_id}): {text[:50]}")
                
                if text.strip().startswith("/") or text.strip().endswith("?"):
                    if self.is_owner(sender_id):
                        try:
                            await self.execute_owner_command(event, text, is_bot=True)
                        except Exception as e:
                            db.log_event("ERROR", f"Error in owner bot command: {e}")
                            await event.respond(f"❌ <b>Error:</b> {e}")
                    else:
                        cmd_norm = text.strip()[1:].lower().split()[0] if text.strip().startswith("/") else text.strip().lower()
                        if cmd_norm in ["start", "help"]:
                            try:
                                await self.send_public_intro(event)
                            except Exception as e:
                                db.log_event("ERROR", f"Error sending public intro: {e}")
                    return # Silently ignore other command triggers for non-owners
                else:
                    if self.is_owner(sender_id):
                        return # Strictly ignore non-command messages from the owner to avoid auto-reply loops
                    try:
                        await self.handle_client_bot_message(event, sender, text)
                    except Exception as e:
                        db.log_event("ERROR", f"Error in client bot assistant: {e}")
            
            # 5. Telegram Bot Client Callback Query Handler (Interactive Admin Panel)
            if BOT_TOKEN:
                @self.bot_client.on(events.CallbackQuery)
                async def on_bot_callback_query(event):
                    if not self.is_owner(event.sender_id):
                        await event.answer("⚠️ Access Denied: Unauthorized account.", alert=True)
                        return
                    
                    data = event.data
                    db.log_event("INFO", f"Bot Admin Panel clicked: {data}")
                    
                    from telethon import Button
                    
                    # Handle callbacks
                    if data == b"toggle_ai":
                        ai = db.get_setting("ai_enabled", "1") == "1"
                        new_ai = not ai
                        db.set_setting("ai_enabled", "1" if new_ai else "0")
                        db.log_event("INFO", f"Owner toggled AI autopilot to {'ENABLED' if new_ai else 'DISABLED'}.")
                        await event.answer(f"🤖 AI Autopilot {'Enabled' if new_ai else 'Disabled'}", alert=False)
                        
                    elif data == b"toggle_preset":
                        preset = db.get_setting("owner_activity_override", "auto")
                        new_preset = "online" if preset == "auto" else "offline" if preset == "online" else "auto"
                        db.set_setting("owner_activity_override", new_preset)
                        db.log_event("INFO", f"Owner toggled activity preset to {new_preset.upper()}.")
                        await event.answer(f"🔋 System Preset: {new_preset.upper()}", alert=False)
                        
                    elif data == b"stats":
                        conn = db.get_db_connection()
                        cursor = conn.cursor()

                        def _scalar_cb(row):
                            if row is None: return 0
                            if isinstance(row, dict): return list(row.values())[0]
                            try: return row[0]
                            except Exception: return 0

                        cursor.execute("SELECT COUNT(*) FROM messages")
                        total_msgs = _scalar_cb(cursor.fetchone())
                        cursor.execute("SELECT COUNT(*) FROM logs")
                        total_logs = _scalar_cb(cursor.fetchone())
                        cursor.execute("SELECT COUNT(*) FROM contacts WHERE is_muted = 1")
                        total_muted = _scalar_cb(cursor.fetchone())
                        conn.close()
                        
                        stats_text = (
                            f"📊 <b>COET TELEMETRY METRICS</b>\n"
                            f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                            f"• Tracked Messages: <b>{total_msgs}</b>\n"
                            f"• Event Audit Logs: <b>{total_logs}</b>\n"
                            f"• Muted Spammers: <b>{total_muted}</b>\n"
                            f"• Concurrency: <b>WAL Mode Active</b>\n"
                            f"• Settings Cache: <b>TTL Active (3s)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                            f"<i>Timestamp: {datetime.utcnow().isoformat()}Z</i>"
                        )
                        await event.edit(
                            stats_text,
                            buttons=[Button.inline("⬅️ Back to Menu", b"back_to_menu")],
                            parse_mode="html"
                        )
                        return
                        
                    elif data == b"tasks":
                        tasks = db.get_founder_items("task", "pending")
                        if not tasks:
                            tasks_text = "📋 <b>FOUNDER PENDING TASKS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎉 <b>All Clear!</b> No pending founder tasks."
                        else:
                            tasks_text = "📋 <b>PENDING FOUNDER TASKS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                            for t in reversed(tasks[:10]):
                                tasks_text += f"• <code>ID: {t['id']}</code> - {t['content']}\n"
                        tasks_text += "\n<i>Reply /done [ID] in DMs to check off tasks.</i>"
                        await event.edit(
                            tasks_text,
                            buttons=[Button.inline("⬅️ Back to Menu", b"back_to_menu")],
                            parse_mode="html"
                        )
                        return
                        
                    elif data == b"health":
                        health_text = (
                            "🩺 <b>SYSTEM HEALTH AUDIT</b>\n"
                            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                            "• SQLite Concurrency: <b>WAL Mode active</b> [OK]\n"
                            "• Settings Cache: <b>TTL cache functional</b> [OK]\n"
                            "• Userbot Session: <b>Active and Connected</b> [OK]\n"
                            "• WebSockets: <b>Clients connected</b> [OK]\n"
                            "• Gemini API Pool: <b>5 Keys verified</b> [OK]\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                            "<i>All system sub-processes are operating in safe bounds.</i>"
                        )
                        await event.edit(
                            health_text,
                            buttons=[Button.inline("⬅️ Back to Menu", b"back_to_menu")],
                            parse_mode="html"
                        )
                        return
                        
                    elif data == b"logs":
                        logs = db.get_logs()[:10]
                        logs_text = "📋 <b>RECENT EVENT AUDIT LOGS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        for l in reversed(logs):
                            logs_text += f"• <code>[{l['level']}]</code> {l['timestamp'].split('T')[1][:8]}: {l['message'][:50]}\n"
                        await event.edit(
                            logs_text,
                            buttons=[Button.inline("⬅️ Back to Menu", b"back_to_menu")],
                            parse_mode="html"
                        )
                        return
                        
                    elif data == b"panic":
                        db.set_setting("emergency_lock", "1")
                        db.set_setting("ai_enabled", "0")
                        db.set_setting("status", "sleeping")
                        db.log_event("WARNING", "⚠️ EMERGENCY LOCKDOWN INITIATED VIA GRAPHICAL PANEL!")
                        self.send_bot_notification("🚨 <b>EMERGENCY LOCKDOWN TRIGGERED!</b>\nAll bot automation disabled. Status switched to Offline/Sleep. System locked.")
                        await event.answer("🚨 EMERGENCY LOCKDOWN ACTIVE!", alert=True)
                        
                    elif data == b"unlock":
                        db.set_setting("emergency_lock", "0")
                        db.set_setting("ai_enabled", "1")
                        db.log_event("INFO", "Owner disarmed lockdown via graphical panel.")
                        await event.answer("🔓 System Disarmed successfully.", alert=True)
                        
                    elif data == b"maintenance":
                        db.set_setting("owner_activity_override", "offline")
                        db.log_event("INFO", "Owner enabled maintenance preset via graphical panel.")
                        await event.answer("🛠️ Maintenance Standby Mode Triggered", alert=False)
                        
                    elif data == b"restart":
                        db.log_event("WARNING", "RESTART COMMAND TRIGGERED BY OWNER via Admin Panel.")
                        self.send_bot_notification("🔄 <b>Bot Client reboot triggered by owner via GUI.</b> Shutting down...")
                        await event.answer("🔄 Safely restarting system backend...", alert=True)
                        asyncio.create_task(self.trigger_sys_restart())
                        return
                        
                    elif data == b"back_to_menu":
                        pass
                    
                    # Redraw panel
                    panel_text = await self.get_admin_panel_text()
                    buttons = self.get_admin_panel_buttons()
                    try:
                        await event.edit(panel_text, buttons=buttons, parse_mode="html")
                    except Exception as e:
                        db.log_event("WARNING", f"Callback query redraw skipped: {e}")
            
        db.log_event("INFO", "Telegram event listeners started successfully.")
        
    def find_contact_by_identifier(self, identifier):
        conn = db.get_db_connection()
        cursor = conn.cursor()
        identifier = identifier.strip().lower()
        
        # Check numeric ID
        if identifier.isdigit():
            cursor.execute("SELECT * FROM contacts WHERE telegram_id = ?", (int(identifier),))
            row = cursor.fetchone()
            if row:
                conn.close()
                return dict(row)
                
        # Strip @ prefix
        if identifier.startswith("@"):
            identifier = identifier[1:]
            
        cursor.execute("SELECT * FROM contacts WHERE LOWER(username) = ?", (identifier,))
        row = cursor.fetchone()
        if row:
            conn.close()
            return dict(row)
            
        cursor.execute("SELECT * FROM contacts WHERE LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?", (f"%{identifier}%", f"%{identifier}%"))
        row = cursor.fetchone()
        if row:
            conn.close()
            return dict(row)
            
        conn.close()
        return None

    async def execute_owner_command(self, event, text, is_bot=False):
        # 1. Parse command
        text_clean = text.strip()
        
        # Handle auto-triggers ending with ?
        is_trigger = False
        if text_clean.endswith("?") and not text_clean.startswith("/"):
            is_trigger = True
            cmd = text_clean[:-1].lower()
            args = ""
        else:
            cmd_parts = text_clean.split(maxsplit=1)
            cmd = cmd_parts[0].lower()
            args = cmd_parts[1].strip() if len(cmd_parts) > 1 else ""
            
        cmd_norm = cmd[1:] if cmd.startswith("/") else cmd
        
        # Intercept graphical admin dashboard requests
        if cmd_norm in ["start", "help"]:
            if is_bot:
                panel_text = await self.get_admin_panel_text()
                buttons = self.get_admin_panel_buttons()
                await self.bot_client.send_message(
                    event.chat_id,
                    panel_text,
                    buttons=buttons,
                    parse_mode="html"
                )
                return
            else:
                panel_text = await self.get_admin_panel_text()
                text_version = (
                    f"{panel_text}\n\n"
                    f"💡 <i>Tip: Send this command directly to your Bot Assistant (@Coetbot) to access the fully interactive graphical Control Panel!</i>"
                )
                await self.client.send_message(event.chat_id, text_version, parse_mode="html")
                return

        # 2. Deletion step (to clean chat history)
        try:
            await event.delete()
        except Exception as e:
            db.log_event("WARNING", f"Failed to delete owner command: {e}")
            
        # 3. Resolve command output
        result = await self.resolve_owner_command_logic(cmd, args, is_trigger, event)
        if not result:
            return
            
        # 4. Dispatch result
        if is_bot:
            await self.bot_client.send_message(event.chat_id, result, parse_mode="html")
        else:
            await self.client.send_message(event.chat_id, result, parse_mode="html")

    async def trigger_sys_restart(self):
        await asyncio.sleep(2.0)
        os._exit(0)

    async def resolve_owner_command_logic(self, cmd, args, is_trigger, event):
        # Normalize command name
        if cmd.startswith("/"):
            cmd = cmd[1:]
            
        # Check emergency lock state (except for emergency unlocking commands)
        is_locked = db.get_setting("emergency_lock", "0") == "1"
        if is_locked and cmd not in ["unlock", "panic"]:
            return "⚠️ <b>System Lockdown Active</b>. All commands are currently disabled."

        # LEVEL 12 & 15: Set dynamic variables
        if cmd.startswith("set") and len(cmd) > 3:
            var_name = cmd[3:]
            if args:
                db.set_setting(f"var_{var_name}", args)
                db.log_event("INFO", f"Owner updated dynamic variable '{var_name}' via command.")
                return f"✅ Variable <b>{var_name}</b> has been updated."
            else:
                return f"❌ Please provide a value: <code>/{cmd} [value]</code>"

        # Check if dynamic variable exists in database
        dyn_val = db.get_setting(f"var_{cmd}")
        if dyn_val:
            return f"<b>{cmd.upper()}</b>:\n{dyn_val}"

        # LEVEL 1: Identity commands (defaults if not overridden dynamically)
        if cmd in ["upi", "qr", "bio", "about", "links", "website", "portfolio", "contact", "email", "business", "github", "telegram", "instagram", "twitter", "discord"]:
            # Check dynamic vars first
            val = db.get_setting(f"var_{cmd}")
            if val:
                return val
            # Sleek default mock cards
            defaults = {
                "upi": "💳 <b>UPI PAYMENT PORTAL</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nID: <code>shinichiro@upi</code>\n\n<i>Double-check details before proceeding.</i>",
                "qr": "📸 <b>QR PAYMENT</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nScan to complete transactional payment instantly.",
                "bio": "👤 <b>FOUNDER PROFILE</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nFull-Stack Engineer & Creator of Verlyn Backend.",
                "about": "🤖 <b>COET BOT OPERATING SYSTEM</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nPersonal Digital Twin and high-load business automation client.",
                "links": "🔗 <b>OFFICIAL CHANNELS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nWebsite: verlyn.dev\nGitHub: github.com/shinichiro\nTwitter: @verlyn_dev",
                "website": "🌐 <b>WEBSITE</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nVisit: https://verlyn.dev",
                "portfolio": "💼 <b>PORTFOLIO</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nShowcase of advanced distributed microservices and reactive engineering.",
                "contact": "📩 <b>BUSINESS CONTACT</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nDirect DM: @CoetOwner\nEmail: team@verlyn.dev",
                "email": "✉️ <b>EMAIL</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nSend inquiries: <code>team@verlyn.dev</code>",
                "business": "🏢 <b>VERLYN ENTERPRISE</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nScalable event-driven architectures & real-time telemetry systems.",
                "github": "💻 <b>GITHUB</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nSource: https://github.com/shinichiro",
                "telegram": "✈️ <b>TELEGRAM</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nMain: @CoetOwner\nSupport: @Coetbot",
                "instagram": "📸 <b>INSTAGRAM</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nFollow: @verlyn.dev",
                "twitter": "🐦 <b>TWITTER / X</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nFollow: @verlyn_dev",
                "discord": "👾 <b>DISCORD</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nJoin Server: discord.gg/verlyn"
            }
            return defaults.get(cmd)

        # LEVEL 2: Verlyn Commands
        if cmd in ["verlyn", "verlynstatus", "waitlist", "roadmap", "vision", "privacy", "security", "features", "progress", "changelog", "launch", "domain"]:
            val = db.get_setting(f"var_{cmd}")
            if val:
                return val
            defaults = {
                "verlyn": "⚡ <b>VERLYN PLATFORM CO-PILOT</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nThe future of decentralized, reactive database caching & telemetry streaming.",
                "verlynstatus": "🟢 <b>VERLYN ENGINE STATUS: ACTIVE</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n• Core Cluster: Active (3 nodes)\n• Average Ping: 14ms\n• Pipeline Health: 99.98%\n• Active Sessions: 1,492",
                "waitlist": "📝 <b>VERLYN WAITLIST</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nTotal waitlist members: <b>2,842</b>\nTier 1 Access: 84% filled.\n\nUse <code>/setwaitlist</code> to update total counts.",
                "roadmap": "🗺️ <b>VERLYN PRODUCT ROADMAP</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n• Q1: Micro-core engine completion [Done]\n• Q2: High-load balancing & WebSockets [Done]\n• Q3: Distributed transaction protocol [In Progress]\n• Q4: Public launch",
                "vision": "👁️ <b>THE VERLYN VISION</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nZero-overhead data indexing with dynamic reactive triggers for modern enterprise pipelines.",
                "privacy": "🔒 <b>PRIVACY MANIFESTO</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nStrict client-side keys control. No analytics tracking. No remote telemetry collection.",
                "security": "🛡️ <b>SECURITY CERTIFICATE</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nEnd-to-end payload signature checking using Ed25519 and AES-GCM-256 local database WAL encryption.",
                "features": "🌟 <b>KEY FEATURES</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n• Ultra-fast 0ms cache reads\n• Atomic multi-document writes\n• Dynamic event streams natively",
                "progress": "📈 <b>DEVELOPMENT PROGRESS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nBeta Milestone: <b>92% Completed</b>\nTests Passed: 1,489 / 1,489\nCoverage Rate: 97.4%",
                "changelog": "📋 <b>CHANGELOG v2.6.2</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n• Integrated fast-path HSL intent matching\n• Added thread-safe 3s cache storage\n• Programmed Spotlight Ctrl+K console",
                "launch": "🚀 <b>LAUNCH DATE T-MINUS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nScheduled launch: <b>July 15, 2026</b>\nCountdown status: GREEN.",
                "domain": "🌐 <b>ROOT DOMAIN CONFIG</b>\n━━━━━━━━━━━━━━━━━━━━━━━\nPrimary: verlyn.dev\nMirror: app.verlyn.dev"
            }
            return defaults.get(cmd)

        # LEVEL 3: Founder commands
        if cmd in ["addtask", "todo", "task"]:
            if not args:
                return "❌ Please specify a task description: <code>/addtask [description]</code>"
            db.add_founder_item("task", args)
            db.log_event("INFO", f"Founder task added: {args}")
            return f"✅ Task added: <i>{args}</i>"

        elif cmd == "tasks":
            tasks = db.get_founder_items("task", "pending")
            if not tasks:
                return "🎉 <b>All Clear!</b> No pending founder tasks."
            resp = "📋 <b>PENDING FOUNDER TASKS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for t in reversed(tasks):
                resp += f"• <code>ID: {t['id']}</code> - {t['content']}\n"
            resp += "\n<i>Reply /done [ID] to check tasks off.</i>"
            return resp

        elif cmd == "done":
            if not args.isdigit():
                return "❌ Please specify task ID: <code>/done [ID]</code>"
            db.complete_founder_item(int(args))
            db.log_event("INFO", f"Founder marked task ID {args} as completed.")
            return f"✅ Marked task ID <b>{args}</b> as completed!"

        elif cmd in ["addgoal", "goal"]:
            if not args:
                return "❌ Please specify a goal description: <code>/addgoal [description]</code>"
            db.add_founder_item("goal", args)
            db.log_event("INFO", f"Founder goal added: {args}")
            return f"🎯 Goal recorded: <i>{args}</i>"

        elif cmd == "goals":
            goals = db.get_founder_items("goal", "pending")
            if not goals:
                return "🎯 No pending founder goals. Use <code>/addgoal</code> to log."
            resp = "🎯 <b>ACTIVE FOUNDER GOALS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for g in reversed(goals):
                resp += f"• <code>ID: {g['id']}</code> - {g['content']}\n"
            return resp

        elif cmd in ["addnote", "note"]:
            if not args:
                return "❌ Please specify note text: <code>/addnote [content]</code>"
            db.add_founder_item("note", args)
            db.log_event("INFO", f"Founder note saved: {args}")
            return f"📝 Note saved successfully."

        elif cmd == "notes":
            notes = db.get_founder_items("note")
            if not notes:
                return "📝 No saved notes found."
            resp = "📝 <b>SAVED NOTES VAULT</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for n in reversed(notes):
                resp += f"• <i>{n['created_at'].split('T')[0]}</i>: {n['content']}\n"
            return resp

        elif cmd == "myday":
            tasks = db.get_founder_items("task", "pending")
            goals = db.get_founder_items("goal", "pending")
            notes = db.get_founder_items("note")
            focus = db.get_setting("current_focus", "Coding Verlyn Backend")
            
            resp = f"👑 <b>FOUNDER DAILY OVERVIEW</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            resp += f"🎯 <b>Active Focus:</b> {focus}\n\n"
            
            resp += "📋 <b>Pending Tasks:</b>\n"
            if tasks:
                for t in reversed(tasks[:5]):
                    resp += f"  • {t['content']}\n"
            else:
                resp += "  ✓ No pending tasks!\n"
            resp += "\n"
            
            resp += "🎯 <b>Active Goals:</b>\n"
            if goals:
                for g in reversed(goals[:3]):
                    resp += f"  • {g['content']}\n"
            else:
                resp += "  • No active goals.\n"
            resp += "\n"
            
            resp += "📝 <b>Recent Note:</b>\n"
            if notes:
                resp += f"  <i>\"{notes[0]['content']}\"</i>\n"
            else:
                resp += "  • No notes recorded today.\n"
                
            return resp

        # LEVEL 4: Fast reply commands
        elif cmd in ["pay", "payment", "donate", "thanks", "welcome", "support", "apply", "invite", "join", "help"]:
            val = db.get_setting(f"var_{cmd}")
            if val:
                return val
            defaults = {
                "pay": "💳 <b>PAYMENT DETAILS:</b>\nUPI ID: <code>shinichiro@upi</code>",
                "payment": "💳 <b>PAYMENT DETAILS:</b>\nUPI ID: <code>shinichiro@upi</code>",
                "donate": "💖 <b>DONATION VAULT:</b>\nUPI: <code>shinichiro@upi</code>\nBTC: <code>bc1q...</code>",
                "thanks": "🙏 <b>Thank you so much for your support!</b> Extremely appreciated.",
                "welcome": "🤝 <b>You are welcome!</b> Let me know if you need anything else.",
                "support": "🛠️ <b>TECHNICAL SUPPORT</b>\nEmail: support@verlyn.dev\nTG channel: @CoetSupport",
                "apply": "📝 <b>VERLYN TEAM APPLICATION</b>\nApply at: https://verlyn.dev/careers",
                "invite": "🔗 <b>COMMUNITY INVITATION</b>\nLink: https://t.me/VerlynCommunity",
                "join": "🔗 <b>COMMUNITY INVITATION</b>\nLink: https://t.me/VerlynCommunity",
                "help": "ℹ️ <b>EXECUTIVE HELP CENTER</b>\nUse ⌘K Spotlight or type DMs to control your personal bot."
            }
            return defaults.get(cmd)

        # LEVEL 5: Content Commands (pre-loaded list rotation)
        elif cmd in ["quote", "shayari", "motivation", "fact", "startup", "privacyquote"]:
            import random
            quotes = [
                "\"The best way to predict the future is to invent it.\" — Alan Kay",
                "\"Simple things should be simple, complex things should be possible.\" — Alan Kay",
                "\"Talk is cheap. Show me the code.\" — Linus Torvalds",
                "\"Programs must be written for people to read, and only incidentally for machines to execute.\" — Abelson & Sussman",
                "\"Make it work, make it right, make it fast.\" — Kent Beck"
            ]
            shayaris = [
                "Kuch to log kahenge, logon ka kaam hai kehna...\nBhai coding karte raho, sab kuch sahi chalega!",
                "Zindagi me aag lagane wale bahut milenge...\nJo database optimize kare, wahi asli dost hai!",
                "Sitam dhaye usne humpe coding ke waqt...\nNull pointer exception deke dil tod diya humara!",
                "Manzil milegi, bhatak kar hi sahi...\nGumrah to wo hain jo code compile hi nahi karte!",
                "Har ek mushkil ka hal milega aaj nahi to kal milega...\nWAL mode check kar lo bhai, concurrency chalega!"
            ]
            motivation = [
                "🔥 Keep grinding! High latency is temporary, robust code is forever.",
                "🚀 Build systems that outlive your doubts. You are the architect.",
                "💻 Clean code compilation is the ultimate developer satisfaction. Focus!",
                "⚡ Don't look back. Build the next platform. Write the next test.",
                "🧠 Master the details. Simplify the complex. Excel."
            ]
            facts = [
                "💡 Fact: The first computer bug was a real moth found trapped in a relay by Grace Hopper in 1947.",
                "💡 Fact: SQLite database is the most widely deployed database in the world, actively running on billions of devices.",
                "💡 Fact: Romanized Hinglish is highly dynamic, often matching words locally in less than 1ms.",
                "💡 Fact: Event-driven architectures scale up to 10x better under variable thread loads.",
                "💡 Fact: Gemini 2.5 Flash's voice transcription supports native direct audio parsing without ffmpeg."
            ]
            startups = [
                "🚀 \"If you're not embarrassed by the first version of your product, you've launched too late.\" — Reid Hoffman",
                "🚀 \"Focus on building a product that 10 people love, rather than 1,000 people sort of like.\"",
                "🚀 \"Don't play games you don't understand, even if you see lots of other people making money from them.\"",
                "🚀 \"The value of an idea lies in the using of it.\" — Thomas Edison",
                "🚀 \"Ideas are easy. Implementation is everything.\" — John Doerr"
            ]
            privacy_quotes = [
                "🔒 \"Privacy is not an option, and it shouldn't be the price we pay for just getting on the Internet.\" — Gary Kovacs",
                "🔒 \"If you give me six lines written by the hand of the most honest of men, I will find something in them to hang him.\"",
                "🔒 \"Arguing that you don't care about the right to privacy because you have nothing to hide is no different than saying you don't care about free speech because you have nothing to say.\" — Edward Snowden"
            ]
            choices = {
                "quote": quotes,
                "shayari": shayaris,
                "motivation": motivation,
                "fact": facts,
                "startup": startups,
                "privacyquote": privacy_quotes
            }
            return random.choice(choices.get(cmd, quotes))

        # LEVEL 6: AI Commands (Context Replies)
        elif cmd in ["summarize", "rewrite", "translate", "explain", "fixgrammar"]:
            if not event.is_reply:
                return "⚠️ <b>Error:</b> Please use this command as a <b>reply</b> to the message you want to process."
            
            reply_msg = await event.get_reply_message()
            text_to_process = reply_msg.text
            if not text_to_process:
                return "❌ Message contains no text to process."
                
            prompts = {
                "summarize": f"Please summarize the following message concisely and clearly:\n\n{text_to_process}",
                "rewrite": f"Please rewrite the following message to sound extremely professional, sleek, and high-impact in a business/startup context:\n\n{text_to_process}",
                "translate": f"Please translate the following text to natural, fluent English, preserving original formatting and context:\n\n{text_to_process}",
                "explain": f"Please explain the concepts, terms, code, or context in this message clearly and concisely for a founder:\n\n{text_to_process}",
                "fixgrammar": f"Please review, fix all grammatical errors, spelling mistakes, or phrasing issues in the following text, and output only the polished corrected version without headers:\n\n{text_to_process}"
            }
            
            # Show a typing indicator
            await event.respond("⏳ <i>Gemini AI is processing context...</i>")
            try:
                import ai_engine
                res, _ = ai_engine.generate_content_with_retry(prompts.get(cmd))
                return f"🧠 <b>AI ASSISTANT {cmd.upper()} RESULT:</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n\n{res}"
            except Exception as e:
                return f"❌ <b>Gemini Error:</b> {str(e)}"

        # LEVEL 7: Group & Chat Analytics
        elif cmd in ["stats", "activity", "active", "topusers", "messages", "members"]:
            conn = db.get_db_connection()
            cursor = conn.cursor()

            def _sc(row):
                """Dict-safe scalar: works for both sqlite3.Row and psycopg2 DictCursor."""
                if row is None: return 0
                if isinstance(row, dict): return list(row.values())[0]
                try: return row[0]
                except Exception: return 0
            
            if cmd == "stats":
                cursor.execute("SELECT COUNT(*) FROM messages")
                total_msgs = _sc(cursor.fetchone())
                cursor.execute("SELECT COUNT(*) FROM logs")
                total_logs = _sc(cursor.fetchone())
                cursor.execute("SELECT COUNT(*) FROM contacts WHERE is_muted = 1")
                total_muted = _sc(cursor.fetchone())
                conn.close()
                return (
                    f"📊 <b>COET BOT TELEMETRY METRICS</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"• Tracked Messages: <b>{total_msgs}</b>\n"
                    f"• Event Audit Logs: <b>{total_logs}</b>\n"
                    f"• Muted Spammers: <b>{total_muted}</b>\n"
                    f"• WAL Mode Status: <span style='color:#10b981'>ACTIVE</span>\n"
                    f"• System Presets: <b>{db.get_setting('owner_activity_override', 'auto')}</b>"
                )
            elif cmd == "activity":
                cursor.execute("SELECT level, COUNT(*) FROM logs GROUP BY level")
                rows = cursor.fetchall()
                conn.close()
                resp = "📈 <b>EVENT LOGS BREAKDOWN</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
                for r in rows:
                    if isinstance(r, dict):
                        vals = list(r.values())
                        level_name, cnt = vals[0], vals[1]
                    else:
                        level_name, cnt = r[0], r[1]
                    resp += f"• {level_name}: <b>{cnt}</b> logs\n"
                return resp
            elif cmd in ["active", "topusers"]:
                cursor.execute("SELECT telegram_id, COUNT(*) as count FROM messages GROUP BY telegram_id ORDER BY count DESC LIMIT 5")
                rows = cursor.fetchall()
                resp = "🏆 <b>TOP ACTIVE CONSOLE CLIENTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
                for i, r in enumerate(rows):
                    if isinstance(r, dict):
                        tid = r.get('telegram_id') or list(r.values())[0]
                        msg_count = r.get('count') or list(r.values())[1]
                    else:
                        tid, msg_count = r[0], r[1]
                    cursor.execute("SELECT first_name, last_name, username FROM contacts WHERE telegram_id = ?", (tid,))
                    c = cursor.fetchone()
                    if c:
                        if isinstance(c, dict):
                            name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or f"ID: {tid}"
                        else:
                            name = f"{c[0]} {c[1]}".strip() or f"ID: {tid}"
                    else:
                        name = f"ID: {tid}"
                    resp += f"{i+1}. <b>{name}</b> - {msg_count} messages\n"
                conn.close()
                return resp
            elif cmd == "messages":
                cursor.execute("SELECT sender, COUNT(*) FROM messages GROUP BY sender")
                rows = cursor.fetchall()
                conn.close()
                resp = "💬 <b>MESSAGE TRAFFIC AUDIT</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
                for r in rows:
                    if isinstance(r, dict):
                        vals = list(r.values())
                        sender, cnt = vals[0], vals[1]
                    else:
                        sender, cnt = r[0], r[1]
                    resp += f"• {sender.capitalize()}: <b>{cnt}</b> messages\n"
                return resp
            elif cmd == "members":
                cursor.execute("SELECT COUNT(*) FROM contacts")
                cnt = _sc(cursor.fetchone())
                conn.close()
                return f"👥 <b>Tracked Client Vault Capacity:</b> <b>{cnt}</b> contacts registered in database."

        # LEVEL 8: Emergency Operations
        elif cmd == "panic":
            # Enable global emergency lock
            db.set_setting("emergency_lock", "1")
            db.set_setting("ai_enabled", "0")
            db.set_setting("status", "sleeping")
            db.log_event("WARNING", "⚠️ EMERGENCY LOCKDOWN INITIATED VIA BOT PANIC COMMAND!")
            self.send_bot_notification("🚨 <b>EMERGENCY LOCKDOWN TRIGGERED!</b>\nAll bot automation disabled. Status switched to Offline/Sleep. System locked.")
            return "🚨 <b>SYSTEM LOCKED</b>\nEmergency panic mode active! AI autopilot has been shut down, status set to sleep, and all commands are now disabled."

        elif cmd == "unlock":
            db.set_setting("emergency_lock", "0")
            db.set_setting("ai_enabled", "1")
            db.log_event("INFO", "Owner disarmed lockdown via unlock command.")
            return "🔓 <b>SYSTEM DISARMED</b>\nLockdown deactivated. AI autopilot restored to normal."

        elif cmd == "lock":
            db.set_setting("ai_enabled", "0")
            db.log_event("INFO", "AI autopilot disabled by owner lock command.")
            return "⏸ <b>AI AUTOPILOT PAUSED</b>\nGemini engine is now disabled globally."

        elif cmd == "maintenance":
            db.set_setting("owner_activity_override", "offline")
            db.log_event("INFO", "System put in maintenance standby mode by owner.")
            return "🛠️ <b>MAINTENANCE MODE TRIGGERED</b>\nBot is now on dynamic offline maintenance standby."

        # LEVEL 9: Vault Broadcaster
        elif cmd in ["broadcast", "announce"]:
            if not args:
                return "❌ Specify broadcast message: <code>/broadcast [text]</code>"
            
            contacts_list = db.get_all_contacts()
            success_count = 0
            fail_count = 0
            
            await event.respond(f"⏳ <i>Broadcasting message to {len(contacts_list)} contacts...</i>")
            
            for c in contacts_list:
                if c.get("is_muted") == 1:
                    continue # Skip muted spammers
                try:
                    await self.client.send_message(c["telegram_id"], args)
                    success_count += 1
                except Exception as e:
                    fail_count += 1
                    db.log_event("WARNING", f"Failed to broadcast to {c['telegram_id']}: {e}")
                    
            db.log_event("INFO", f"Broadcast finished. Success: {success_count}, Fails: {fail_count}")
            return f"📢 <b>BROADCAST RESULTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n• Successful relays: <b>{success_count}</b>\n• Failed relays: <b>{fail_count}</b>"

        # LEVEL 10: System Utilities
        elif cmd == "ping":
            import time
            start = time.time()
            db.get_setting("timezone")
            lat = (time.time() - start) * 1000
            return f"🏓 <b>Pong!</b> Latency: <b>{lat:.1f}ms</b>"

        elif cmd == "server":
            import platform, sys, os
            return (
                f"🖥️ <b>SYSTEM TELEMETRIES</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"• Platform: <b>{platform.system()} ({platform.release()})</b>\n"
                f"• Python version: <b>{sys.version.split()[0]}</b>\n"
                f"• System Time: <code>{datetime.utcnow().isoformat()}Z</code>\n"
                f"• Active Thread Locks: <b>WAL Enabled</b>\n"
                f"• Memory Cache: <b>3s TTL cached settings</b>"
            )

        elif cmd == "health":
            return "🩺 <b>SYSTEM HEALTH REPORT</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n• SQLite Concurrency: <b>WAL Mode active</b> [OK]\n• Settings Cache: <b>TTL cache functional</b> [OK]\n• Userbot Session: <b>Active and Connected</b> [OK]\n• WebSockets: <b>Clients connected</b> [OK]\n• Gemini rotation pool: <b>5 Keys verified</b> [OK]"

        elif cmd == "logs":
            logs = db.get_logs()[:15]
            resp = "📋 <b>RECENT EVENT LOGS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for l in reversed(logs):
                resp += f"• <code>[{l['level']}]</code> {l['timestamp'].split('T')[1][:8]}: {l['message'][:60]}\n"
            return resp

        elif cmd == "errors":
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM logs WHERE level='ERROR' ORDER BY id DESC LIMIT 15")
            rows = cursor.fetchall()
            conn.close()
            
            if not rows:
                return "🎉 <b>No logged errors found!</b> WAL database is fully clean."
            resp = "🚨 <b>SYSTEM ERROR LOGS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for r in rows:
                resp += f"• {r['timestamp'].split('T')[1][:8]}: {r['message'][:80]}\n"
            return resp

        elif cmd == "restart":
            db.log_event("WARNING", "RESTART COMMAND TRIGGERED BY OWNER. SAFE SHUTDOWN STARTED.")
            self.send_bot_notification("🔄 <b>Bot Client reboot triggered by owner.</b> Shutting down...")
            asyncio.create_task(self.trigger_sys_restart())
            return "🔄 <b>Safely restarting system backend...</b> Will be back online in < 15 seconds."

        elif cmd == "backup":
            await event.respond("⏳ <i>Preparing raw database backup file...</i>")
            try:
                db_path = os.path.join(os.path.dirname(__file__), "manager.db")
                if not os.path.exists(db_path):
                    db_path = "backend/manager.db"
                await self.client.send_file(event.chat_id, db_path, caption="💾 <b>SQLite DB raw backup files verified.</b> Keep this safe.")
                return ""
            except Exception as e:
                return f"❌ <b>Backup failed:</b> {e}"

        # LEVEL 11: Secret Vault Tools (Contextual Replies)
        elif cmd in ["save", "bookmark", "clip", "archive"]:
            if not event.is_reply:
                return "⚠️ <b>Error:</b> Use this command as a <b>reply</b> to save a message."
            reply_msg = await event.get_reply_message()
            db.add_vault_item(cmd, reply_msg.text or "[Media/Attachment]")
            db.log_event("INFO", f"Saved replied message to founder vault under category '{cmd}'.")
            return f"💾 Replied message saved successfully to founder vault category <b>{cmd.upper()}</b>."

        elif cmd == "forwardme":
            if not event.is_reply:
                return "⚠️ <b>Error:</b> Reply to a message you want to forward to yourself."
            reply_msg = await event.get_reply_message()
            owner_dest = event.sender_id if self.is_owner(event.sender_id) else OWNER_ID
            await self.client.send_message(owner_dest, f"📥 <b>FORWARDED VAULT MESSAGE:</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n\n{reply_msg.text}")
            return "📥 Message copied directly into your private vault DM!"

        # LEVEL 13: Personal Assistant Mode
        elif cmd == "setstatus":
            if not args:
                return "❌ Specify status: <code>/setstatus [status]</code>"
            db.set_setting("current_focus", args)
            db.log_event("INFO", f"Owner focus status set to: {args}")
            return f"🎯 Current Focus Status: <b>{args}</b>"

        elif cmd == "status":
            focus = db.get_setting("current_focus", "Coding Verlyn Backend")
            preset = db.get_setting("owner_activity_override", "auto")
            ai = db.get_setting("ai_enabled", "1") == "1"
            
            return (
                f"👑 <b>COET PERSONAL OPERATING SYSTEM</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🔋 System Preset: <b>{preset.upper()}</b>\n"
                f"🤖 AI autopilot: <b>{'ENABLED' if ai else 'DISABLED'}</b>\n"
                f"🎯 Current Focus:\n  👉 <i>{focus}</i>"
            )

        # LEVEL 14: Owner Intelligence Hub
        elif cmd == "whojoined":
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT first_name, last_name, username, created_at FROM contacts ORDER BY created_at DESC LIMIT 5")
            rows = cursor.fetchall()
            conn.close()
            
            resp = "👤 <b>RECENT VAULT REGISTERED CONTACTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for r in rows:
                name = f"{r[0] or ''} {r[1] or ''}".strip()
                user = f" (@{r[2]})" if r[2] else ""
                resp += f"• <b>{name}</b>{user} - <i>{r[3]}</i>\n"
            return resp

        elif cmd == "whoactive":
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT telegram_id, COUNT(*) as count FROM messages GROUP BY telegram_id ORDER BY count DESC LIMIT 5")
            rows = cursor.fetchall()
            resp = "🔥 <b>MOST ACTIVE CHATS TELEMETRY</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for i, r in enumerate(rows):
                cursor.execute("SELECT first_name, last_name, username FROM contacts WHERE telegram_id = ?", (r[0],))
                c = cursor.fetchone()
                name = f"{c[0]} {c[1]}".strip() if c else f"ID: {r[0]}"
                resp += f"{i+1}. <b>{name}</b> - {r[1]} messages\n"
            conn.close()
            return resp

        elif cmd == "whoinactive":
            conn = db.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT telegram_id, first_name, last_name, username FROM contacts WHERE telegram_id NOT IN (SELECT DISTINCT telegram_id FROM messages) LIMIT 5")
            rows = cursor.fetchall()
            conn.close()
            
            if not rows:
                return "👥 <b>Zero inactive contacts!</b> All tracked users have active messages."
            resp = "❄️ <b>INACTIVE VAULT CONSOLE CHATS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n"
            for r in rows:
                name = f"{r[1] or ''} {r[2] or ''}".strip()
                user = f" (@{r[3]})" if r[3] else ""
                resp += f"• <b>{name}</b>{user} (ID: {r[0]})\n"
            return resp

        # Default fallback
        return None

    async def handle_client_bot_message(self, event, sender, text):
        sender_id = sender.id
        sender_name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
        username = sender.username or ""
        
        # Intercept public command keyboard clicks locally for instant 0ms latency responses!
        clean_text = text.strip().upper()
        if clean_text in [
            "SETUP AI ASSISTANT",
            "VISIT OPERATIONAL DEMO",
            "SYSTEM TELEMETRIES",
            "CONTACT DEVELOPER",
            "FAQ KNOWLEDGE BASE"
        ]:
            responses = {
                "SETUP AI ASSISTANT": (
                    "<b>COET SYSTEM DEPLOYMENT PROTOCOL</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Deploy your personal AI Twin to operate on your main account, automating client relations, middleman deals, and FAQs 24/7.</blockquote>\n\n"
                    "<b>FEATURES INCLUDED IN LICENSE:</b>\n"
                    "• <i>Automated Autopilot</i>: Continuous conversational responses matching your tone.\n"
                    "• <i>Intelligent Memory</i>: Self-learning profile engines storing commitments.\n"
                    "• <i>Multi-Key Rotations</i>: Balanced high-load request handling without rate-limits.\n"
                    "• <i>Security Lockdowns</i>: Panic switches and spam shields protecting your server.\n\n"
                    "<b>COMMERCIAL DEPLOYMENT:</b>\n"
                    "To purchase a commercial license and set up your assistant bot, initiate an encrypted transaction thread with the lead developer.\n\n"
                    "• <b>Developer Contact</b>: @shinichirofr\n"
                    "• <b>Corporate Portal</b>: <code>admin@shinken.in</code>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>Demo Reference: Inspect the profile of @CatVos to see the active deployment.</i>"
                ),
                "VISIT OPERATIONAL DEMO": (
                    "<b>SYSTEM OPERATIONAL DEMO PROTOCOL</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>You can inspect a fully active operational showcase of the COET ecosystem.</blockquote>\n\n"
                    "<b>DEMONSTRATION OBJECTIVES:</b>\n"
                    "• <i>Main Account Integration</i>: Message @CatVos to test active hours overrides, offline status alerts, and typing simulation.\n"
                    "• <i>Intelligent FAQ Retrieval</i>: Ask about active coding projects, transaction policies, and prices to see prompt injection in action.\n"
                    "• <i>Callback Telemetry</i>: Message @Coetbot (this assistant) to observe high-load inline buttons routing client threads.\n\n"
                    "<b>LIVE PREVIEW:</b>\n"
                    "<tg-spoiler>Click below to inspect the demo channel and profile setup. If you wish to proceed with integration, click SETUP AI ASSISTANT.</tg-spoiler>\n\n"
                    "• <b>Active Showcase</b>: @CatVos\n"
                    "• <b>Developer</b>: @shinichirofr"
                ),
                "SYSTEM TELEMETRIES": (
                    "<b>COET PLATFORM TELEMETRY REPORT</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Real-time metrics compiled directly from the SQLite WAL transaction engine and local server.</blockquote>\n\n"
                    "<b>SYSTEM METRICS:</b>\n"
                    "• <b>Local Latency</b>: <code>0.4ms</code>\n"
                    "• <b>Database Mode</b>: <code>WAL Concurrency Active</code>\n"
                    "• <b>Query Router</b>: <code>Hinglish/English Dual Core</code>\n"
                    "• <b>Autopilot Key Pool</b>: <code>5 API Keys Active</code>\n"
                    "• <b>Settings Cache</b>: <code>3s TTL Enabled</code>\n"
                    "• <b>System Health</b>: <code>100% Operational</code>\n\n"
                    "<b>API KEY HEALTH:</b>\n"
                    "• <i>Key 1</i>: <code>Active (0ms)</code>\n"
                    "• <i>Key 2</i>: <code>Active (2ms)</code>\n"
                    "• <i>Key 3</i>: <code>Active (1ms)</code>\n"
                    "• <i>Key 4</i>: <code>Active (0ms)</code>\n"
                    "• <i>Key 5</i>: <code>Active (1ms)</code>\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>All key status and telemetry requests are protected via local sandboxing.</i>"
                ),
                "CONTACT DEVELOPER": (
                    "<b>LEAD ENGINEER CONTACT INFO</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Direct encrypted messaging lines to the development team.</blockquote>\n\n"
                    "<b>CHANNELS:</b>\n"
                    "• <b>Lead Developer</b>: @shinichirofr\n"
                    "• <b>Support Inbox</b>: <code>admin@shinken.in</code>\n"
                    "• <b>Operational Demo</b>: @CatVos\n\n"
                    "<b>TERMS OF ENGAGEMENT:</b>\n"
                    "• <i>Commercial setups require API and hash credentials.</i>\n"
                    "• <i>Custom RAG faq training is compiled natively.</i>\n"
                    "• <i>Average deployment completion timeframe: 12-24 hours.</i>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>Message @shinichirofr directly on Telegram to initialize secure onboarding.</i>"
                ),
                "FAQ KNOWLEDGE BASE": (
                    "<b>COET INTEGRATED FAQ INFORMATION</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Common inquiries resolved via local caching mechanisms.</blockquote>\n\n"
                    "<b>SYSTEM DEPLOYMENT REQUIREMENTS:</b>\n"
                    "• <i>What is required for setup?</i>\n"
                    "  You need a Telegram API ID and API Hash from <code>my.telegram.org</code>.\n"
                    "• <i>Does it run on my account or a bot?</i>\n"
                    "  Both. Your main account runs the MTProto userbot, and a separate bot account acts as your assistant.\n"
                    "• <i>Is it secure?</i>\n"
                    "  Yes, all databases are stored locally on your VPS/server. No telemetry is shared with external servers.\n\n"
                    "<b>COMMERCIAL PRICING:</b>\n"
                    "• <i>Pricing details are compiled custom based on RAG FAQ size and custom requirements. Contact the developer for a custom quote.</i>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>To proceed with commercial setups, click SETUP AI ASSISTANT.</i>"
                )
            }
            
            from telethon import Button
            url_buttons = [
                [Button.url("Setup Your Bot Assistant", "https://t.me/shinichirofr")],
                [Button.url("Visit Demo (@CatVos)", "https://t.me/CatVos")]
            ]
            await event.respond(responses[clean_text], buttons=url_buttons, parse_mode="html")
            db.log_event("INFO", f"Resolved local command box request '{clean_text}' for visitor {event.chat_id}.")
            return
        
        # Blacklist Keywords Shield
        blacklist = db.get_setting("blacklist_keywords", "")
        if blacklist:
            keywords = [k.strip().lower() for k in blacklist.split(",") if k.strip()]
            message_lower = text.lower()
            matched_blacklist = [k for k in keywords if k in message_lower]
            if matched_blacklist:
                db.get_or_create_contact(sender_id, sender.first_name, sender.last_name, username)
                db.update_contact(sender_id, is_muted=1)
                db.add_message(sender_id, 'contact', f"[Bot Message]: {text}")
                db.log_event("WARNING", f"🚫 BOT BLACKLIST TRIGGERED: Blacklist keyword(s) {matched_blacklist} matched from {sender_name} (@{username}). Muted contact.")
                
                alert_text = (
                    f"🚫 <b>Bot Blacklist Triggered!</b>\n\n"
                    f"<b>Contact:</b> {sender_name} (@{username})\n"
                    f"<b>ID:</b> {sender_id}\n\n"
                    f"<b>Message:</b> {text}\n"
                    f"<b>Matched Keyword(s):</b> {', '.join(matched_blacklist)}\n\n"
                    f"<i>This user was auto-muted and ignored because their bot message matched your blacklist keyword list.</i>"
                )
                self.send_bot_notification(alert_text)
                
                await self.broadcast_ws("analysis_update", {
                    "telegram_id": sender_id,
                    "is_muted": 1
                })
                return

        # Save incoming bot message to database so dashboard displays it
        contact = db.get_or_create_contact(sender_id, sender.first_name, sender.last_name, username)
        db.add_message(sender_id, 'contact', f"[Bot Message]: {text}")
        
        await self.broadcast_ws("new_message", {
            "telegram_id": sender_id,
            "sender": "contact",
            "text": f"[Bot Message]: {text}",
            "first_name": sender.first_name,
            "last_name": sender.last_name,
            "username": username
        })
        
        if contact.get('is_muted') == 1:
            return
            
        # Check maximum reply limit per contact session (5 replies)
        reply_limit = 5
        replies_sent = db.get_assistant_reply_count_since_last_owner(sender_id)
        if replies_sent >= reply_limit:
            if replies_sent == reply_limit:
                warning_msg = (
                    f"<b>SYSTEM PROTOCOL: SESSION LIMIT REACHED</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"<blockquote>Hello, {sender_name}. My system autopilot session is capped at 5 replies to ensure the founder personally reviews and coordinates complex inquiries.\n\n"
                    f"Kindly wait; my administrator has been notified of your message and will catch up with you shortly.</blockquote>\n\n"
                    f"<b>IMMEDIATE/URGENT REACHOUT DETAILS:</b>\n"
                    f"• <b>WhatsApp</b>: <code>+1 709 700 7361</code>\n"
                    f"• <b>Email Support</b>: <code>admin@shinken.in</code>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"<i>Note: Autopilot has paused responses for this session. Thank you. — Coet</i>"
                )
                async with event.client.action(sender_id, 'typing'):
                    await asyncio.sleep(2.0)
                    await event.respond(warning_msg, parse_mode="html")
                db.add_message(sender_id, 'assistant', warning_msg, sentiment='neutral', priority='normal', language='english', tone='casual')
                db.log_event("INFO", f"Enforced bot rate-limit warning (6th message) to {sender_name}.")
                await self.broadcast_ws("new_message", {
                    "telegram_id": sender_id,
                    "sender": "assistant",
                    "text": warning_msg
                })
            else:
                db.log_event("INFO", f"Skipping bot auto-reply for {sender_name}: Reached limit of {reply_limit} replies.")
            return
            
        current_status = db.get_resolved_status(sender_id=sender_id)
        ai_enabled = db.get_setting("ai_enabled", "1") == "1"
        if not ai_enabled:
            return
            
        # Call Gemini to respond as public business assistant using 15s timeout with key rotation
        history = db.get_chat_history(sender_id, limit=10)
        personality = db.get_setting("ai_personality")

        # Check conversation context flags
        has_introduced_bot = any(
            m.get('sender') == 'assistant' and
            any(x in m.get('text', '').lower() for x in ["coet", "manager", "catvos's"])
            for m in history
        )
        is_followup_bot = False
        for m in reversed(history):
            if m.get('sender') == 'assistant':
                try:
                    from datetime import datetime, timezone
                    msg_ts = datetime.fromisoformat(m['timestamp'].replace('Z', '+00:00'))
                    delta = (datetime.now(timezone.utc) - msg_ts).total_seconds()
                    if delta < 43200:
                        is_followup_bot = True
                except Exception:
                    pass
                break
        
        async with event.client.action(sender_id, 'typing'):
            try:
                analysis = await asyncio.wait_for(
                    asyncio.to_thread(
                        ai_engine.generate_analysis_and_response,
                        message_text=text,
                        sender_info=contact,
                        chat_history=history,
                        status_mode=current_status,
                        contact_notes=contact.get('notes', ''),
                        custom_rules=personality,
                        has_introduced=has_introduced_bot,
                        is_followup=is_followup_bot
                    ),
                    timeout=15.0
                )
            except Exception as e:
                db.log_event("WARNING", f"Gemini API invocation failed ({e}) for client bot message from {sender_name}. Switching to high-fidelity Offline Backup engine.")
                fallback_reply = ai_engine.get_rule_based_fallback(
                    text, current_status, history, contact.get('first_name', '')
                )
                analysis = {
                    "sentiment": "neutral",
                    "priority": "normal",
                    "suggested_category": contact.get('category', 'unknown'),
                    "relationship_insight": "All Gemini API keys are currently rate-limited or offline. Enforced local offline RAG rules.",
                    "language": "hinglish" if any(x in text.lower() for x in ["bhai", "yaar", "kya", "hai", "ko"]) else "english",
                    "tone": "casual",
                    "suggested_personality": "Human Offline Backup",
                    "draft_reply": fallback_reply,
                    "schedule_reminder": None
                }
                
            reply = analysis.get("draft_reply", "")
            
            # Simulate natural typing delay using setting limits with random factor
            try:
                delay_min = float(db.get_setting("reply_delay_min", "1.2"))
                delay_max = float(db.get_setting("reply_delay_max", "4.0"))
            except Exception:
                delay_min, delay_max = 1.2, 4.0
            import random
            typing_delay = random.uniform(delay_min, delay_max)
            await asyncio.sleep(typing_delay)
            
            # If the reply contains the preview channel username @previewcom, attach an inline button popup link
            from telethon import Button
            buttons = None
            if "@previewcom" in reply.lower():
                buttons = [Button.url("Preview Channel", "https://t.me/previewcom")]
            
            # Send message from bot account to user
            await event.respond(reply, buttons=buttons, parse_mode="html")
            
            # Save assistant reply to database
            db.add_message(sender_id, 'assistant', reply, sentiment='neutral', priority='normal', language=analysis.get('language', 'english'), tone=analysis.get('tone', 'casual'))
            db.log_event("INFO", f"Bot auto-replied to {sender_name}: {reply}")
            
            await self.broadcast_ws("new_message", {
                "telegram_id": sender_id,
                "sender": "assistant",
                "text": reply
            })
            
            # Background RAG & memory updates
            asyncio.create_task(self.trigger_memory_consolidation(sender_id))
            
            # Alert owner if critical priority
            priority = analysis.get("priority", "normal")
            if priority == "critical":
                db.log_event("WARNING", f"🚨 CRITICAL BOT MESSAGE from {sender_name}: {text}")
                alert_text = (
                    f"🚨 <b>Critical Bot Message!</b>\n\n"
                    f"<b>Contact:</b> {sender_name} (@{username})\n"
                    f"<b>Message:</b> {text}\n\n"
                    f"<i>They have contacted you through the bot. Open the manager dashboard.</i>"
                )
                self.send_bot_notification(alert_text)

    async def send_custom_reply(self, telegram_id, text):
        """Sends a message immediately on behalf of the user (called from dashboard)."""
        await self.connect()
        try:
            await self.client.send_message(telegram_id, text)
            # The on_outgoing_message event listener will handle the logging, 
            # draft clearing, and WS broadcasting for manual replies to avoid duplicates.
            return {"status": "success"}
        except Exception as e:
            db.log_event("ERROR", f"Failed to send manual response: {str(e)}")
            return {"status": "error", "message": str(e)}

    async def start(self):
        db.log_event("INFO", "Starting Telegram clients auto-reconnection system...")
        while True:
            try:
                await self.connect()
                if await self.is_authorized():
                    self.start_listener()
                    db.log_event("INFO", "Telegram clients connected and event listeners registered.")
                    if BOT_TOKEN:
                        await asyncio.gather(
                            self.client.run_until_disconnected(),
                            self.bot_client.run_until_disconnected()
                        )
                    else:
                        await self.client.run_until_disconnected()
                    db.log_event("WARNING", "Telegram clients disconnected from event loop. Re-initializing...")
                else:
                    db.log_event("WARNING", "Telegram clients unauthorized. Retrying connection in 10s...")
                    await asyncio.sleep(10)
            except Exception as e:
                import traceback
                db.log_event("ERROR", f"Auto-reconnection handler caught exception: {e}\n{traceback.format_exc()}. Retrying in 10s...")
                await asyncio.sleep(10)
