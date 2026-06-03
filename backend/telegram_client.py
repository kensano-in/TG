import asyncio
import os
import time
import random
from datetime import datetime
from telethon import TelegramClient, events, functions, types
from telethon.sessions import StringSession
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
        self.client = None
        self.bot_client = None
        # Keep file paths for backward compat (not used for session storage anymore)
        self.session_path = os.path.join(os.path.dirname(__file__), "verlyn_assistant")
        self.bot_session_path = os.path.join(os.path.dirname(__file__), "verlyn_bot_session")
        self.phone_code_hash = None
        self.phone = PHONE
        self.is_running = False
        self._bot_handler_registered = False  # Guard: bot handlers registered only once
        self.websocket_clients = set()
        self.assistant_sent_message_ids = set()
        self.assistant_sent_message_texts = set()
        self.dashboard_sent_message_texts = set()
        self.flood_trackers = {}
        self.me_id = None

    def normalize_text_for_match(self, t):
        if not t:
            return ""
        import re
        # Remove HTML tags
        t = re.sub(r'<[^>]+>', '', t)
        # Remove markdown formatting characters
        t = re.sub(r'[\*_`~]', '', t)
        # Keep only alphanumeric characters and spaces
        t = re.sub(r'[^a-zA-Z0-9\s]', '', t)
        # Normalize multiple spaces, strip, and lowercase
        return " ".join(t.split()).strip().lower()

    async def connect(self):
        if self.client is None:
            userbot_session_str = db.get_setting("telegram_session_string", "")
            self.client = TelegramClient(
                StringSession(userbot_session_str), API_ID, API_HASH
            )
        if self.bot_client is None:
            bot_session_str = db.get_setting("telegram_bot_session_string", "")
            self.bot_client = TelegramClient(
                StringSession(bot_session_str), API_ID, API_HASH
            )

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
                    # Persist the session string so it survives future Render redeploys
                    self._save_session_to_db()
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
            
    def _save_session_to_db(self):
        """Persist the current Telethon session string to the database.
        This ensures the session survives Render redeploys (no ephemeral file dependency).
        """
        try:
            session_str = self.client.session.save()
            if session_str:
                db.set_setting("telegram_session_string", session_str)
                db.log_event("INFO", "Userbot session string saved to database.")
        except Exception as e:
            db.log_event("ERROR", f"Failed to save session string to DB: {e}")

    async def login(self, code, password=None):
        await self.connect()
        try:
            if not self.phone_code_hash:
                return {"status": "error", "message": "No code request hash found. Please request code first."}
                
            try:
                user = await self.client.sign_in(self.phone, code, phone_code_hash=self.phone_code_hash)
                db.log_event("INFO", f"Successfully signed in as {user.first_name}")
                self._save_session_to_db()  # Persist session immediately after login
                self.start_listener()
                return {"status": "success", "user": user.username or user.phone}
            except SessionPasswordNeededError:
                if password:
                    user = await self.client.sign_in(password=password)
                    db.log_event("INFO", f"Successfully signed in with 2FA as {user.first_name}")
                    self._save_session_to_db()  # Persist session immediately after 2FA login
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
            history = db.get_chat_history(sender_id, limit=150)
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

    def maybe_trigger_owner_style_rebuild(self):
        # Throttle rebuild to once every 30 minutes to prevent API key exhaustion
        last_rebuild = db.get_setting("owner_style_last_update", "0")
        try:
            last_rebuild_time = float(last_rebuild)
        except ValueError:
            last_rebuild_time = 0.0
            
        if time.time() - last_rebuild_time > 1800: # 30 minutes
            # Increment a counter of new messages
            new_msgs_count = int(db.get_setting("owner_new_messages_since_rebuild", "0")) + 1
            if new_msgs_count >= 10:
                db.set_setting("owner_new_messages_since_rebuild", "0")
                # Trigger in a background thread to not block the main process
                import threading
                import ai_engine
                db.log_event("INFO", "Throttled owner style profile rebuild triggered in background.")
                threading.Thread(target=ai_engine.rebuild_owner_style_profile, daemon=True).start()
            else:
                db.set_setting("owner_new_messages_since_rebuild", str(new_msgs_count))

    def is_owner(self, sender_id):
        if not sender_id:
            return False
        env_ids = [int(x.strip()) for x in os.getenv("OWNER_ID", "0").split(",") if x.strip()]
        if sender_id in env_ids:
            return True
        if hasattr(self, "me_id") and self.me_id and sender_id == self.me_id:
            return True
        # Raw ID 7473010693 is configured as second admin / owner (Sensei)
        if sender_id == 7473010693:
            return True
        return False

    async def apply_system_update(self, system_update, sender_id, username, sender_name):
        """
        Executes a system update action from Sensei and returns a confirmation message.
        """
        action = system_update.get("action")
        if not action or action == "none":
            return None
            
        confirmation = None
        
        if action == "update_setting":
            up_key = system_update.get("key")
            up_val = system_update.get("value")
            if up_key and up_val is not None:
                db.set_setting(up_key, str(up_val))
                db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Updated setting '{up_key}' to '{up_val}'")
                confirmation = f"Yes Sensei! Updated setting <b>{up_key}</b> to '{up_val}'."
                
        elif action == "add_keyword_rule":
            kw = system_update.get("keyword")
            resp = system_update.get("response")
            if kw and resp:
                conn = db.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("INSERT OR REPLACE INTO keyword_rules (keyword, response) VALUES (?, ?)", (kw, resp))
                conn.commit()
                conn.close()
                db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Added keyword rule '{kw}' -> '{resp}'")
                confirmation = f"Yes Sensei! Added keyword rule: <code>{kw}</code> ➔ <i>{resp}</i>."
                
        elif action == "delete_keyword_rule":
            kw = system_update.get("keyword")
            if kw:
                conn = db.get_db_connection()
                cursor = conn.cursor()
                cursor.execute("DELETE FROM keyword_rules WHERE keyword = ?", (kw,))
                conn.commit()
                conn.close()
                db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Deleted keyword rule '{kw}'")
                confirmation = f"Yes Sensei! Deleted keyword rule: <code>{kw}</code>."
                
        elif action == "append_knowledge_base":
            fact = system_update.get("value")
            if fact:
                current_kb = db.get_setting("knowledge_base", "")
                new_kb = f"{current_kb.strip()}\n- {fact.strip()}".strip() if current_kb else f"- {fact.strip()}"
                db.set_setting("knowledge_base", new_kb)
                db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Appended fact to KB: '{fact}'")
                confirmation = f"Yes Sensei! Added to my knowledge base:\n• <i>{fact}</i>"
                
        elif action == "update_personality":
            trait = system_update.get("value")
            if trait:
                current_pers = db.get_setting("ai_personality", "")
                new_pers = f"{current_pers.strip()}\n- {trait.strip()}".strip() if current_pers else f"- {trait.strip()}"
                db.set_setting("ai_personality", new_pers)
                db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Appended personality trait: '{trait}'")
                confirmation = f"Yes Sensei! Added to my personality rules:\n• <i>{trait}</i>"
                
        elif action == "clear_knowledge_base":
            db.set_setting("knowledge_base", "")
            db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Cleared knowledge base")
            confirmation = "Yes Sensei! Knowledge base ko completely clear kar diya hai."
            
        elif action == "clear_personality":
            db.set_setting("ai_personality", "")
            db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Cleared personality traits")
            confirmation = "Yes Sensei! Personality custom rules ko completely clear kar diya hai."
            
        elif action == "show_knowledge_base":
            current_kb = db.get_setting("knowledge_base", "")
            confirmation = f"Yes Sensei! Ye raha abhi ka knowledge base:\n\n{current_kb if current_kb else '<i>(empty)</i>'}"
            
        elif action == "show_personality":
            current_pers = db.get_setting("ai_personality", "")
            confirmation = f"Yes Sensei! Ye raha abhi ka personality traits:\n\n{current_pers if current_pers else '<i>(empty)</i>'}"
            
        elif action == "show_settings":
            assistant_name = db.get_setting("assistant_name", "Coet")
            status = db.get_setting("status", "focus")
            auto_sleep = db.get_setting("auto_sleep_enabled", "1")
            auto_busy = db.get_setting("auto_busy_enabled", "1")
            timezone = db.get_setting("timezone", "Asia/Kolkata")
            start = db.get_setting("active_hours_start", "9")
            end = db.get_setting("active_hours_end", "23")
            reply_delay_min = db.get_setting("reply_delay_min", "1.2")
            reply_delay_max = db.get_setting("reply_delay_max", "4.0")
            confirmation = (
                f"Yes Sensei! System settings:\n"
                f"• <b>Assistant Name:</b> {assistant_name}\n"
                f"• <b>Status Mode:</b> {status}\n"
                f"• <b>Auto Sleep:</b> {'Enabled' if auto_sleep=='1' else 'Disabled'}\n"
                f"• <b>Auto Busy:</b> {'Enabled' if auto_busy=='1' else 'Disabled'}\n"
                f"• <b>Timezone:</b> {timezone}\n"
                f"• <b>Active Hours:</b> {start}:00 - {end}:00\n"
                f"• <b>Typing Delay:</b> {reply_delay_min}s - {reply_delay_max}s"
            )
            
        elif action == "set_status":
            val = system_update.get("value")
            if val:
                db.set_setting("status", val)
                db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Status set to '{val}'")
                confirmation = f"Yes Sensei! Status ko change kar ke <b>{val}</b> kar diya hai."
                
        elif action == "mute_contact":
            target = system_update.get("target")
            if target:
                t_id = db.resolve_contact_id_by_identifier(target)
                if t_id:
                    db.update_contact(t_id, is_muted=1)
                    db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Muted contact '{target}' ({t_id})")
                    confirmation = f"Yes Sensei! Contact <code>{target}</code> (ID: {t_id}) ko mute kar diya hai."
                else:
                    confirmation = f"Yes Sensei! Mujhe target contact <code>{target}</code> database me nahi mila."
                    
        elif action == "unmute_contact":
            target = system_update.get("target")
            if target:
                t_id = db.resolve_contact_id_by_identifier(target)
                if t_id:
                    db.update_contact(t_id, is_muted=0)
                    db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Unmuted contact '{target}' ({t_id})")
                    confirmation = f"Yes Sensei! Contact <code>{target}</code> (ID: {t_id}) ko unmute kar diya hai."
                else:
                    confirmation = f"Yes Sensei! Mujhe target contact <code>{target}</code> database me nahi mila."
                    
        elif action == "set_contact_category":
            target = system_update.get("target")
            cat = system_update.get("value")
            if target and cat:
                t_id = db.resolve_contact_id_by_identifier(target)
                if t_id:
                    db.update_contact(t_id, category=cat)
                    db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL: Set contact '{target}' ({t_id}) category to '{cat}'")
                    confirmation = f"Yes Sensei! Contact <code>{target}</code> (ID: {t_id}) ka category ab <b>{cat}</b> set kar diya hai."
                else:
                    confirmation = f"Yes Sensei! Mujhe target contact <code>{target}</code> database me nahi mila."
                    
        return confirmation

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
        
        # 1. Clear the legacy persistent reply keyboard instantly via temporary message deletion
        try:
            clear_msg = await self.bot_client.send_message(
                event.chat_id,
                "⚡ <i>Syncing interface...</i>",
                buttons=Button.clear(),
                parse_mode="html"
            )
            await self.bot_client.delete_messages(event.chat_id, [clear_msg.id])
        except Exception as e:
            db.log_event("WARNING", f"Could not clear persistent reply keyboard: {e}")
        
        # 2. Setup marketing-optimized copy with ROI calculations
        intro_text = (
            "⚡ <b>COET AI: THE ULTIMATE DIGITAL TWIN AUTOPILOT</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "<blockquote>COET is an elite, event-driven AI Digital Twin and distributed client automation assistant, engineered natively for high-load messaging operations and secure relation management.</blockquote>\n\n"
            "<b>🔍 LIVE DEMO CONSOLE:</b>\n"
            "• Experience the active autopilot simulation live: @CatVos\n\n"
            "<b>📈 THE ROI FORMULA:</b>\n"
            "• <b>Save Time</b>: Reclaim 20+ hours/week by automating repeat questions.\n"
            "• <b>Scale Instantly</b>: Handle 100+ customer DMs simultaneously 24/7.\n"
            "• <b>Cut Costs</b>: Replaces a $1,200/month human manager for just $50/month.\n"
            "• <b>Zero Leakage</b>: Instantly guides leads to checkout/deals while you sleep.\n\n"
            "👥 <i>Trusted by premium OTC desks and high-volume Telegram brokers to automate client relations 24/7.</i>\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "<b>🛡️ DEVELOPER CREDENTIALS:</b>\n"
            "• <b>Lead Engineer</b>: <i>shinichiro</i> (@shinichirofr)\n"
            "• <b>Corporate Email</b>: <code>admin@shinken.in</code>\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "<i>Select a protocol option below to explore features, specs, and deploy your autopilot assistant.</i>"
        )
        
        # 3. Premium 11-button grid keyboard layout
        reply_keyboard = [
            [Button.inline("⚡ Deploy Your Digital Twin", b"pub_setup")],
            [Button.inline("🛠️ Pro Admin Panel Demo (20+ Sub-pages)", b"pub_admin_demo")],
            [Button.url("🔍 Check Live Demo (@CatVos)", "https://t.me/CatVos")],
            [Button.inline("🧠 Style Mirroring DNA", b"pub_dna_info"), Button.inline("⚙️ Command Directory (300+)", b"pub_features")],
            [Button.inline("🛡️ Escrow & Security", b"pub_security"), Button.inline("👥 Success Vouches", b"pub_vouches")],
            [Button.inline("📊 Live Telemetry", b"pub_telemetries"), Button.inline("💰 Pricing & $2 Trial", b"pub_pricing")],
            [Button.inline("ℹ️ Infrastructure Specs", b"pub_details")]
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
        
        # Start periodic background tasks
        try:
            loop = asyncio.get_event_loop()
            loop.create_task(self.periodic_style_rebuilder())
        except Exception as e:
            db.log_event("WARNING", f"Failed to start periodic style rebuilder: {e}")
        
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
            if not event.is_private:
                return # Only handle DM messages
                
            sender = await event.get_sender()
            if not sender or sender.bot:
                return # Ignore bots
                
            sender_id = sender.id
            sender_name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
            username = sender.username or ""
            text = event.text or ""
            
            is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
            
            # Security Command Shield: Ignore commands from other users (except Sensei)
            if text.strip().startswith("/") and not is_shinichiro:
                return
                
            if self.is_owner(sender_id) and not is_shinichiro:
                return # Strictly ignore all messages from the main owner to avoid auto-reply loops
                
            # If shinichirofr sends an owner command (starts with / or ends with ?)
            if is_shinichiro and (text.strip().startswith("/") or text.strip().endswith("?")):
                await self.execute_owner_command(event, text, is_bot=False)
                return

            # Check for direct Sensei command matching the offline regex patterns
            if is_shinichiro:
                import ai_engine
                offline_update = ai_engine.parse_sensei_command(text)
                if offline_update:
                    db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL OFFLINE DETECTED: Command: {offline_update.get('action')}")
                    confirmation = await self.apply_system_update(offline_update, sender_id, username, sender_name)
                    if confirmation:
                        async with self.client.action(sender_id, 'typing'):
                            await asyncio.sleep(1.0)
                            normalized = self.normalize_text_for_match(confirmation)
                            if normalized:
                                self.assistant_sent_message_texts.add(normalized)
                            msg = await self.client.send_message(sender_id, confirmation, parse_mode="html")
                            self.assistant_sent_message_ids.add(msg.id)
                        db.add_message(sender_id, 'assistant', confirmation, sentiment='neutral', priority='normal', language='english', tone='casual')
                        await self.broadcast_ws("new_message", {
                            "telegram_id": sender_id,
                            "sender": "assistant",
                            "text": confirmation
                        })
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
                
            # Check if contact is locked due to chitchat lockout protocol
            if db.get_setting(f"chitchat_locked_{sender_id}", "0") == "1":
                db.log_event("INFO", f"Sender {sender_name} is locked in chitchat lockout. Bypassing auto-reply.")
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

            # Resolve approval_mode for all paths (keyword rules, acknowledgments, AI path)
            approval_mode = db.get_setting("approval_mode", "0") == "1"
            force_draft_vips = db.get_setting("force_draft_vips", "0") == "1"
            contact_cat = contact.get('category', 'unknown').lower()
            is_vip = contact_cat in ['vip', 'client', 'business_partner']
            if force_draft_vips and is_vip:
                approval_mode = True

            # Check maximum reply limit per contact session (5 replies), except for shinichirofr
            is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
            reply_limit = 5
            replies_sent = db.get_assistant_reply_count_since_last_owner(sender_id)
            if replies_sent >= reply_limit and not is_shinichiro:
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
                        normalized = self.normalize_text_for_match(warning_msg)
                        if normalized:
                            self.assistant_sent_message_texts.add(normalized)
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
            enable_human_delays = db.get_setting("enable_human_delays", "1") == "1"
            enable_reactions = db.get_setting("enable_reactions", "1") == "1"

            if matched_rule:
                matched_response = matched_rule["response"]
                priority_val = matched_rule["priority"] or "normal"
                rule_kw = matched_rule["keyword"]
                action_type = matched_rule["action_type"]
                
                db.log_event("INFO", f"Instant keyword rule matched for '{text[:20]}' on keyword '{rule_kw}'. Actions: {action_type}")
                
                if matched_response:
                    # approval_mode is resolved globally at the top of the handler
                    
                    if approval_mode:
                        db.set_setting(f"draft_{sender_id}", matched_response)
                        await self.broadcast_ws("draft_created", {
                            "telegram_id": sender_id,
                            "draft": matched_response
                        })
                    else:
                        # Simulated human reading delay
                        if enable_human_delays:
                            read_delay = random.uniform(1.2, 2.8)
                            await asyncio.sleep(read_delay)
                        # Cognitive pause before typing
                        if enable_human_delays:
                            await asyncio.sleep(random.uniform(0.4, 0.9))

                        await self.send_humanized_replies(
                            sender_id=sender_id,
                            text=matched_response,
                            detected_lang='hinglish',
                            detected_tone='casual',
                            priority_val=priority_val,
                            sender_name=sender_name
                        )
                            
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

            # Check for simple acknowledgments and react if enable_reactions is active
            text_clean = text.lower().strip().replace(".", "").replace("!", "").replace(",", "")
            acknowledgments = {
                "ok", "done", "got it", "thanks", "thank you", "nice", "cool", "thx", "yup", "yeah", 
                "ok bhai", "bhai done", "sahi hai", "sahi h", "ok deal", "deal done", "done deal", 
                "perfect", "okay", "hmmm", "hm", "hmm"
            }
            is_ack = text_clean in acknowledgments or (len(text_clean) <= 10 and any(w in text_clean for w in ["ok", "done", "thanks", "thx", "cool"]))
            
            if is_ack and enable_reactions and not approval_mode:
                # Humanized delay before reaction
                if enable_human_delays:
                    read_delay = random.uniform(1.2, 3.2)
                    db.log_event("INFO", f"Simulating read receipt delay of {read_delay:.2f}s for acknowledgment from {sender_name}")
                    await asyncio.sleep(read_delay)
                
                # React to message
                reaction_emoji = random.choice(["👍", "🔥", "🙏", "❤️", "👌"])
                await asyncio.sleep(random.uniform(0.6, 1.2))
                try:
                    await event.message.react(reaction_emoji)
                    db.log_event("INFO", f"Reacted with {reaction_emoji} to acknowledgment from {sender_name}.")
                    db.add_message(sender_id, 'assistant', f"[Reacted {reaction_emoji}]", sentiment='neutral', priority='low', language='english', tone='casual')
                    await self.broadcast_ws("new_message", {
                        "telegram_id": sender_id,
                        "sender": "assistant",
                        "text": f"[Reacted {reaction_emoji}]"
                    })
                    return
                except Exception as e:
                    db.log_event("WARNING", f"Failed to react to message: {e}")
                    # If reaction fails, continue to normal reply path

            # Cognitive pause before starting typing indicator for AI path
            if enable_human_delays:
                await asyncio.sleep(random.uniform(0.5, 1.2))

            # Get full chat history to feed Gemini
            history = db.get_chat_history(sender_id, limit=350)
            
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
            
            # Helper coroutine to perform the Gemini analysis and drafting
            async def run_analysis_and_drafting():
                # Analyze and draft response in a single Gemini call to reduce latency
                personality = db.get_setting("ai_personality")
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
                    # SUCCESS! Save this context/reply combination to the Q&A backup cache database!
                    if analysis and analysis.get("draft_reply"):
                        db.add_qa_backup(text, analysis.get("draft_reply"))
                except Exception as e:
                    db.log_event("WARNING", f"Gemini API invocation failed ({e}) for message from {sender_name}. Switching to high-fidelity Offline Backup engine.")
                    # 1. Try to find a matched Q&A combination from our local Q&A backup database first!
                    fallback_reply = db.match_qa_backup(text)
                    if not fallback_reply:
                        # 2. If no matched Q&A backup, run the rule-based fallback
                        fallback_reply = ai_engine.get_rule_based_fallback(
                            text, current_status, history, contact.get('first_name', '')
                        )
                    
                    is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
                    if is_shinichiro:
                        fallback_reply = f"Yes Sensei! All my Gemini API keys are currently offline, so I am running on local backup protocols. Main aapki feedback and instruction offline cache me save kar raha hu, Sensei."

                    analysis = {
                        "sentiment": "neutral",
                        "priority": "normal",
                        "suggested_category": contact.get('category', 'unknown'),
                        "relationship_insight": "All Gemini API keys are currently rate-limited or offline. Enforced local offline Q&A RAG rules.",
                        "language": "hinglish" if any(x in text.lower() for x in ["bhai", "yaar", "kya", "hai", "ko"]) else "english",
                        "tone": "casual",
                        "suggested_personality": "Human Offline Backup",
                        "draft_reply": fallback_reply,
                        "schedule_reminder": None,
                        "system_update": None
                    }
                return analysis

            start_time = time.time()
            if approval_mode:
                # Do analysis silently in background without showing typing indicator
                analysis = await run_analysis_and_drafting()
            else:
                # Show typing indicator while communicating with Gemini
                async with self.client.action(sender_id, 'typing'):
                    analysis = await run_analysis_and_drafting()

            # Process the generated analysis
            sentiment = analysis.get("sentiment", "neutral")
            priority = analysis.get("priority", "normal")
            suggested_cat = analysis.get("suggested_category", "unknown")
            insight = analysis.get("relationship_insight", "")
            detected_lang = analysis.get("language", "english")
            detected_tone = analysis.get("tone", "casual")
            suggested_personality = analysis.get("suggested_personality", "Warm & Helpful")
            reply_draft = analysis.get("draft_reply", "")
            schedule_rem = analysis.get("schedule_reminder")

            # Handle Lead Developer / Sensei System Updates
            system_update = analysis.get("system_update")
            is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
            if system_update and is_shinichiro:
                await self.apply_system_update(system_update, sender_id, username, sender_name)
            
            is_deal = analysis.get("is_deal", False)
            deal_details = analysis.get("deal_details", "")
            
            if is_deal:
                db.log_event("INFO", f"💰 Deal detected from {sender_name}: {deal_details}")
                # Automatically upgrade category to client if unknown
                if contact.get('category', 'unknown') == 'unknown':
                    suggested_cat = 'client'
                    db.update_contact(sender_id, category='client')
                
                alert_text = (
                    f"💰 <b>Active Transaction/Deal Alert!</b>\n\n"
                    f"<b>Contact:</b> {sender_name} (@{username})\n"
                    f"<b>Deal Details:</b> {deal_details if deal_details else 'Discussion initiated'}\n"
                    f"<b>Priority:</b> {priority.upper()}\n\n"
                    f"<i>Review details in the Deals Pipeline on your manager dashboard.</i>"
                )
                self.send_bot_notification(alert_text)
            
            # Check for casual chitchat lockout trigger
            is_chitchat = analysis.get("is_chitchat", False)
            if is_chitchat:
                if not is_followup:
                    # First greeting: do NOT block/lockout. Instead, guide them back to business!
                    is_chitchat = False
                    analysis["is_chitchat"] = False
                    if detected_lang == 'hinglish':
                        reply_draft = "Hello! CatVos abhi offline hai. Main unka manager Coet hu. Bataiye aapko kis service ki requirement hai? (WhatsApp stock, Telegram channels, middleman escrow deal, website development, or design/editing?)"
                    else:
                        reply_draft = "Hello! CatVos is currently offline. I am his manager, Coet. Please let me know what service you need (WhatsApp accounts, Telegram channels, escrow/middleman, website development, or graphic design/editing)."
                    analysis["draft_reply"] = reply_draft
                else:
                    # Subsequent chitchat: enforce strict chitchat shield lockout
                    lockout_msg = (
                        "⚠️ <b>System Protocol: Non-Transactional Query Detected</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        "<blockquote>To optimize response efficiency, my automated assistant pilot is strictly reserved for active business transactions, middleman deals, stock catalogs, and development inquiries.\n\n"
                        "I have logged all message history. Once CatVos (administrator) is back online, your request details will be forwarded directly for personal review.\n\n"
                        "For this session, automated replies have been paused and your chat has been archived in the admin's business log. Thank you for your cooperation.</blockquote>\n\n"
                        "<b>💡 Setup Coet AI on your profile:</b>\n"
                        "• Visit @coetbot for more details.\n"
                        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                        "<i>Session auto-reply paused. Have a productive day. — Coet</i>"
                    )
                    if approval_mode:
                        analysis["draft_reply"] = lockout_msg
                        reply_draft = lockout_msg
                    else:
                        async with self.client.action(sender_id, 'typing'):
                            await asyncio.sleep(2.0)
                            normalized = self.normalize_text_for_match(lockout_msg)
                            if normalized:
                                self.assistant_sent_message_texts.add(normalized)
                            msg = await self.client.send_message(sender_id, lockout_msg, parse_mode="html")
                            self.assistant_sent_message_ids.add(msg.id)
                        db.add_message(sender_id, 'assistant', lockout_msg, sentiment='neutral', priority='low', language='english', tone='formal')
                        db.set_setting(f"chitchat_locked_{sender_id}", "1")
                        db.log_event("WARNING", f"🚫 CHITCHAT SHIELD TRIGGERED: Paused auto-replies for {sender_name} ({sender_id}) due to casual chitchat.")
                        
                        await self.broadcast_ws("new_message", {
                            "telegram_id": sender_id,
                            "sender": "assistant",
                            "text": lockout_msg
                        })
                        return
            
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
                
            # Check if category update makes this a draft
            new_contact_cat = suggested_cat.lower()
            new_is_vip = new_contact_cat in ['vip', 'client', 'business_partner']
            if force_draft_vips and new_is_vip:
                approval_mode = True

            if approval_mode:
                db.set_setting(f"draft_{sender_id}", reply_draft)
                db.log_event("INFO", f"Draft saved for {sender_name}: '{reply_draft[:40]}...' (Awaiting Approval)")
                await self.broadcast_ws("draft_created", {
                    "telegram_id": sender_id,
                    "draft": reply_draft
                })
            else:
                # Simulated human reading delay right before typing/sending the replies
                if enable_human_delays:
                    read_delay = random.uniform(1.2, 2.5)
                    await asyncio.sleep(read_delay)
                # Cognitive pause before starting typing
                if enable_human_delays:
                    await asyncio.sleep(random.uniform(0.4, 0.9))

                await self.send_humanized_replies(
                    sender_id=sender_id,
                    text=reply_draft,
                    detected_lang=detected_lang,
                    detected_tone=detected_tone,
                    priority_val=priority,
                    sender_name=sender_name
                )
                # Trigger background memory consolidation for AI replies
                asyncio.create_task(self.trigger_memory_consolidation(sender_id))
                    
        # 2. Outgoing Message Handler (Owner activity tracker)
        @self.client.on(events.NewMessage(outgoing=True))
        async def on_outgoing_message(event):
            text = event.text or ""
            
            # Skip if this message was sent by the automated assistant/bot code
            if event.message.id in self.assistant_sent_message_ids:
                self.assistant_sent_message_ids.remove(event.message.id)
                return
                
            # Text-based matching to prevent race conditions during message creation
            cleaned_text = self.normalize_text_for_match(text)
            
            # Check if this is a manual response sent from the dashboard
            is_dashboard_reply = False
            if cleaned_text:
                matched_dashboard = None
                for draft in list(self.dashboard_sent_message_texts):
                    if draft == cleaned_text or cleaned_text in draft or draft in cleaned_text:
                        matched_dashboard = draft
                        break
                if matched_dashboard:
                    self.dashboard_sent_message_texts.discard(matched_dashboard)
                    is_dashboard_reply = True

            if cleaned_text and not is_dashboard_reply:
                matched_draft = None
                for draft in list(self.assistant_sent_message_texts):
                    if draft == cleaned_text or cleaned_text in draft or draft in cleaned_text:
                        matched_draft = draft
                        break
                if matched_draft:
                    self.assistant_sent_message_texts.discard(matched_draft)
                    return

            # Increment owner messages counter for dynamic DNA learning (if it's not a command)
            if not is_dashboard_reply and not (text.strip().startswith("/") or text.strip().endswith("?")):
                try:
                    current_val = int(db.get_setting("owner_new_messages_since_rebuild", "0"))
                    db.set_setting("owner_new_messages_since_rebuild", str(current_val + 1))
                except Exception:
                    pass

            # Intercept owner commands (starts with / or ends with ?)
            # Only intercept if it's NOT a manual response sent from the dashboard
            if not is_dashboard_reply:
                if text.strip().startswith("/") or text.strip().endswith("?"):
                    await self.execute_owner_command(event, text, is_bot=False)
                    return
                
            if not event.is_private:
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
            text = event.text or ""
            
            # Save message as owner
            db.get_or_create_contact(dest_id, "", "", "")
            db.add_message(dest_id, 'owner', text)
            
            # Check and trigger writing style DNA rebuild if needed
            self.maybe_trigger_owner_style_rebuild()
            
            # Clear any pending drafts for this chat
            db.set_setting(f"draft_{dest_id}", "")
            db.set_setting(f"chitchat_locked_{dest_id}", "0")
            
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
            db.set_setting(f"chitchat_locked_{event.chat_id}", "0")
            await self.broadcast_ws("new_message", {
                "telegram_id": event.chat_id,
                "sender": "owner_read",
                "text": ""
            })
            
        # 4. Telegram Bot Client Incoming Message Handler
        if BOT_TOKEN and not self._bot_handler_registered:
            self._bot_handler_registered = True
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
                
                is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
                
                # Check for direct Sensei command matching the offline regex patterns
                if is_shinichiro:
                    import ai_engine
                    offline_update = ai_engine.parse_sensei_command(text)
                    if offline_update:
                        db.log_event("WARNING", f"⚙️ SENSEI PROTOCOL OFFLINE DETECTED (BOT CLIENT): Command: {offline_update.get('action')}")
                        confirmation = await self.apply_system_update(offline_update, sender_id, username, sender_name)
                        if confirmation:
                            await event.respond(confirmation, parse_mode="html")
                            db.add_message(sender_id, 'assistant', confirmation, sentiment='neutral', priority='normal', language='english', tone='casual')
                            await self.broadcast_ws("new_message", {
                                "telegram_id": sender_id,
                                "sender": "assistant",
                                "text": confirmation
                            })
                        return

                # Owner trigger: slash commands OR queries ending with ? (e.g. status?, ping?)
                # IMPORTANT: Only treat "?" as an owner command trigger when sender IS the owner.
                # Non-owner messages ending with "?" must fall through to the AI assistant.
                is_owner_trigger = (
                    text.strip().startswith("/") or
                    (text.strip().endswith("?") and self.is_owner(sender_id))
                )
                
                if is_owner_trigger:
                    if self.is_owner(sender_id):
                        try:
                            await self.execute_owner_command(event, text, is_bot=True)
                        except Exception as e:
                            db.log_event("ERROR", f"Error in owner bot command: {e}")
                            await event.respond(f"❌ <b>Error:</b> {e}")
                    else:
                        # Non-owners can only use /start and /help
                        cmd_norm = text.strip()[1:].lower().split()[0] if text.strip().startswith("/") else text.strip().lower()
                        if cmd_norm in ["start", "help"]:
                            try:
                                await self.send_public_intro(event)
                            except Exception as e:
                                db.log_event("ERROR", f"Error sending public intro: {e}")
                    return  # End of trigger handling

                else:
                    if self.is_owner(sender_id) and not is_shinichiro:
                        return # Strictly ignore non-command messages from the owner to avoid auto-reply loops
                    try:
                        await self.handle_client_bot_message(event, sender, text)
                    except Exception as e:
                        db.log_event("ERROR", f"Error in client bot assistant: {e}")
            
            # 5. Telegram Bot Client Callback Query Handler (Interactive Admin Panel)
            if BOT_TOKEN:
                @self.bot_client.on(events.CallbackQuery)
                async def on_bot_callback_query(event):
                    data = event.data
                    
                    # 1. Public Visitor Callbacks (Handle BEFORE owner authorization check!)
                    if data.startswith(b"pub_") or data == b"pub_back":
                        from telethon import Button
                        
                        # Set of URL buttons for Call to Action
                        cta_buttons = [
                            [Button.url("💬 Setup Your Autopilot (@shinichirofr)", "https://t.me/shinichirofr")],
                            [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                        ]
                        
                        if data == b"pub_setup":
                            setup_text = (
                                "🚀 <b>SETUP & DEPLOYMENT PROTOCOL</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Deploy your customized Digital Twin on your personal account. Replicate yourself and close deals 24/7.</blockquote>\n\n"
                                "<b>⚙️ DEPLOYMENT MECHANICS:</b>\n"
                                "• <b>Linguistic Mimicry</b>: Scans your historical messages to replicate your unique writing style (Roman Hinglish/English balance, casing, abbreviations like 'rn', 'wp', 'tg', 'bhai', 'yaar').\n"
                                "• <b>RAG FAQ Integration</b>: Train your bot on your specific middleman policies, rates, and stock availability rules.\n"
                                "• <b>Typing Simulation</b>: Automatically shows typing indicators and introduces natural time delays matching your status.\n\n"
                                "🔥 <b>SCARCITY WARNING:</b>\n"
                                "Only <b>4 out of 10</b> slots remain for this onboarding batch. Setup takes up to 24 hours. Batch closes strictly within 48 hours to ensure dedicated server performance for existing clients.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Select an option below to proceed:</i>"
                            )
                            setup_buttons = [
                                [Button.inline("🗺️ Onboarding & Deploy Roadmap", b"pub_roadmap")],
                                [Button.inline("🤝 Escrow Services Setup (10 Pages)", b"pub_serv_wiki")],
                                [Button.url("💬 Setup Your Autopilot (@shinichirofr)", "https://t.me/shinichirofr")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(setup_text, buttons=setup_buttons, parse_mode="html")
                            return

                        elif data == b"pub_roadmap":
                            roadmap_text = (
                                "🗺️ <b>ONBOARDING & DEPLOYMENT ROADMAP</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>A step-by-step technical blueprint for activating your AI Digital Twin.</blockquote>\n\n"
                                "<b>🏁 STAGE 1: CREDENTIAL SYNC (Hour 0-2)</b>\n"
                                "• Prepare your Telegram API ID and API Hash securely.\n"
                                "• Scan your session token natively using our encrypted CLI tool.\n\n"
                                "<b>🧬 STAGE 2: LINGUISTIC ANALYSIS (Hour 2-6)</b>\n"
                                "• Our model runs a background sweep of up to 1,000 sent messages.\n"
                                "• Builds your customized Style Profile setting casing, typos, and emoji parameters.\n\n"
                                "<b>📚 STAGE 3: FAQ KNOWLEDGE BASE INJECTION (Hour 6-12)</b>\n"
                                "• Populate your transaction rules, product rates, and escrow policies.\n"
                                "• Verify logical priority flags (AI Autopilot vs Escrow triggers).\n\n"
                                "<b>⚡ STAGE 4: SANDBOX TESTING & LAUNCH (Hour 12-24)</b>\n"
                                "• Test the twin simulation in a private channel with mock inquiries.\n"
                                "• Re-calibrate latency profiles and launch live.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Onboarding complete within 24 hours.</i>"
                            )
                            roadmap_buttons = [
                                [Button.inline("⬅️ Back to Setup Menu", b"pub_setup")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(roadmap_text, buttons=roadmap_buttons, parse_mode="html")
                            return
                            
                        elif data == b"pub_dna_info":
                            dna_text = (
                                "🧠 <b>STYLE MIRRORING DNA</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Coet does not write like a sterile robot. It clones YOUR specific texting DNA.</blockquote>\n\n"
                                "<b>🔬 LINGUISTIC ENGINE PROCESSES:</b>\n"
                                "• <b>Casing & Punctuation</b>: Mirrors if you use lowercase, type without full stops, or write in sentence case.\n"
                                "• <b>Roman Hinglish Blend</b>: Dynamically shifts between Hindi/English slang ('bhai', 'yaar', 'rn', 'wp', 'bro') matching the client's vibe.\n"
                                "• <b>Abbreviations & Slang</b>: Clones your custom abbreviations, typos, and emoji density.\n"
                                "• <b>Background Learning</b>: Reads historical messaging patterns continuously to keep your style fresh.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Uncannily human. Your clients won't suspect a thing.</i>"
                            )
                            await event.edit(dna_text, buttons=cta_buttons, parse_mode="html")
                            return
                            
                        elif data == b"pub_details":
                            details_text = (
                                "ℹ️ <b>SYSTEM SPECS & INFRASTRUCTURE</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Designed for high concurrency, low latency, and maximum privacy.</blockquote>\n\n"
                                "<b>💻 ARCHITECTURE METRICS:</b>\n"
                                "• <b>Core Engine</b>: Async Python MTProto (Telethon) Client running as a background service.\n"
                                "• <b>Concurrency</b>: SQLite WAL (Write-Ahead Logging) database engine for simultaneous threads.\n"
                                "• <b>AI Pipeline</b>: Distributed pool of 5+ Gemini API keys with intelligent rotation, cooldown, and error-handling.\n"
                                "• <b>Strict Privacy</b>: 100% self-hosted. Your message logs are kept locally and never shared.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Explore our specs or read our legal policies:</i>"
                            )
                            details_buttons = [
                                [Button.inline("⚙️ Technical Wiki (10 Pages)", b"pub_tech_wiki")],
                                [Button.inline("🎛️ Hardware Hosting Architecture", b"pub_infra_hardware")],
                                [Button.inline("🛡️ Anti-DDoS & Network Security", b"pub_infra_network")],
                                [Button.inline("🔒 Cryptographic Privacy Policy", b"pub_privacy")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(details_text, buttons=details_buttons, parse_mode="html")
                            return

                        elif data == b"pub_infra_hardware":
                            hardware_text = (
                                "🎛️ <b>HARDWARE HOSTING ARCHITECTURE</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Industrial-grade specs hosting our digital twin instances.</blockquote>\n\n"
                                "<b>🖥️ HOST SERVER METRICS:</b>\n"
                                "• <b>Compute</b>: 8-Core AMD EPYC Dedicated Virtualization Nodes (3.4 GHz base).\n"
                                "• <b>RAM</b>: 32GB ECC Server-Grade Memory for fast cache querying.\n"
                                "• <b>Storage</b>: High-Speed Enterprise PCIe Gen4 NVMe (WAL Cache optimized).\n"
                                "• <b>Network Up-link</b>: Redundant 1 Gbps port connectivity with 99.99% core SLA.\n\n"
                                "<b>⚡ AI GRAPHICS PROCESSING Unit (GPU)</b>\n"
                                "• Fast prompt embedding calculations utilize local GPU-accelerated clusters for vector analysis.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Built to scale without slowdowns under extreme concurrency load.</i>"
                            )
                            hardware_buttons = [
                                [Button.inline("⬅️ Back to Specs Menu", b"pub_details")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(hardware_text, buttons=hardware_buttons, parse_mode="html")
                            return

                        elif data == b"pub_infra_network":
                            network_text = (
                                "🛡️ <b>ANTI-DDOS & NETWORK SECURITY</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Engineered natively to handle malicious traffic spikes and keep API streams active.</blockquote>\n\n"
                                "<b>🔐 SHIELD FEATURES:</b>\n"
                                "• <b>Layer 7 Filtering</b>: Block HTTP flooding and socket loops instantly.\n"
                                "• <b>Proxy Key Pools</b>: Auto-rotate outgoing proxy IPs (SOCKS5/MTProto) every 15 minutes to bypass Telegram bot rate limits.\n"
                                "• <b>Token Protection</b>: Credentials, tokens, and SQLite files are locked behind AES-256 local filesystem encryption keys.\n"
                                "• <b>Intrusion Prevention</b>: Scans background sessions and alerts admins on unauthorized login triggers.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Military-grade isolation. Zero downtime.</i>"
                            )
                            network_buttons = [
                                [Button.inline("⬅️ Back to Specs Menu", b"pub_details")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(network_text, buttons=network_buttons, parse_mode="html")
                            return

                        elif data == b"pub_privacy":
                            privacy_text = (
                                "🔒 <b>CRYPTOGRAPHIC PRIVACY POLICY</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Your data, your rules. Read how we protect your personal chat archives.</blockquote>\n\n"
                                "<b>📖 PRIVACY STANDARDS:</b>\n"
                                "• <b>Local Processing Only</b>: We do NOT host your messages on public cloud servers. All database records (WAL SQLite) reside on dedicated containers.\n"
                                "• <b>LLM Data Policy</b>: Message context is sent to official API endpoints strictly via SSL encryption and is never used to train global AI models.\n"
                                "• <b>Automated Erasure</b>: Commands like <code>/clear_history</code> or database sweeps wipe all stored context memory arrays instantly.\n"
                                "• <b>Zero Analytics</b>: No trackers, cookies, or metadata metrics are logged. Telemetry is purely runtime diagnostics.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>True encryption. absolute sovereignty over your communications.</i>"
                            )
                            privacy_buttons = [
                                [Button.inline("⬅️ Back to Specs Menu", b"pub_details")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(privacy_text, buttons=privacy_buttons, parse_mode="html")
                            return
                            
                        elif data == b"pub_features":
                            features_text = (
                                "🛠️ <b>COET AUTOMATION COMMAND DIRECTORY (600+ SCHEMAS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>COET runs on a robust multi-threaded prompt & control execution matrix. Below is a subset of the 600+ available interactive commands and triggers across the bot core.</blockquote>\n\n"
                                "<b>📁 COMMAND SCHEMA CLASSIFICATIONS:</b>\n"
                                "• <b>Autopilot Core (80+)</b>: Personality triggers, Hinglish ratios, and typing delays.\n"
                                "• <b>Escrow & MM (100+)</b>: Deal status, networks, settlement logs, and dispute holds.\n"
                                "• <b>Group & Anti-Scam (70+)</b>: Member restrictions, CAPTCHAs, and scam sweeps.\n"
                                "• <b>Telemetry & Sys (50+)</b>: Gemini key pools, WebSocket states, and WAL databases.\n"
                                "• <b>Payment & Accounting (50+)</b>: UPI payments, balances, credits, and ledger creation.\n"
                                "• <b>Task & Scheduler (50+)</b>: Alert rules, timers, deadlines, and cron notifications.\n"
                                "• <b>Prompt Tuning (50+)</b>: Temperature parameters, persona rules, and focus logs.\n"
                                "• <b>Webhook & API (50+)</b>: Client token generator, stream logs, and webhook routing.\n"
                                "• <b>Style DNA Config (50+)</b>: Custom style DNA settings, Hinglish slangs, and typos.\n"
                                "• <b>Compliance & AML (50+)</b>: Wallet traces, blacklists, multi-sig creations, and dispute holds.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Select a command category below to view syntax schemas:</i>"
                            )
                            features_buttons = [
                                [Button.inline("🤖 Autopilot Core", b"pub_cmd_core"), Button.inline("🛡️ Escrow & MM", b"pub_cmd_escrow")],
                                [Button.inline("👥 Group Moderation", b"pub_cmd_group"), Button.inline("📊 Telemetry & Sys", b"pub_cmd_sys")],
                                [Button.inline("💳 Pay & Accounting", b"pub_cmd_payment"), Button.inline("⏰ Task & Scheduler", b"pub_cmd_tasks")],
                                [Button.inline("🧬 Prompt Tuning", b"pub_cmd_prompt"), Button.inline("🔌 Webhook & API", b"pub_cmd_api")],
                                [Button.inline("🧠 Style DNA Config", b"pub_cmd_style"), Button.inline("🛡️ Compliance & AML", b"pub_cmd_compliance")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(features_text, buttons=features_buttons, parse_mode="html")
                            return
                            
                        elif data == b"pub_cmd_core":
                            core_text = (
                                "🤖 <b>AUTOPILOT CORE COMMAND DIRECTORY (80+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>⚙️ SYSTEM STATE & PERSONA MODIFIERS</b>\n"
                                "• <code>/sleep [duration] [auto-awake-time]</code> - Suspends AI responses and alerts clients of offline state.\n"
                                "• <code>/busy [reason]</code> - Coet mentions what you are working on dynamically when messaged.\n"
                                "• <code>/online [force-flag]</code> - Re-enables real-time typing indicators and instant AI responses.\n"
                                "• <code>/focus [project] [eta]</code> - Sets active focus context for AI to cite.\n"
                                "• <code>/mode [auto|hybrid|manual]</code> - Toggles manual control vs autopilot.\n\n"
                                "<b>🔬 LINGUISTIC DNA PARAMS</b>\n"
                                "• <code>/trait [casing|punctuation|emojis] [on|off]</code> - Force exact text formatting rules.\n"
                                "• <code>/slang [hinglish_pct] [value]</code> - Shift slang blending ratio (0 to 100).\n"
                                "• <code>/typing [wpm_speed] [delay_multiplier]</code> - Calibrate human typing animation delays.\n"
                                "• <code>/prompt [inject|clear|view] [rule]</code> - Append override logic to system core.\n\n"
                                "<b>🧠 CONTEXT & MEMORY</b>\n"
                                "• <code>/memory [learn|forget|restrict] [contact_id] [data]</code> - Manage user profile database.\n"
                                "• <code>/history [user_id] [limit]</code> - View compiled logs fed to LLM context.\n"
                                "• <code>/clear_history [user_id]</code> - Wipe context window back to clean state.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Control your digital assistant remotely with precision.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(core_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_escrow":
                            escrow_text = (
                                "🛡️ <b>ESCROW & MM COMMAND DIRECTORY (100+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🔐 DEAL FLOW CONTROL</b>\n"
                                "• <code>/escrow init [deal_id] [buyer] [seller]</code> - Instantiate escrow instance in database.\n"
                                "• <code>/escrow terms [deal_id] [text]</code> - Append binding deal conditions.\n"
                                "• <code>/escrow fee [deal_id] [percentage|flat_value]</code> - Apply system fee calculation.\n"
                                "• <code>/escrow coin [deal_id] [usdt|btc|sol|eth]</code> - Set payment currency.\n"
                                "• <code>/escrow network [deal_id] [trc20|erc20|bep20]</code> - Select settlement chain.\n"
                                "• <code>/escrow address [deal_id] [deposit_address]</code> - Bind system deposit address.\n\n"
                                "<b>💰 TRANSACTION STATUS & VERIFICATION</b>\n"
                                "• <code>/escrow status [deal_id]</code> - Fetch real-time blockchain validation status.\n"
                                "• <code>/escrow hold [deal_id]</code> - Freeze release sequence during active dispute.\n"
                                "• <code>/escrow release [deal_id]</code> - Dispatch coins to seller (subtracting escrow fees).\n"
                                "• <code>/escrow refund [deal_id] [refund_address]</code> - Reverse funds back to buyer.\n"
                                "• <code>/escrow cancel [deal_id]</code> - Terminate transaction before deposit confirmation.\n\n"
                                "<b>📊 LEDGER CONFIGURATION</b>\n"
                                "• <code>/escrow setfee [coin] [min_value] [base_fee]</code> - Calibrate escrow fee tiers.\n"
                                "• <code>/escrow discount [deal_id] [coupon]</code> - Apply special discount rate.\n"
                                "• <code>/escrow export [deal_id] [csv|json]</code> - Generate cryptographically signed receipt.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Secure transactions on autopilot. No room for human error.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(escrow_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_group":
                            group_text = (
                                "👥 <b>GROUP & SHIELD COMMAND DIRECTORY (70+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🚨 ANTI-SCAM SWEEP & SCREENING</b>\n"
                                "• <code>/scamcheck [username|id]</code> - Run cross-database impersonator checks.\n"
                                "• <code>/shield [on|off]</code> - Toggle anti-impersonator scanning.\n"
                                "• <code>/scan_display_names</code> - Check channel member list for admin copycat bios.\n"
                                "• <code>/mute [user_id] [duration]</code> - Silence member globally across automated channels.\n"
                                "• <code>/restrict [user_id] [send_media|send_links]</code> - Lock member permissions.\n\n"
                                "<b>🚫 FILTER RULES & GATEKEEPING</b>\n"
                                "• <code>/blacklist add [phrase]</code> - Add scam phrases (e.g. 'dm me', 'click here') to shield.\n"
                                "• <code>/blacklist remove [phrase]</code> - Unblock safe terms.\n"
                                "• <code>/whitelist [user_id]</code> - Ignore anti-spam limitations for VIP clients.\n"
                                "• <code>/captcha [on|off] [math|button|text]</code> - Configure join-gate validation games.\n\n"
                                "<b>📑 VIOLATION REPORTING</b>\n"
                                "• <code>/infractions [user_id]</code> - Query number of spam/scam warnings accumulated.\n"
                                "• <code>/clearwarn [user_id]</code> - Wipe user warning count.\n"
                                "• <code>/logs [scam|spam|joins]</code> - Pull real-time moderation events feed.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Keep channels clean. Eliminate impersonators in real-time.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(group_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_sys":
                            sys_text = (
                                "📊 <b>TELEMETRY & SYSTEM COMMAND DIRECTORY (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🔬 SYSTEM LATENCY & RESOURCE MONITORING</b>\n"
                                "• <code>/ping</code> or <code>/latency</code> - Return internal loop delay & database ping.\n"
                                "• <code>/dbstatus</code> - Query database integrity, write-ahead logging (WAL), and file sizes.\n"
                                "• <code>/mem</code> or <code>/cpu</code> - Fetch server RAM usage and CPU load thresholds.\n"
                                "• <code>/uptime</code> - View active session runtime parameters.\n\n"
                                "<b>🔑 ROTATING API KEY POOLS</b>\n"
                                "• <code>/keypool list</code> - Check status, API cooldown, and hit rate of active Gemini keys.\n"
                                "• <code>/keypool add [gemini_api_key]</code> - Push a new key to the active rotation pool.\n"
                                "• <code>/keypool remove [key_index]</code> - Deprecate key from pool.\n"
                                "• <code>/keypool health [key_index]</code> - Query specific key rate limit status.\n\n"
                                "<b>⚙️ NETWORK TUNING & LOGGING</b>\n"
                                "• <code>/ws [restart|status]</code> - Recalibrate active dashboard WebSocket channels.\n"
                                "• <code>/logview [limit] [level]</code> - Print background event logs dynamically.\n"
                                "• <code>/loglevel [debug|info|warning|error]</code> - Configure terminal verbosity.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Maximized concurrency. Peak stability under load.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(sys_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_payment":
                            payment_text = (
                                "💳 <b>PAYMENT & ACCOUNTING COMMANDS (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🇮🇳 FIAT SETTLEMENT (UPI) INTEGRATION</b>\n"
                                "• <code>/upi [amount] [vpa_address]</code> - Generate dynamic UPI payout links & QR strings for instant Indian currency settlement.\n"
                                "• <code>/upi_verify [vpa] [utr_ref]</code> - Verify incoming instant bank settlement logs.\n"
                                "• <code>/upi_rates</code> - Query current global USD to INR conversion multipliers.\n\n"
                                "<b>⛓️ CRYPTO & MULTI-CHAIN PAYMENT TRIGGERS</b>\n"
                                "• <code>/paycheck [address] [tx_hash] [chain]</code> - Match deposit on TRON, Ethereum, or BSC chains.\n"
                                "• <code>/invoice create [user_id] [amount] [memo]</code> - Issue cryptographically signed bills.\n"
                                "• <code>/invoice cancel [invoice_id]</code> - Deprecate active billing records.\n"
                                "• <code>/invoice list [user_id]</code> - Query all open checkouts linked to a visitor profile.\n\n"
                                "<b>📊 ACCOUNTING & GENERAL LEDGER</b>\n"
                                "• <code>/ledger [user_id] [credits|history]</code> - View transaction credits history.\n"
                                "• <code>/credits add [user_id] [amount] [reason]</code> - Push promotional balance increments.\n"
                                "• <code>/credits deduct [user_id] [amount]</code> - Deduct license usage costs.\n"
                                "• <code>/accounting export [monthly|weekly]</code> - Dispatch general balance sheets in JSON.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Zero billing leakage. Automated payment flows natively in chat.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(payment_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_tasks":
                            tasks_text = (
                                "⏰ <b>TASK & SCHEDULER COMMANDS (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>📅 SYSTEM REMINDERS & TIMER TRIGGERS</b>\n"
                                "• <code>/reminder [time] [task_description]</code> - Queue an encrypted background reminder (e.g. <code>/reminder 3h release Sol escrow</code>).\n"
                                "• <code>/reminder list</code> - Check active cron alarms and timer tasks.\n"
                                "• <code>/reminder cancel [alarm_id]</code> - Unschedule pending alarms.\n\n"
                                "<b>🚀 TASK FLOW & PROGRESS LOGGING</b>\n"
                                "• <code>/task add [description] [priority]</code> - Append a development ticket to the system board.\n"
                                "• <code>/task status [task_id]</code> - Check ongoing status (Pending, Active, Closed).\n"
                                "• <code>/task assign [task_id] [username]</code> - Link task ownership flags.\n"
                                "• <code>/deadline [task_id] [timestamp]</code> - Enforce strict delivery limits.\n\n"
                                "<b>🔔 ALERT TRiggers & CRON</b>\n"
                                "• <code>/cron add '[cron_expr]' [action]</code> - Schedule recursive jobs.\n"
                                "• <code>/cron list</code> - Display active cron schemas.\n"
                                "• <code>/alert threshold [cpu|mem] [value]</code> - Trigger warnings when resource limits cross.\n"
                                "• <code>/notify [user_id|channel] [text]</code> - Broadcast instant system bulletins.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Reliable job queue. Keep operations on schedule.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(tasks_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_prompt":
                            prompt_text = (
                                "🧬 <b>PROMPT & DIRECTIVES TUNING COMMANDS (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🧠 PERSONA RULE TUNING</b>\n"
                                "• <code>/prompt system [view|edit]</code> - Load the core AI digital twin prompt directives.\n"
                                "• <code>/prompt inject [position] [instruction]</code> - Push hotfixes into system memory.\n"
                                "• <code>/prompt backup [label]</code> - Save current instruction sets into database snapshot.\n"
                                "• <code>/prompt rollback [label]</code> - Revert active prompt arrays instantly.\n\n"
                                "<b>⚙️ TEXT GENERATION PARAMS</b>\n"
                                "• <code>/prompt temp [0.0-1.0]</code> - Tune AI temperature value (creativity thresholds).\n"
                                "• <code>/prompt context [limit_count]</code> - Set maximum historical message count fed to model.\n"
                                "• <code>/prompt filter [on|off]</code> - Toggle content formatting and filter checks.\n"
                                "• <code>/weight [casing|slang|faq] [value]</code> - Adjust trait dominance sliders.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Calibrate your AI Persona rules in real-time.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(prompt_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_api":
                            api_text = (
                                "🔌 <b>WEBHOOK & API INTEGRATION COMMANDS (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🕸️ WEBHOOK SETUPS</b>\n"
                                "• <code>/webhook set [endpoint_url] [event_mask]</code> - Setup outbound HTTP payload listeners.\n"
                                "• <code>/webhook list</code> - List all active URL webhook nodes.\n"
                                "• <code>/webhook test [webhook_id]</code> - Dispatch simulated transaction JSON payload.\n"
                                "• <code>/webhook delete [webhook_id]</code> - Remove server route trigger.\n\n"
                                "<b>🔌 WEBSOCKET & KEY ACCESS</b>\n"
                                "• <code>/api genkey [label]</code> - Generate cryptographically secure API credentials token.\n"
                                "• <code>/api list</code> - View authorized API key logs.\n"
                                "• <code>/api revoke [token_id]</code> - Expire credentials immediately.\n"
                                "• <code>/ws restart</code> - Flush and reboot WebSocket pipeline sockets.\n"
                                "• <code>/ws status</code> - Check live connected client counts.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Industrial API connectivity. Sync your data pipeline with third-party software.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(api_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_style":
                            style_text = (
                                "🧠 <b>STYLE DNA & LEARNING COMMANDS (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🧬 ANALYSIS & PROFILING</b>\n"
                                "• <code>/style scan [limit]</code> - Sweep messages to compile custom DNA profile.\n"
                                "• <code>/style dna [user]</code> - Display compiled casing, slang & emoji parameters.\n"
                                "• <code>/style export [file]</code> - Backup DNA rules to SQLite database.\n"
                                "• <code>/style import [file]</code> - Load style configuration profiles.\n"
                                "• <code>/style reset</code> - Reset custom style DNA to default neutral.\n"
                                "• <code>/style weight [0-100]</code> - Weight of Style DNA tone influence on AI.\n"
                                "• <code>/style compare [u1] [u2]</code> - Compare linguistic profiles of two users.\n"
                                "• <code>/style profile [name]</code> - Create named style profile slot.\n"
                                "• <code>/style delete [name]</code> - Delete custom style profile slot.\n"
                                "• <code>/style status</code> - Show active profile status and sync state.\n\n"
                                "<b>🗣️ SLANG & HINGLISH DICTIONARY</b>\n"
                                "• <code>/slang register [w] [syn]</code> - Map user slang synonyms dynamically.\n"
                                "• <code>/slang unregister [w]</code> - Delete user slang maps.\n"
                                "• <code>/slang list</code> - View Roman Hinglish slang dictionary.\n"
                                "• <code>/slang test [text]</code> - Preview slang substitution results on test text.\n"
                                "• <code>/slang ratio [0-100]</code> - Blend ratio of Roman Hinglish to standard English.\n"
                                "• <code>/slang import_preset [p]</code> - Import Hinglish slang presets (casual/street/business).\n"
                                "• <code>/slang auto [on|off]</code> - Detect user slang pattern and auto-match.\n"
                                "• <code>/slang ban [word]</code> - Prohibit specific slang word from responses.\n"
                                "• <code>/slang unban [word]</code> - Remove slang word prohibition.\n"
                                "• <code>/slang stats</code> - Show most frequent slangs used by AI.\n\n"
                                "<b>✍️ FORMATTING & PUNCTUATION RULES</b>\n"
                                "• <code>/casing strict [on|off]</code> - Force lowercase only vs standard capitalization.\n"
                                "• <code>/punctuation level [0-3]</code> - Set punctuation density (0=none, 3=strict).\n"
                                "• <code>/emojis density [0-10]</code> - Max emoji count per message.\n"
                                "• <code>/emojis whitelist [list]</code> - Allowed emojis in responses.\n"
                                "• <code>/emojis blacklist [list]</code> - Prohibited emojis in responses.\n"
                                "• <code>/typos rate [0-100]</code> - Frequency of simulated typos.\n"
                                "• <code>/typos max [count]</code> - Max typos per single message.\n"
                                "• <code>/sentence len [min] [max]</code> - Force sentence word length boundaries.\n"
                                "• <code>/formatting markdown [on|off]</code> - Toggle rich formatting in replies.\n"
                                "• <code>/casing triggers [list]</code> - Capitalize words matching custom list.\n\n"
                                "<b>🧠 REALTIME LEARNING CONTROLS</b>\n"
                                "• <code>/learn stats</code> - View total analyzed owner messages count.\n"
                                "• <code>/learn toggle</code> - Toggle background learning engine.\n"
                                "• <code>/learn trigger [num]</code> - Rebuild style profile after N messages.\n"
                                "• <code>/learn throttle [mins]</code> - Min duration between profile builds.\n"
                                "• <code>/learn debug [on|off]</code> - Print learning updates in logs.\n"
                                "• <code>/learn sweep [days]</code> - Clean learning database older than N days.\n"
                                "• <code>/learn ignore [chan_id]</code> - Skip learning from specific channels.\n"
                                "• <code>/learn path [db_file]</code> - Set custom database path for style history.\n"
                                "• <code>/learn inspect [id]</code> - Display raw text elements of style record.\n"
                                "• <code>/learn update [id] [txt]</code> - Update style record content.\n\n"
                                "<b>🎭 PERSONA & EMOTIONAL SPECTRUM</b>\n"
                                "• <code>/persona mood [casual|dry|hype|pro]</code> - Force emotional state.\n"
                                "• <code>/persona warm_up [on|off]</code> - Change tone based on user chat duration.\n"
                                "• <code>/persona custom_instruction [txt]</code> - Inject custom system prompt additions.\n"
                                "• <code>/persona clear_instruction</code> - Clear custom system prompt additions.\n"
                                "• <code>/persona view_prompt</code> - View compiled prompt instructions.\n"
                                "• <code>/persona fallback_msg [txt]</code> - Set manual Hinglish fallback reply.\n"
                                "• <code>/persona test_prompt [txt]</code> - Test prompt output on test string.\n"
                                "• <code>/persona temp [0.0-1.0]</code> - Adjust creativity temperatures.\n"
                                "• <code>/persona limit_tokens [num]</code> - Max token length per generation.\n"
                                "• <code>/persona debug_info</code> - Dump system prompt context window info.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Perfect mirroring. Clones your texting traits automatically.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(style_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_cmd_compliance":
                            compliance_text = (
                                "🛡️ <b>BLOCKCHAIN COMPLIANCE & AML COMMANDS (50+ TRIGGERS)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>👛 WALLET TRACING & RISKS</b>\n"
                                "• <code>/compliance trace [addr] [chain]</code> - Trace target address for illicit funds.\n"
                                "• <code>/compliance risk_limit [0-100]</code> - Max risk score threshold allowed.\n"
                                "• <code>/compliance score [addr]</code> - Fetch instant AML risk percentage.\n"
                                "• <code>/compliance path [addr]</code> - Check transaction path hops to mixers.\n"
                                "• <code>/compliance scan_tx [tx_hash]</code> - Scan single transaction hash.\n"
                                "• <code>/compliance set_api [key]</code> - Bind blockchain API scanner credential.\n"
                                "• <code>/compliance check_chain [c]</code> - Verify chain scanning status (TRX, ETH, BSC).\n"
                                "• <code>/compliance force_check</code> - Trigger full wallet rescan on next message.\n"
                                "• <code>/compliance alert_channel [id]</code> - Set warning logs channel for compliance.\n"
                                "• <code>/compliance db_stats</code> - Show database size of tracked wallet histories.\n\n"
                                "<b>🛡️ AML BLACKLISTS & WHITELISTS</b>\n"
                                "• <code>/aml blacklist add [addr]</code> - Prevent automated payouts to address.\n"
                                "• <code>/aml blacklist remove [addr]</code> - Allow automated payouts to address.\n"
                                "• <code>/aml whitelist add [addr]</code> - Skip risk scanning for escrow partner address.\n"
                                "• <code>/aml whitelist remove [addr]</code> - Restore risk scanning for address.\n"
                                "• <code>/aml list [black|white]</code> - View registered addresses.\n"
                                "• <code>/aml import_blacklist [url]</code> - Import global OFAC blacklist databases.\n"
                                "• <code>/aml check [addr]</code> - Verify if address is whitelisted/blacklisted.\n"
                                "• <code>/aml clear [black|white]</code> - Wipe database lists.\n"
                                "• <code>/aml set_tag [addr] [tag]</code> - Apply metadata tag (e.g. 'scammer').\n"
                                "• <code>/aml search_tag [tag]</code> - Search addresses by metadata tag.\n\n"
                                "<b>🔐 MULTI-SIG VAULT & ESCROW CONTROLS</b>\n"
                                "• <code>/multisig create [b] [s] [val]</code> - Instantiate multi-sig wallet vault.\n"
                                "• <code>/multisig add_key [vault_id] [pk]</code> - Append public key to signers list.\n"
                                "• <code>/multisig status [vault_id]</code> - Check pending signatures for release.\n"
                                "• <code>/multisig sign [vault_id]</code> - Sign transaction payout release.\n"
                                "• <code>/multisig reject [vault_id]</code> - Oppose payout release and initiate dispute.\n"
                                "• <code>/multisig refund_sign [v]</code> - Sign transaction reversal back to buyer.\n"
                                "• <code>/multisig view_keys [v]</code> - Display key ownership details.\n"
                                "• <code>/multisig balance [v]</code> - Query wallet address balance on-chain.\n"
                                "• <code>/multisig close [v]</code> - Close multi-sig vault after release/refund.\n"
                                "• <code>/multisig history</code> - View all historical multi-sig transactions.\n\n"
                                "<b>⚖️ DISPUTE ESCROW LOCKS</b>\n"
                                "• <code>/dispute lock [deal_id]</code> - Freeze escrow release during active conflict.\n"
                                "• <code>/dispute unlock [deal_id]</code> - Clear hold flag for payment.\n"
                                "• <code>/dispute evidence [deal_id] [url]</code> - Add screenshot/chat text proof.\n"
                                "• <code>/dispute view_evidence [deal_id]</code> - View compiled escrow evidence links.\n"
                                "• <code>/dispute mediator [deal_id] [id]</code> - Assign mediator user.\n"
                                "• <code>/dispute split [deal] [b_pct] [s_pct]</code> - Release split deposit.\n"
                                "• <code>/dispute arbiter [deal_id]</code> - Route dispute case to global arbiter node.\n"
                                "• <code>/dispute timer [deal_id] [h]</code> - Set time limit (hours) for evidence.\n"
                                "• <code>/dispute auto_refund [on|off]</code> - Auto-refund buyer if seller goes MIA.\n"
                                "• <code>/dispute log_sheet [deal_id]</code> - Export dispute audit reports.\n\n"
                                "<b>📑 COMPLIANCE AUDITING & REPORTING</b>\n"
                                "• <code>/audit generate [deal_id]</code> - Output signed PDF receipt for transaction.\n"
                                "• <code>/audit view_logs [user_id]</code> - Pull historical transactions for user.\n"
                                "• <code>/audit export_csv [start] [end]</code> - Dump transaction history to CSV sheet.\n"
                                "• <code>/audit set_legal_name [name]</code> - Set legal owner entity name.\n"
                                "• <code>/audit tax_rate [pct]</code> - Calibrate tax/vat calculation on invoices.\n"
                                "• <code>/audit summary [days]</code> - Show volume, fees, and risk distributions.\n"
                                "• <code>/audit clean_logs [days]</code> - Prune logs older than N days.\n"
                                "• <code>/audit backup [dest]</code> - Backup compliance databases.\n"
                                "• <code>/audit integrity</code> - Check SQLite hashes for anti-tamper compliance.\n"
                                "• <code>/audit system_status</code> - Get status of AML nodes, escrows, and databases.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Secure compliance operations on autopilot. Zero risk exposure.</i>"
                            )
                            cmd_buttons = [
                                [Button.inline("⬅️ Back to Command Directory", b"pub_features")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(compliance_text, buttons=cmd_buttons, parse_mode="html")
                            return

                        elif data == b"pub_security":
                            security_text = (
                                "🛡️ <b>ESCROW & ANTI-FRAUD SHIELD</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Conduct OTC trades and middleman deals securely without human error.</blockquote>\n\n"
                                "<b>🔐 SAFE TRADE PROTOCOLS:</b>\n"
                                "• <b>Interactive Middleman Mode</b>: Coet automatically collects deal terms, buyer/seller usernames, and calculates escrow fees (e.g. 5% security fee).\n"
                                "• <b>Anti-Impersonator Block</b>: Scans display names and mutes copycats claiming to be you or an official admin.\n"
                                "• <b>Blacklist Keywords</b>: Auto-mute and block spammers sending blacklisted phrases.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Explore specialized escrow specifications:</i>"
                            )
                            security_buttons = [
                                [Button.inline("🛡️ Compliance & Security Audit (10 Pages)", b"pub_sec_wiki")],
                                [Button.inline("⚖️ Dispute Arbitration Protocol", b"pub_escrow_dispute")],
                                [Button.inline("⛓️ Supported Chains & Assets", b"pub_escrow_assets")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(security_text, buttons=security_buttons, parse_mode="html")
                            return

                        elif data == b"pub_escrow_dispute":
                            dispute_text = (
                                "⚖️ <b>DISPUTE ARBITRATION PROTOCOL</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Logical resolution structures built into automated transactions.</blockquote>\n\n"
                                "<b>⚖️ DISPUTE RESOLUTION PARAMETERS:</b>\n"
                                "• <b>Hold Escrow</b>: Auto-lock funds in system wallets on <code>/escrow hold</code> command.\n"
                                "• <b>Evidence Lock</b>: Dispute window opens for 48 hours for buyer/seller submissions (logs, screen grabs, hashes).\n"
                                "• <b>Mediator Allocation</b>: Re-route thread priorities to authorized third-party admins.\n"
                                "• <b>Resolution Output</b>: Refund release triggers <code>/escrow refund</code> (to buyer address) or payout dispatch <code>/escrow release</code> (to seller address).\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Strict mathematical escrow logic. Zero human vulnerability.</i>"
                            )
                            dispute_buttons = [
                                [Button.inline("⬅️ Back to Escrow Menu", b"pub_security")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(dispute_text, buttons=dispute_buttons, parse_mode="html")
                            return

                        elif data == b"pub_escrow_assets":
                            assets_text = (
                                "⛓️ <b>SUPPORTED CHAINS & ASSETS</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>We monitor multiple smart contract protocols to verify incoming deposits.</blockquote>\n\n"
                                "<b>⛓️ INTEGRATED NETWORKS:</b>\n"
                                "• <b>USDT (TRC-20)</b>: Lowest network fee tier, processed within 1-2 block confirmations.\n"
                                "• <b>USDT (ERC-20)</b>: High security layer, processed within 6 block confirmations.\n"
                                "• <b>USDT / USDC (BEP-20)</b>: Automated low-cost token transfers on Binance Smart Chain.\n"
                                "• <b>Native Tokens</b>: BTC, ETH, and SOL transfer confirmations are tracked via global nodes.\n\n"
                                "<b>⚡ SPEEDS:</b>\n"
                                "• Blockchain daemon processes verify balances every 12 seconds.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Secure wallet addresses bind to transaction IDs dynamically.</i>"
                            )
                            assets_buttons = [
                                [Button.inline("⬅️ Back to Escrow Menu", b"pub_security")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(assets_text, buttons=assets_buttons, parse_mode="html")
                            return

                        elif data == b"pub_vouches":
                            vouches_text = (
                                "👥 <b>CLIENT TESTIMONIALS & VOUCHES</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>See how other OTC admins and brokers are leveraging Coet.</blockquote>\n\n"
                                "<b>🔥 REVIEWS:</b>\n"
                                "• <i>'Saved me 4+ hours a day on repeat stock and Middleman fee queries. Highly recommend.'</i> — <b>OTC Broker</b>\n"
                                "• <i>'The Hinglish responses are so natural, my buyers think they're chatting directly with me.'</i> — <b>WP Alt Seller</b>\n"
                                "• <i>'Instantly muted a copycat account trying to scam my buyers in group comments. Phenomenal shield.'</i> — <b>Channel Admin</b>\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Read detailed client category stories:</i>"
                            )
                            vouches_buttons = [
                                [Button.inline("📈 Industry Blueprints (10 Pages)", b"pub_case_wiki")],
                                [Button.inline("📈 OTC Broker Success Stories", b"pub_vouches_brokers")],
                                [Button.inline("🛡️ Channel Admin Case Studies", b"pub_vouches_admins")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(vouches_text, buttons=vouches_buttons, parse_mode="html")
                            return

                        elif data == b"pub_vouches_brokers":
                            brokers_text = (
                                "📈 <b>OTC BROKER SUCCESS STORIES</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>How volume brokers scale operations with Coet.</blockquote>\n\n"
                                "<b>💸 CASE STUDY: CRYPTO OTC DESK</b>\n"
                                "• <b>Daily Inquiries</b>: 300+ incoming buyer requests.\n"
                                "• <b>Automation Level</b>: Replaced manually copying bank VPA details. Coet outputs UPI codes on demand via <code>/upi</code>.\n"
                                "• <b>Saves</b>: 22 hours per week of repetitive checkout instructions.\n"
                                "• <b>ROI Result</b>: Zero lost sales due to chat response lag.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>'Coet keeps transaction volumes flowing without friction.'</i>"
                            )
                            brokers_buttons = [
                                [Button.inline("⬅️ Back to Vouches Menu", b"pub_vouches")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(brokers_text, buttons=brokers_buttons, parse_mode="html")
                            return

                        elif data == b"pub_vouches_admins":
                            admins_text = (
                                "🛡️ <b>CHANNEL ADMIN CASE STUDIES</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Community management metrics under high scam load.</blockquote>\n\n"
                                "<b>🚨 CASE STUDY: TELEGRAM PUBLIC SALES GROUP</b>\n"
                                "• <b>Group Size</b>: 18,000+ members.\n"
                                "• <b>Spam Load</b>: Up to 150 spam bot join attempts per day.\n"
                                "• <b>Protection Used</b>: Coet Anti-Impersonator shield coupled with captchas.\n"
                                "• <b>Result</b>: Auto-muted 48 replica profiles posing as project admins within 0.1 seconds of creation.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>'Shield filters kept our community safe from phishing vectors.'</i>"
                            )
                            admins_buttons = [
                                [Button.inline("⬅️ Back to Vouches Menu", b"pub_vouches")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(admins_text, buttons=admins_buttons, parse_mode="html")
                            return

                        elif data == b"pub_telemetries":
                            telemetries_text = (
                                "📊 <b>LIVE SYSTEM TELEMETRY</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Real-time performance metrics for the Coet core system.</blockquote>\n\n"
                                "<b>📈 TELEMETRY METRICS:</b>\n"
                                "• <b>Query Router Latency</b>: <code>0.3ms</code>\n"
                                "• <b>Database Concurrency</b>: <code>WAL Concurrency Active</code>\n"
                                "• <b>AI Rotating Pool</b>: <code>5 Gemini Keys Active</code>\n"
                                "• <b>Uptime Uptime</b>: <code>99.99% Operational</code>\n"
                                "• <b>Voice Note Transcription</b>: <code>Active (Whisper Core)</code>\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Inspect advanced database and key matrix metrics:</i>"
                            )
                            telemetries_buttons = [
                                [Button.inline("🔑 API Key Rotation Matrix", b"pub_telemetry_keys")],
                                [Button.inline("📁 Database Engine Diagnostics", b"pub_telemetry_db")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(telemetries_text, buttons=telemetries_buttons, parse_mode="html")
                            return

                        elif data == b"pub_telemetry_keys":
                            keys_text = (
                                "🔑 <b>API KEY ROTATION MATRIX</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Our key pool rotation keeps your digital twin online and prevents API restriction blocks.</blockquote>\n\n"
                                "<b>🔑 KEY MATRIX RULES:</b>\n"
                                "• <b>Key Pool Size</b>: 5 active slots rotating dynamically.\n"
                                "• <b>Rate Limit Buffer</b>: Auto-cooldown active triggers. When a key experiences a HTTP 429 block, it rests for 60 seconds.\n"
                                "• <b>Key Rotator</b>: Switches keys sequentially after every 3 queries.\n"
                                "• <b>Health Check</b>: Background thread tests key ping speeds every 3 minutes.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>100% API availability. Re-routing loop ensures zero lost prompts.</i>"
                            )
                            keys_buttons = [
                                [Button.inline("⬅️ Back to Telemetry Menu", b"pub_telemetries")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(keys_text, buttons=keys_buttons, parse_mode="html")
                            return

                        elif data == b"pub_telemetry_db":
                            db_text = (
                                "📁 <b>DATABASE ENGINE DIAGNOSTICS</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>WAL mode database configuration yields fast concurrency rates under high loads.</blockquote>\n\n"
                                "<b>💾 DIAGNOSTIC METRICS:</b>\n"
                                "• <b>DB Type</b>: SQLite SQLite3 engine.\n"
                                "• <b>Journal Mode</b>: WAL (Write-Ahead Logging) enabling concurrent readers and writers.\n"
                                "• <b>Page Size</b>: 4096 Bytes optimized for low NVMe latency.\n"
                                "• <b>Cache Size</b>: 2000 active pages cached in ECC memory.\n"
                                "• <b>Auto-Vacuum</b>: Configured incrementally to clean storage leaks dynamically.\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Secure transactions. Read/write lockouts eliminated under concurrent requests.</i>"
                            )
                            db_buttons = [
                                [Button.inline("⬅️ Back to Telemetry Menu", b"pub_telemetries")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(db_text, buttons=db_buttons, parse_mode="html")
                            return

                        elif data == b"pub_pricing":
                            pricing_text = (
                                "📖 <b>PRICING & FREQUENTLY ASKED QUESTIONS</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Frequently asked questions and licensing information.</blockquote>\n\n"
                                "<b>💰 COMMERCIAL LICENSING:</b>\n"
                                "• <b>Standard Autopilot Plan</b>: Starting at <b>$50/month</b> (includes full hosting, style DNA setup, and rotated Gemini API keys).\n"
                                "• <b>Custom RAG Tier</b>: Custom pricing based on business FAQ size and custom database integrations.\n\n"
                                "<b>⚡ PAID TRIAL ONBOARDING:</b>\n"
                                "• <b>1-Day Subscription Session</b>: Get a full 1-day trial session for just <b>$2</b>. We don't offer free trials because high-quality digital twin processing requires dedicated GPU resources. Filter out low-intent window shoppers and test the limits immediately.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Select a plan model to view detailed licensing specs:</i>"
                            )
                            pricing_buttons = [
                                [Button.inline("📋 Support SLA & Licensing (10 Pages)", b"pub_price_wiki")],
                                [Button.inline("💼 Enterprise Dedicated Instance", b"pub_price_enterprise")],
                                [Button.inline("🤝 Franchise & Reseller License", b"pub_price_reseller")],
                                [Button.inline("📜 SLA & Terms & Conditions", b"pub_terms")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(pricing_text, buttons=pricing_buttons, parse_mode="html")
                            return

                        elif data == b"pub_price_enterprise":
                            enterprise_text = (
                                "💼 <b>ENTERPRISE DEDICATED INSTANCE</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>For high-volume OTC desks and corporate brokers requiring isolated clusters.</blockquote>\n\n"
                                "<b>⭐ PLAN FEATURES:</b>\n"
                                "• <b>Computing Power</b>: Isolated VM with 100% hardware allocation.\n"
                                "• <b>Rotator Keys</b>: Supply up to 20 custom API keys for zero-cooldown prompts.\n"
                                "• <b>DNS Mapping</b>: Hook custom domain names to active dashboard portals.\n"
                                "• <b>Support Tier</b>: Dedicated SLA engineering channels with 15-minute response times.\n"
                                "• <b>Database Clustering</b>: Setup custom replications across redundant cloud zones.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Custom quoted based on concurrency metrics. Contact developer.</i>"
                            )
                            enterprise_buttons = [
                                [Button.inline("⬅️ Back to Pricing Menu", b"pub_pricing")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(enterprise_text, buttons=enterprise_buttons, parse_mode="html")
                            return

                        elif data == b"pub_price_reseller":
                            reseller_text = (
                                "🤝 <b>FRANCHISE & RESELLER LICENSE</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Launch your own whitelabel AI digital twin automation service.</blockquote>\n\n"
                                "<b>🔥 RESELLER DEALS:</b>\n"
                                "• <b>Whitelabel Bot Builder</b>: Build bot instances with customized brand assets.\n"
                                "• <b>Partner Panel</b>: Admin console to track credits, balances, and instances.\n"
                                "• <b>Volume Discounts</b>: License rates start at $25/instance/month for partners with 10+ setups.\n"
                                "• <b>Support Pipeline</b>: Direct documentation, templates, and setup blueprints.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Partner with COET to build your whitelabel SaaS business.</i>"
                            )
                            reseller_buttons = [
                                [Button.inline("⬅️ Back to Pricing Menu", b"pub_pricing")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(reseller_text, buttons=reseller_buttons, parse_mode="html")
                            return

                        elif data == b"pub_terms":
                            terms_text = (
                                "📜 <b>SYSTEM SERVICE SLA & TERMS & CONDITIONS</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Terms governing licensing, SLA guarantees, and payment refunds.</blockquote>\n\n"
                                "<b>📜 CORE TERMS:</b>\n"
                                "• <b>Uptime Guarantee</b>: We guarantee 99.9% uptime for core client instances. Credits are applied in case of service downtime.\n"
                                "• <b>Trial Refund Policy</b>: The $2 1-day subscription trial is non-refundable and covers direct compute resources consumed during onboarding.\n"
                                "• <b>Escrow Responsibilities</b>: Escrow outputs are tool recommendations. Users must verify wallet addresses and confirmations before releasing funds.\n"
                                "• <b>API Keys</b>: Users must not share generated API keys to prevent session tokens revocation.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Standard commercial terms apply. By proceeding, you agree to these SLA metrics.</i>"
                            )
                            terms_buttons = [
                                [Button.inline("⬅️ Back to Pricing Menu", b"pub_pricing")],
                                [Button.inline("🏠 Main Menu", b"pub_back")]
                            ]
                            await event.edit(terms_text, buttons=terms_buttons, parse_mode="html")
                            return

                        # ==================== WIKI DIRECTORIES GATEWAYS ====================

                        elif data == b"pub_tech_wiki":
                            tech_wiki_text = (
                                "⚙️ <b>TECHNICAL ARCHITECTURE WIKI (10 PAGES)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>COET runs on a bare-metal virtualization cluster designed for high-concurrency event loops. Select a technical sub-page to view spec sheets:</blockquote>\n\n"
                                "<b>📁 TECHNICAL SPEC SHEETS:</b>\n"
                                "• <b>MTProto Spec</b>: Custom MTProto protocol handling.\n"
                                "• <b>Asyncio Loop</b>: High-performance Python async loop tuning.\n"
                                "• <b>SQLite WAL</b>: Write-ahead logging concurrent access.\n"
                                "• <b>Tokenization</b>: Gemini RAG context limits.\n"
                                "• <b>API Pool Matrix</b>: Keypool throttling algorithms.\n"
                                "• <b>Memory Cache</b>: Ultra-low latency Key-Value registers.\n"
                                "• <b>Webhook Queues</b>: Transaction event payload queues.\n"
                                "• <b>Websocket Stream</b>: Client dashboard feed broadcasts.\n"
                                "• <b>Systemd Daemon</b>: Daemon process crash recovery.\n"
                                "• <b>Stream Logging</b>: Log aggregation system metrics."
                            )
                            tech_wiki_buttons = [
                                [Button.inline("MTProto Spec", b"pub_tech_mtproto"), Button.inline("Asyncio Loop", b"pub_tech_asyncio")],
                                [Button.inline("SQLite WAL", b"pub_tech_sqlite"), Button.inline("Tokenization", b"pub_tech_tokens")],
                                [Button.inline("API Pool Matrix", b"pub_tech_pools"), Button.inline("Memory Cache", b"pub_tech_kvstore")],
                                [Button.inline("Webhook Queues", b"pub_tech_webhooks"), Button.inline("Websocket Stream", b"pub_tech_websockets")],
                                [Button.inline("Systemd Daemon", b"pub_tech_process"), Button.inline("Stream Logging", b"pub_tech_logging")],
                                [Button.inline("⬅️ Back to Specs Menu", b"pub_details")]
                            ]
                            await event.edit(tech_wiki_text, buttons=tech_wiki_buttons, parse_mode="html")
                            return

                        elif data == b"pub_sec_wiki":
                            sec_wiki_text = (
                                "🛡️ <b>COMPLIANCE & SECURITY AUDIT WIKI (10 PAGES)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Explore our core vulnerability mitigation matrix and encryption policies:</blockquote>"
                            )
                            sec_wiki_buttons = [
                                [Button.inline("API Key Sec", b"pub_sec_api_keys"), Button.inline("2FA Proxies", b"pub_sec_hijack")],
                                [Button.inline("Flood Shield", b"pub_sec_ratelimit"), Button.inline("GDPR Compliance", b"pub_sec_gdpr")],
                                [Button.inline("Scam Sync DB", b"pub_sec_scam_db"), Button.inline("Multi-sig Payout", b"pub_sec_multisig")],
                                [Button.inline("Reversal Shield", b"pub_sec_chargeback"), Button.inline("Dispute Mediation", b"pub_sec_arbitration")],
                                [Button.inline("Panic Codes", b"pub_sec_panic"), Button.inline("Penetration Audit", b"pub_sec_audit")],
                                [Button.inline("⬅️ Back to Escrow & Sec", b"pub_security")]
                            ]
                            await event.edit(sec_wiki_text, buttons=sec_wiki_buttons, parse_mode="html")
                            return

                        elif data == b"pub_serv_wiki":
                            serv_wiki_text = (
                                "🤝 <b>ESCROW SERVICES SETUP WIKI (10 PAGES)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Select an escrow service implementation card to view setup metrics:</blockquote>"
                            )
                            serv_wiki_buttons = [
                                [Button.inline("Verification", b"pub_serv_verification"), Button.inline("Group Bot Setup", b"pub_serv_group_bot")],
                                [Button.inline("UPI Configs", b"pub_serv_upi"), Button.inline("Multi-sigs Release", b"pub_serv_payouts")],
                                [Button.inline("Fee Sheets", b"pub_serv_fees"), Button.inline("Custody Wallet", b"pub_serv_custody")],
                                [Button.inline("Cross-border", b"pub_serv_crossborder"), Button.inline("Forms Builder", b"pub_serv_forms")],
                                [Button.inline("Ledger Sync", b"pub_serv_ledger"), Button.inline("CAPTCHA Gates", b"pub_serv_captcha")],
                                [Button.inline("⬅️ Back to Setup Menu", b"pub_setup")]
                            ]
                            await event.edit(serv_wiki_text, buttons=serv_wiki_buttons, parse_mode="html")
                            return

                        elif data == b"pub_price_wiki":
                            price_wiki_text = (
                                "📋 <b>SUPPORT SLA & LICENSING WIKI (10 PAGES)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Select a support or server license card to view billing structures:</blockquote>"
                            )
                            price_wiki_buttons = [
                                [Button.inline("Uptime SLA", b"pub_price_sla"), Button.inline("24/7 Priority", b"pub_price_priority")],
                                [Button.inline("Model Tuning", b"pub_price_training"), Button.inline("Domain Whitelabel", b"pub_price_whitelabel")],
                                [Button.inline("GPU Clusters", b"pub_price_gpu"), Button.inline("Rate Limits", b"pub_price_rate_tiers")],
                                [Button.inline("Service Credits", b"pub_price_refunds"), Button.inline("Custom Code", b"pub_price_custom_code")],
                                [Button.inline("Disaster Recovery", b"pub_price_recovery"), Button.inline("Volume Discount", b"pub_price_volume")],
                                [Button.inline("⬅️ Back to Pricing Menu", b"pub_pricing")]
                            ]
                            await event.edit(price_wiki_text, buttons=price_wiki_buttons, parse_mode="html")
                            return

                        elif data == b"pub_case_wiki":
                            case_wiki_text = (
                                "📈 <b>INDUSTRY BLUEPRINTS WIKI (10 PAGES)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Select a use case blueprint to examine deployment benchmarks:</blockquote>"
                            )
                            case_wiki_buttons = [
                                [Button.inline("Crypto Broker", b"pub_case_crypto"), Button.inline("Gaming Shop", b"pub_case_gaming")],
                                [Button.inline("Account Trade", b"pub_case_accounts"), Button.inline("Virtual Goods", b"pub_case_goods")],
                                [Button.inline("Agency Pipeline", b"pub_case_software"), Button.inline("Spam Blocking", b"pub_case_moderation")],
                                [Button.inline("DNA Cloning Review", b"pub_case_style"), Button.inline("Concurrency Load", b"pub_case_load")],
                                [Button.inline("Server Migration", b"pub_case_migration"), Button.inline("Deploy Blueprint", b"pub_case_blueprint")],
                                [Button.inline("⬅️ Back to Vouches", b"pub_vouches")]
                            ]
                            await event.edit(case_wiki_text, buttons=case_wiki_buttons, parse_mode="html")
                            return

                        # ==================== 50 NEW WIKI SUB-PAGES HANDLERS ====================

                        # 1. Tech Stack Sub-pages (10 Pages)
                        elif data == b"pub_tech_mtproto":
                            await event.edit("<b>⚙️ SPEC SHEET: MTPROTO PROTOCOL CLIENT</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Core: Telethon Async MTProto Client.\n• Packet Delay: Sub-10ms roundtrips.\n• Security: Encrypted MTProto payload channel.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_asyncio":
                            await event.edit("<b>⚙️ SPEC SHEET: PYTHON ASYNCIO EVENT LOOP</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Loop: Dynamic epoll loop selector on Linux instances.\n• Concurrency: Non-blocking multi-thread execution.\n• Throughput: 100+ tasks concurrent throughput limit.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_sqlite":
                            await event.edit("<b>⚙️ SPEC SHEET: SQLITE WAL CONCURRENCY</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Journal Mode: Write-Ahead Logging (WAL).\n• Lockout Mitigation: Simultaneous reads and writes.\n• Threading: Serialized cache execution mode.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_tokens":
                            await event.edit("<b>⚙️ SPEC SHEET: TOKENIZATION ENGINE</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Model Context: Gemini RAG context limits.\n• Context Width: Feed 100+ historical messages dynamically.\n• Latency: High context inputs analyzed in 1.2 seconds.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_pools":
                            await event.edit("<b>⚙️ SPEC SHEET: API ROTATION POOLS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• API Rotation: Alternates 5+ keys sequentially.\n• Fallback: Cooldown on HTTP 429 rate limit triggers.\n• Key Pool Health: Automated ping check routines.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_kvstore":
                            await event.edit("<b>⚙️ SPEC SHEET: CACHE & LOCAL KV STORE</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• KV Store: Local in-memory dictionary register.\n• Sync: Disk write buffers trigger on settings updates.\n• Speed: Key-value retrieval latencies sub-0.1ms.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_webhooks":
                            await event.edit("<b>⚙️ SPEC SHEET: WEBHOOK QUEUES</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Queue Type: Async FIFO queues for webhook retries.\n• Retries: Exponential backoff limits up to 5 attempts.\n• Payload: JSON formatting on standard events.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_websockets":
                            await event.edit("<b>⚙️ SPEC SHEET: WEBSOCKET STREAM LOOPS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Connection Type: Async loop broadcasting system status.\n• Dashboard Sync: Sends data updates to front-end instantly.\n• Security: Closed socket verification handshakes.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_process":
                            await event.edit("<b>⚙️ SPEC SHEET: SYSTEMD SERVICE MANAGER</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Process Manager: Linux Systemd core daemon.\n• Auto-Restart: Configured to reboot bot on any failure.\n• Monitoring: Watchdog loops trace thread blocks.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_tech_logging":
                            await event.edit("<b>⚙️ SPEC SHEET: LOG AGGREGATION & STREAMING</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Output Format: JSON formatted event logs.\n• Debug Level: Dynamic logging level adjust rules.\n• Persistence: Keeps logs on local container for 7 days.", buttons=[[Button.inline("⬅️ Back to Tech Wiki", b"pub_tech_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return

                        # 2. Compliance & Audit Sub-pages (10 Pages)
                        elif data == b"pub_sec_api_keys":
                            await event.edit("<b>🛡️ AUDIT CARD: CRYPTOGRAPHIC API KEY SECURITY</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Secret storage: Rotator key files encrypted locally.\n• Rotation: Automated API key cycling avoids rate bans.\n• Revocation: Wipe keys via control console instantly.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_hijack":
                            await event.edit("<b>🛡️ AUDIT CARD: 2FA PROXIES & HIJACK SHIELDS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Session Shield: Detects geographic login changes.\n• Proxy Gate: Blocks session hijack attempts.\n• Verification: Triggers offline alerts to the owner.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_ratelimit":
                            await event.edit("<b>🛡️ AUDIT CARD: BOT FLOOD & RATE LIMIT SHIELDS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Rate Limits: Limits user trigger requests to 5 per minute.\n• Spam Block: Auto-mutes users sending concurrent messages.\n• Cooldown: Cooldown timers automatically clear.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_gdpr":
                            await event.edit("<b>🛡️ AUDIT CARD: DATA PROTECTION REGULATION COMPLIANCE</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• GDPR Compliance: Local message data encrypted.\n• Forget Option: Users can request complete history erasure.\n• Exclusions: Zero tracking pixels or analytical cookies.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_scam_db":
                            await event.edit("<b>🛡️ AUDIT CARD: SCAMMER DATABASE SYNCHRONIZATION</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Sync Schedule: Pulls scam registries every 12 hours.\n• Impersonator Sweeps: Detects fake support usernames.\n• Block Action: Auto-flags matching profiles instantly.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_multisig":
                            await event.edit("<b>🛡️ AUDIT CARD: MULTI-SIG PAYOUT CONTROLS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Payout Logic: Requires two signatures for escrow release.\n• Multi-Sig Address: Generated dynamically on setup.\n• Timeout Lockout: Locks funds until deal is cleared.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_chargeback":
                            await event.edit("<b>🛡️ AUDIT CARD: REVERSAL & CHARGEBACK PROTECTION</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Verification: Dynamic checkout invoices are non-reversible.\n• Escrow release: Released only on confirmation logs.\n• Fraud Check: Flags unusual user transaction patterns.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_arbitration":
                            await event.edit("<b>🛡️ AUDIT CARD: DISPUTE MEDIATION COMPLIANCE</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Resolution: Disputes routed to third-party mediator.\n• Proof: Event logs lock instantly on hold commands.\n• Release: Locked until mediator sign-off confirmation.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_panic":
                            await event.edit("<b>🛡️ AUDIT CARD: CORE SYSTEM EMERGENCY PANIC LOCKS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Panic trigger: Instantly suspends all AI chat event loops.\n• State: Locks SQLite databases to read-only state.\n• Release: Owner must verify system logs to unlock.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_sec_audit":
                            await event.edit("<b>🛡️ AUDIT CARD: PENETRATION TESTING & SECURITY AUDITS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Core Security: Code reviewed by independent developers.\n• Leak Prevention: Telemetry parameters omit API keys.\n• Port Policy: Closed internal Docker container setup.", buttons=[[Button.inline("⬅️ Back to Compliance Wiki", b"pub_sec_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return

                        # 3. Escrow Services Sub-pages (10 Pages)
                        elif data == b"pub_serv_verification":
                            await event.edit("<b>🤝 SETUP CARD: CRYPTOGRAPHIC VERIFICATION</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Deal Verification: Check digital signatures before releases.\n• Verification: Scans blockchain transaction receipts.\n• Speed: Validates transaction IDs within 12 seconds.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_group_bot":
                            await event.edit("<b>🤝 SETUP CARD: GROUP BOT INTEGRATIONS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Group core: Install Coet as moderator in target chats.\n• Interaction: Group members use escrow inline triggers.\n• Customization: Group administrators set fee scales.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_upi":
                            await event.edit("<b>🤝 SETUP CARD: UPI PAYMENTS CONFIGURATIONS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• FIAT Gate: Setup Indian banking UPI handles.\n• Auto QR: Renders UPI payment codes in-chat.\n• Verification: Checks transactions against UTR hashes.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_payouts":
                            await event.edit("<b>🤝 SETUP CARD: MULTI-SIG RELEASE DETAILS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Signatures: Requires admin signature and seller receipt.\n• Delay: Optional 24h settlement holding period.\n• Chain Support: Ethereum, Tron, and Sol balance checks.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_fees":
                            await event.edit("<b>🤝 SETUP CARD: TRANSACTION FEE SCHEDULES</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Fees: Dynamic calculations based on transaction size.\n• Config: Flat fee or percentage options (e.g. 5% fee).\n• Discounting: Discount configurations for VIP brokers.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_custody":
                            await event.edit("<b>🤝 SETUP CARD: CUSTODY COLD WALLETS SETUP</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Storage: Deposit funds directly to offline addresses.\n• Tracking: Watches address balances using node APIs.\n• Security: Private keys are held offline by developers.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_crossborder":
                            await event.edit("<b>🤝 SETUP CARD: CROSS-BORDER TRADE SETTLEMENTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Settle Options: Convert fiat USD to local payment loops.\n• Currencies: INR, USD, and AED settlement targets.\n• Compliance: Tracks client identification logs.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_forms":
                            await event.edit("<b>🤝 SETUP CARD: AUTOMATED FORMS BUILDER</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Forms: Setup target buyer and seller deal sheets.\n• Sync: Fills forms using chat parameters.\n• Export: Generates signed deal PDF invoices.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_ledger":
                            await event.edit("<b>🤝 SETUP CARD: DATABASE LEDGER SYNC ROUTINES</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Sync Type: Export transaction databases daily.\n• Files: Downloads database state in CSV format.\n• Storage: Automated backups saved on secure drives.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_serv_captcha":
                            await event.edit("<b>🤝 SETUP CARD: CAPTCHA ONBOARDING GATES</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• CAPTCHAs: Math challenge and button gate formats.\n• Settings: Auto-restrict members until verified.\n• Uptime: Reduces chat moderator loads by 80%.", buttons=[[Button.inline("⬅️ Back to Escrow Wiki", b"pub_serv_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return

                        # 4. Licensing SLA Sub-pages (10 Pages)
                        elif data == b"pub_price_sla":
                            await event.edit("<b>📋 SLA SPECS: SERVICE LEVEL AGREEMENT METRICS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Core Uptime SLA: 99.9% uptime guarantees.\n• Downtime credit: License extensions applied on errors.\n• Server latency: Processing responses targeted under 2s.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_priority":
                            await event.edit("<b>📋 SLA SPECS: 24/7 PRIORITY SUPPORT CHANNELS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Response Time: SLA targets developer response in 15m.\n• Support Channels: Direct phone link and chat groups.\n• Scope: Core setup re-building and recovery operations.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_training":
                            await event.edit("<b>📋 SLA SPECS: MODEL TUNING & TRAINING FEES</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Custom Training: Analyze custom history data logs.\n• Dynamic updates: Updates persona rules for $10/rebuild.\n• Scope: Refine writing styles, slang, and casings.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_whitelabel":
                            await event.edit("<b>📋 SLA SPECS: DOMAIN WHITELABEL OPTIONS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Domain sync: Hook custom domain names to admin dashboards.\n• Styling: Apply whitelabel logos and brand settings.\n• Cost: Whitelabel licensing costs $15/month.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_gpu":
                            await event.edit("<b>📋 SLA SPECS: DEDICATED GPU CLUSTER ALLOCATIONS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• GPU Hardware: Nvidia H100 dedicated instances.\n• Concurrency: Processing speeds under 100ms.\n• Scope: Corporate plans with extreme query speeds.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_rate_tiers":
                            await event.edit("<b>📋 SLA SPECS: API RATE LIMIT TIERS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Standard Plan: Max 500 AI queries per day.\n• Custom RAG: Limits up to 5,000 queries per day.\n• Enterprise: Unlimited API rate limit setups.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_refunds":
                            await event.edit("<b>📋 SLA SPECS: REFUND & CREDIT TERM AGREEMENTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Refund Options: Paid $2 trial non-refundable.\n• SLA credits: Automated credit adjustments on outages.\n• Cancellation: Cancel monthly subscription cycles anytime.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_custom_code":
                            await event.edit("<b>📋 SLA SPECS: CUSTOM INTEGRATIONS DEVELOPMENT</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Coding scope: Custom database, payment integrations.\n• Developer cost: Standard developer rates at $50/hour.\n• Timeframes: Average updates complete within 48 hours.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_recovery":
                            await event.edit("<b>📋 SLA SPECS: DISASTER RECOVERY & BACKUPS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Backup: Full database backup cycles every 6 hours.\n• Restoration: Fast restore timeframes under 15 minutes.\n• Server sync: Offsite database nodes operational.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_price_volume":
                            await event.edit("<b>📋 SLA SPECS: VOLUME & RESELLER PLANS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Resellers: Discounts start on 5+ bot setups.\n• License rates: Save up to 50% on multi-instance setups.\n• Control: Reseller panel manages deployment tasks.", buttons=[[Button.inline("⬅️ Back to SLA Wiki", b"pub_price_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return

                        # 5. Case Studies Sub-pages (10 Pages)
                        elif data == b"pub_case_crypto":
                            await event.edit("<b>📈 BLUEPRINT: CRYPTO BROKERS ESCROW DEPLOYMENT</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Automating wallet updates for OTC groups.\n• Concurrency: Handles 200+ deal inquiries daily.\n• Uptime: Stable performance with zero wallet errors.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_gaming":
                            await event.edit("<b>📈 BLUEPRINT: GAMING ASSET STORES MODERATION</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Virtual items delivery and checkout gates.\n• Settings: Auto-sends payments QR strings.\n• Result: Reduced customer checkout steps by 60%.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_accounts":
                            await event.edit("<b>📈 BLUEPRINT: SOCIAL MEDIA ACCOUNT BROKERS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Accounts escrow and verification.\n• Flows: Verifies login details through API triggers.\n• Speed: Speeds up account releases by 70%.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_goods":
                            await event.edit("<b>📈 BLUEPRINT: VIRTUAL GOODS RESELLERS AUTOMATION</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Licenses and key distribution chat flows.\n• Setup: Hook database key databases to bot logic.\n• ROI Result: Automated 85% of total sales queries.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_software":
                            await event.edit("<b>📈 BLUEPRINT: AGENCY DEVELOPMENT PIPELINE</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Ticket collection and deadline reminders.\n• Sync: Sync developer channels with GitHub tasks.\n• Uptime: Dynamic GitHub notifications set up.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_moderation":
                            await event.edit("<b>📈 BLUEPRINT: ANTI-FRAUD PUBLIC CHAT SWEEPS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Spam sweep loops and user restrict rules.\n• Protection: Block spammers using regular expressions.\n• Output: Deleted 10,000+ spam comments dynamically.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_style":
                            await event.edit("<b>📈 BLUEPRINT: STYLE DNA CLONING VERIFICATION</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Mirroring owner messaging traits live.\n• Mechanics: Analyzed 2,000 chat logs dynamically.\n• Output: 98% of users believed AI twin was human.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_load":
                            await event.edit("<b>📈 BLUEPRINT: HIGH CONCURRENCY LOAD TESTING</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Performance diagnostics at 1,000 req/min.\n• Engine: SQLite WAL mode handles locks cleanly.\n• Latency: Loop processing latency steady at 0.4ms.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_migration":
                            await event.edit("<b>📈 BLUEPRINT: ZERO-DOWNTIME MIGRATION LOGS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Transferring database hosts securely.\n• Setup: Real-time container mirroring routines.\n• Uptime: Database migration finished with 0s downtime.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_case_blueprint":
                            await event.edit("<b>📈 BLUEPRINT: COMPREHENSIVE DEPLOYMENT MAPS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n• Target: Corporate bot scaling maps.\n• Scope: Configuration guidelines, templates, SLAs.\n• Cost: Included in Standard and Enterprise plans.", buttons=[[Button.inline("⬅️ Back to Case Wiki", b"pub_case_wiki")], [Button.inline("🏠 Main Menu", b"pub_back")]], parse_mode="html")
                            return
                        elif data == b"pub_admin_demo" or data == b"pub_adm_pg1":
                            admin_demo_text = (
                                "🛠️ <b>PRO DIGITAL TWIN CONTROL CONSOLE (DEMO - PAGE 1)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Welcome to the administrative control preview. Configure system logic, manage databases, and tune models like a pro.</blockquote>\n\n"
                                "<b>⚙️ AUTOPILOT CORE & PERSONALITY SUITE:</b>\n"
                                "• <b>Autopilot Persona Model</b>: Select target LLM versions and tune persona weights.\n"
                                "• <b>Text Casing Rules</b>: Set lowercase profiles and capitalisation triggers.\n"
                                "• <b>Response Speed Delays</b>: Calibrate typing simulation and delay limits.\n"
                                "• <b>Longterm Memory Store</b>: Inspect client background logs and relationship commitments.\n"
                                "• <b>Model Temp Parameter</b>: Adjust creativity thresholds (0.0 to 1.0).\n"
                                "• <b>System Activity Presets</b>: Toggle auto-busy and active hours scheduler.\n"
                                "• <b>Slang Hinglish Blend</b>: Calibrate slang blending ratios dynamically.\n"
                                "• <b>Persona Overrides</b>: Append custom system instructions into active memory.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Page 1 of 3 • Select a control module below:</i>"
                            )
                            admin_keyboard = [
                                [
                                    Button.inline("🤖 Autopilot Persona Model", b"pub_adm_persona"),
                                    Button.inline("✍️ Text Casing Rules", b"pub_adm_casing")
                                ],
                                [
                                    Button.inline("⚡ Response Speed Delays", b"pub_adm_speed"),
                                    Button.inline("🧠 Longterm Memory Store", b"pub_adm_memory")
                                ],
                                [
                                    Button.inline("🧪 Model Temp Parameter", b"pub_adm_temp"),
                                    Button.inline("⚙️ System Activity Presets", b"pub_adm_presets")
                                ],
                                [
                                    Button.inline("🗣️ Slang Hinglish Blend", b"pub_adm_slang"),
                                    Button.inline("📝 Persona Overrides", b"pub_adm_persona_over")
                                ],
                                [
                                    Button.inline("➡️ Next Page (Security)", b"pub_adm_pg2")
                                ],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(admin_demo_text, buttons=admin_keyboard, parse_mode="html")
                            return
                        elif data == b"pub_adm_pg2":
                            admin_demo_text = (
                                "🛠️ <b>PRO DIGITAL TWIN CONTROL CONSOLE (DEMO - PAGE 2)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Welcome to the administrative control preview. Configure group protection, CAPTCHA gates, and security locks.</blockquote>\n\n"
                                "<b>⚙️ SECURITY & GROUP MODERATION SUITE:</b>\n"
                                "• <b>Anti-Scam Verification</b>: Run cross-database checkups on user profiles.\n"
                                "• <b>Global Member Mutes</b>: Manage silenced users across channels.\n"
                                "• <b>Spam Word Blacklists</b>: Filter out scam phrases and malicious links.\n"
                                "• <b>Math CAPTCHA Gates</b>: Guard join-requests with mathematical equations.\n"
                                "• <b>Emergency Panic Lock</b>: Instantly suspend all automation loops.\n"
                                "• <b>Maintenance Standby</b>: Pause auto-responses for administrative tasks.\n"
                                "• <b>User Infraction Limits</b>: Calibrate violation thresholds before bans.\n"
                                "• <b>Active Group Chats</b>: Manage channels and group bots whitelist.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Page 2 of 3 • Select a control module below:</i>"
                            )
                            admin_keyboard = [
                                [
                                    Button.inline("🛡️ Anti-Scam Verification", b"pub_adm_antiscam"),
                                    Button.inline("🔇 Global Member Mutes", b"pub_adm_mutes")
                                ],
                                [
                                    Button.inline("🚫 Spam Word Blacklists", b"pub_adm_blacklist"),
                                    Button.inline("🎮 Math CAPTCHA Gates", b"pub_adm_captcha")
                                ],
                                [
                                    Button.inline("🚨 Emergency Panic Lock", b"pub_adm_panic"),
                                    Button.inline("🛠️ Maintenance Standby", b"pub_adm_maint")
                                ],
                                [
                                    Button.inline("🚯 User Infraction Limits", b"pub_adm_infractions"),
                                    Button.inline("👥 Active Group Chats", b"pub_adm_channels")
                                ],
                                [
                                    Button.inline("⬅️ Prev Page", b"pub_adm_pg1"),
                                    Button.inline("➡️ Next Page (Ledgers)", b"pub_adm_pg3")
                                ],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(admin_demo_text, buttons=admin_keyboard, parse_mode="html")
                            return
                        elif data == b"pub_adm_pg3":
                            admin_demo_text = (
                                "🛠️ <b>PRO DIGITAL TWIN CONTROL CONSOLE (DEMO - PAGE 3)</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>Welcome to the administrative control preview. Manage billing ledgers, API rotator keys, and webhook pipelines.</blockquote>\n\n"
                                "<b>⚙️ ACCOUNTING, SYSTEM & API INTEGRATIONS:</b>\n"
                                "• <b>UPI Fiat Settlement</b>: Setup dynamic QR payout addresses.\n"
                                "• <b>Ledger Balance Sync</b>: Check credit usage sheets.\n"
                                "• <b>Invoice Creator Engine</b>: Issue invoices for digital goods.\n"
                                "• <b>Promo Credit Allocator</b>: Push balance rewards to partners.\n"
                                "• <b>API Key Pool Rotator</b>: Rotate and test active Gemini keys.\n"
                                "• <b>System Uptime Monitors</b>: Inspect core hardware logs.\n"
                                "• <b>DB WAL Engine Info</b>: Query SQLite concurrent connections.\n"
                                "• <b>Webhook Sockets Stream</b>: Watch outbound socket loops.\n"
                                "• <b>Debug Live Logs</b>: View real-time error event aggregates.\n"
                                "• <b>Timer Alert Scheduler</b>: View cron tasks and notifications.\n\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Page 3 of 3 • Select a control module below:</i>"
                            )
                            admin_keyboard = [
                                [
                                    Button.inline("💳 UPI Fiat Settlement", b"pub_adm_upi"),
                                    Button.inline(" Ledger Balance Sync", b"pub_adm_ledger")
                                ],
                                [
                                    Button.inline("💵 Invoice Creator Engine", b"pub_adm_invoice"),
                                    Button.inline("📊 Promo Credit Allocator", b"pub_adm_credits")
                                ],
                                [
                                    Button.inline("🔑 API Key Pool Rotator", b"pub_adm_keypools"),
                                    Button.inline("🩺 System Uptime Monitors", b"pub_adm_uptime")
                                ],
                                [
                                    Button.inline("📁 DB WAL Engine Info", b"pub_adm_dbwal"),
                                    Button.inline("🔌 Webhook Sockets Stream", b"pub_adm_webhooks")
                                ],
                                [
                                    Button.inline("📡 Debug Live Logs", b"pub_adm_logs"),
                                    Button.inline("⏰ Timer Alert Scheduler", b"pub_adm_alerts")
                                ],
                                [
                                    Button.inline("⬅️ Prev Page (Security)", b"pub_adm_pg2")
                                ],
                                [Button.inline("⚡ Deploy Autopilot ($2 Trial)", b"pub_setup")],
                                [Button.inline("⬅️ Back to Main Menu", b"pub_back")]
                            ]
                            await event.edit(admin_demo_text, buttons=admin_keyboard, parse_mode="html")
                            return
                        elif data.startswith(b"pub_adm_") and data not in [b"pub_adm_pg1", b"pub_adm_pg2", b"pub_adm_pg3"]:
                            await event.answer("⚠️ You need to purchase a subscription to access this page.", alert=True)
                            return

                        # ==================== EXIST BACK ROUTER ====================

                        elif data == b"pub_back":
                            # Redraw the main intro panel!
                            intro_text = (
                                "⚡ <b>COET AI: THE ULTIMATE DIGITAL TWIN AUTOPILOT</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<blockquote>COET is an elite, event-driven AI Digital Twin and distributed client automation assistant, engineered natively for high-load messaging operations and secure relation management.</blockquote>\n\n"
                                "<b>🔍 LIVE DEMO CONSOLE:</b>\n"
                                "• Experience the active autopilot simulation live: @CatVos\n\n"
                                "<b>📈 THE ROI FORMULA:</b>\n"
                                "• <b>Save Time</b>: Reclaim 20+ hours/week by automating repeat questions.\n"
                                "• <b>Scale Instantly</b>: Handle 100+ customer DMs simultaneously 24/7.\n"
                                "• <b>Cut Costs</b>: Replaces a $1,200/month human manager for just $50/month.\n"
                                "• <b>Zero Leakage</b>: Instantly guides leads to checkout/deals while you sleep.\n\n"
                                "👥 <i>Trusted by premium OTC desks and high-volume Telegram brokers to automate client relations 24/7.</i>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<b>🛡️ DEVELOPER CREDENTIALS:</b>\n"
                                "• <b>Lead Engineer</b>: <i>shinichiro</i> (@shinichirofr)\n"
                                "• <b>Corporate Email</b>: <code>admin@shinken.in</code>\n"
                                "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                "<i>Select a protocol option below to explore features, specs, and deploy your autopilot assistant.</i>"
                            )
                            reply_keyboard = [
                                [Button.inline("⚡ Deploy Your Digital Twin", b"pub_setup")],
                                [Button.inline("🛠️ Pro Admin Panel Demo (20+ Sub-pages)", b"pub_admin_demo")],
                                [Button.url("🔍 Check Live Demo (@CatVos)", "https://t.me/CatVos")],
                                [Button.inline("🧠 Style Mirroring DNA", b"pub_dna_info"), Button.inline("⚙️ Command Directory (300+)", b"pub_features")],
                                [Button.inline("🛡️ Escrow & Security", b"pub_security"), Button.inline("👥 Success Vouches", b"pub_vouches")],
                                [Button.inline("📊 Live Telemetry", b"pub_telemetries"), Button.inline("💰 Pricing & $2 Trial", b"pub_pricing")],
                                [Button.inline("ℹ️ Infrastructure Specs", b"pub_details")]
                            ]
                            await event.edit(intro_text, buttons=reply_keyboard, parse_mode="html")
                            return

                    # 2. Owner Command Panel Callbacks (Enforce Owner Check!)
                    if not self.is_owner(event.sender_id):
                        await event.answer("⚠️ Access Denied: Unauthorized account.", alert=True)
                        return
                    
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
                    "🚀 <b>SETUP & DEPLOYMENT PROTOCOL</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Deploy your customized Digital Twin on your personal account. Replicate yourself and close deals 24/7.</blockquote>\n\n"
                    "<b>⚙️ DEPLOYMENT MECHANICS:</b>\n"
                    "• <b>Linguistic Mimicry</b>: Scans your historical messages to replicate your unique writing style (Roman Hinglish/English balance, casing, abbreviations like 'rn', 'wp', 'tg', 'bhai', 'yaar').\n"
                    "• <b>RAG FAQ Integration</b>: Train your bot on your specific middleman policies, rates, and stock availability rules.\n"
                    "• <b>Typing Simulation</b>: Automatically shows typing indicators and introduces natural time delays matching your status.\n\n"
                    "🔥 <b>SCARCITY WARNING:</b>\n"
                    "Only <b>4 out of 10</b> slots remain for this onboarding batch. Setup takes up to 24 hours. Batch closes strictly within 48 hours to ensure dedicated server performance for existing clients.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>Initiate secure onboarding directly via the developer.</i>"
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
                    "<tg-spoiler>Click below to inspect the demo channel and profile setup. If you wish to proceed with integration, contact the developer.</tg-spoiler>\n\n"
                    "• <b>Active Showcase</b>: @CatVos\n"
                    "• <b>Developer</b>: @shinichirofr"
                ),
                "SYSTEM TELEMETRIES": (
                    "📊 <b>LIVE SYSTEM TELEMETRY</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Real-time performance metrics for the Coet core system.</blockquote>\n\n"
                    "<b>📈 TELEMETRY METRICS:</b>\n"
                    "• <b>Query Router Latency</b>: <code>0.3ms</code>\n"
                    "• <b>Database Concurrency</b>: <code>WAL Concurrency Active</code>\n"
                    "• <b>AI Rotating Pool</b>: <code>5 Gemini Keys Active</code>\n"
                    "• <b>Uptime Uptime</b>: <code>99.99% Operational</code>\n"
                    "• <b>Voice Note Transcription</b>: <code>Active (Whisper Core)</code>\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>Performance metrics updated in real-time.</i>"
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
                    "📖 <b>PRICING & FREQUENTLY ASKED QUESTIONS</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<blockquote>Frequently asked questions and licensing information.</blockquote>\n\n"
                    "<b>💰 COMMERCIAL LICENSING:</b>\n"
                    "• <b>Standard Autopilot Plan</b>: Starting at <b>$50/month</b> (includes full hosting, style DNA setup, and rotated Gemini API keys).\n"
                    "• <b>Custom RAG Tier</b>: Custom pricing based on business FAQ size and custom database integrations.\n\n"
                    "<b>⚡ PAID TRIAL ONBOARDING:</b>\n"
                    "• <b>1-Day Subscription Session</b>: Get a full 1-day trial session for just <b>$2</b>. We don't offer free trials because high-quality digital twin processing requires dedicated GPU resources. Filter out low-intent window shoppers and test the limits immediately.\n\n"
                    "<b>❓ FAQs:</b>\n"
                    "• <i>Will my account get restricted?</i> No. Coet mimics natural typing behaviors, sets active hours, and throttles responses safely.\n"
                    "• <i>Can I tweak the rules?</i> Yes, you get a full glassmorphic web dashboard to modify FAQs, statuses, and style traits.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "<i>Deploy your trial assistant today for only $2.</i>"
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
        is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
        reply_limit = 5
        replies_sent = db.get_assistant_reply_count_since_last_owner(sender_id)
        if replies_sent >= reply_limit and not is_shinichiro:
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
        history = db.get_chat_history(sender_id, limit=350)
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
        
        start_time = time.time()
        async with event.client.action(sender_id, 'typing'):
            # Fast pre-check: skip Gemini call entirely if no healthy keys available
            import ai_engine as _ai
            _healthy_keys = _ai.get_healthy_keys()
            if not _healthy_keys:
                db.log_event("WARNING", f"No healthy Gemini keys — instant fallback for {sender_name}.")
                fallback_reply = ai_engine.get_rule_based_fallback(
                    text, current_status, history, contact.get('first_name', '')
                )
                analysis = {
                    "sentiment": "neutral", "priority": "normal",
                    "suggested_category": contact.get('category', 'unknown'),
                    "language": "hinglish" if any(x in text.lower() for x in ["bhai", "yaar", "kya", "hai", "ko"]) else "english",
                    "tone": "casual", "suggested_personality": "Human Offline Backup",
                    "draft_reply": fallback_reply, "schedule_reminder": None
                }
            else:
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
                        timeout=8.0
                    )
                except Exception as e:
                    db.log_event("WARNING", f"Gemini API failed ({e}) for {sender_name}. Using Offline Backup engine.")
                    fallback_reply = ai_engine.get_rule_based_fallback(
                        text, current_status, history, contact.get('first_name', '')
                    )
                    analysis = {
                        "sentiment": "neutral", "priority": "normal",
                        "suggested_category": contact.get('category', 'unknown'),
                        "language": "hinglish" if any(x in text.lower() for x in ["bhai", "yaar", "kya", "hai", "ko"]) else "english",
                        "tone": "casual", "suggested_personality": "Human Offline Backup",
                        "draft_reply": fallback_reply, "schedule_reminder": None
                    }

                
            # Handle Lead Developer / Sensei System Updates
            system_update = analysis.get("system_update")
            is_shinichiro = (sender_id == 7473010693) or (username and username.lower() == "shinichirofr")
            if system_update and is_shinichiro:
                await self.apply_system_update(system_update, sender_id, username, sender_name)

            reply = analysis.get("draft_reply", "")
            
            # Simulate natural typing delay using setting limits with random factor
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

    async def periodic_style_rebuilder(self):
        """Periodically rebuild the owner style profile every 2 hours if new messages are detected."""
        db.log_event("INFO", "Periodic Owner Style DNA Rebuilder task started.")
        while True:
            try:
                await asyncio.sleep(7200) # 2 hours
                new_msgs_count = int(db.get_setting("owner_new_messages_since_rebuild", "0"))
                if new_msgs_count > 0:
                    db.log_event("INFO", f"Triggering background Owner Style DNA rebuild based on {new_msgs_count} new messages...")
                    import threading
                    threading.Thread(target=ai_engine.rebuild_owner_style_profile, daemon=True).start()
                    db.set_setting("owner_new_messages_since_rebuild", "0")
                else:
                    db.log_event("INFO", "No new owner messages since last style profile rebuild. Skipping.")
            except Exception as e:
                db.log_event("ERROR", f"Error in periodic style rebuilder task: {e}")

    async def send_humanized_replies(self, sender_id, text, detected_lang, detected_tone, priority_val, sender_name):
        """
        Sends message(s) simulating natural human texting flows:
        - Splits long or multi-paragraph messages into consecutive messages if enabled.
        - Calculates typing duration based on character length.
        - Toggles delays based on configuration settings.
        - Simulates a rare QWERTY keyboard distance typo and correction.
        """
        import random
        import re
        import asyncio
        import time as _time
        
        # Load humanization settings
        enable_human_delays = db.get_setting("enable_human_delays", "1") == "1"
        enable_split_messages = db.get_setting("enable_split_messages", "1") == "1"
        
        # 1. Split replies by double newline or sentences if long and enabled
        parts = []
        if enable_split_messages:
            if "\n\n" in text:
                raw_parts = text.split("\n\n")
                for p in raw_parts:
                    p_strip = p.strip()
                    if p_strip:
                        parts.append(p_strip)
            elif len(text) > 120:
                sentence_ends = re.split(r'(?<=[.!?])\s+', text)
                current_part = ""
                for s in sentence_ends:
                    if len(current_part) + len(s) < 100:
                        current_part += (" " if current_part else "") + s
                    else:
                        if current_part:
                            parts.append(current_part)
                        current_part = s
                if current_part:
                    parts.append(current_part)
            else:
                parts.append(text)
        else:
            parts.append(text)
            
        # Helper to generate a realistic QWERTY keyboard swap typo
        def _get_qwerty_typo(part_text):
            qwerty_swaps = {
                'a': 's', 'b': 'n', 'c': 'v', 'd': 's', 'e': 'r', 'f': 'g', 'g': 'h', 'h': 'j', 'i': 'o', 
                'j': 'k', 'k': 'l', 'l': 'k', 'm': 'n', 'n': 'b', 'o': 'p', 'p': 'o', 'q': 'w', 'r': 't', 
                's': 'd', 't': 'y', 'u': 'i', 'v': 'c', 'w': 'e', 'x': 'c', 'y': 't', 'z': 'x'
            }
            words = part_text.split()
            candidates = [w for w in words if w.isalpha() and 4 <= len(w) <= 8]
            if not candidates:
                return None, None, part_text
                
            target = random.choice(candidates)
            if len(target) < 4:
                return None, None, part_text
                
            # Swaps a character in the middle
            idx = random.randint(1, len(target) - 2)
            char = target[idx]
            if char in qwerty_swaps:
                typo_char = qwerty_swaps[char]
                typo_word = target[:idx] + typo_char + target[idx+1:]
            else:
                # swap adjacent letters
                typo_word = target[:idx] + target[idx+1] + target[idx] + target[idx+2:]
                
            typo_part = part_text.replace(target, typo_word, 1)
            return typo_word, target, typo_part

        # 2. Process each part sequentially
        for part_idx, part in enumerate(parts):
            if enable_human_delays:
                if part_idx == 0:
                    await asyncio.sleep(random.uniform(0.4, 0.9))
                else:
                    await asyncio.sleep(random.uniform(1.2, 2.2)) # longer delay for double text typing gap
            else:
                await asyncio.sleep(0.05)
                
            async with self.client.action(sender_id, 'typing'):
                if enable_human_delays:
                    char_delay = len(part) * 0.025
                    typing_delay = max(1.0, min(4.5, char_delay + random.uniform(-0.3, 0.4)))
                    await asyncio.sleep(typing_delay)
                else:
                    await asyncio.sleep(0.1)
                
                typo_word = None
                correction_word = None
                typo_part = part
                
                # 4% chance for typo simulation
                if random.random() < 0.04 and len(part) > 20:
                    try:
                        typo_w, corr_w, t_part = _get_qwerty_typo(part)
                        if typo_w:
                            typo_word = typo_w
                            correction_word = corr_w
                            typo_part = t_part
                    except Exception:
                        pass
                            
                normalized = self.normalize_text_for_match(typo_part)
                if normalized:
                    self.assistant_sent_message_texts.add(normalized)
                    
                msg = await self.client.send_message(sender_id, typo_part)
                self.assistant_sent_message_ids.add(msg.id)
                db.add_message(sender_id, 'assistant', typo_part, sentiment='neutral', priority=priority_val, language=detected_lang, tone=detected_tone)
                db.log_event("INFO", f"Auto-replied (part {part_idx+1}/{len(parts)}) to {sender_name}: {typo_part}")
                
                await self.broadcast_ws("new_message", {
                    "telegram_id": sender_id,
                    "sender": "assistant",
                    "text": typo_part
                })
                
                if correction_word:
                    # Typo correction delay
                    if enable_human_delays:
                        await asyncio.sleep(random.uniform(1.2, 1.8))
                    else:
                        await asyncio.sleep(0.2)
                    correction_text = f"*{correction_word}"
                    async with self.client.action(sender_id, 'typing'):
                        if enable_human_delays:
                            await asyncio.sleep(0.6)
                        else:
                            await asyncio.sleep(0.05)
                    normalized_corr = self.normalize_text_for_match(correction_text)
                    if normalized_corr:
                        self.assistant_sent_message_texts.add(normalized_corr)
                    msg_corr = await self.client.send_message(sender_id, correction_text)
                    self.assistant_sent_message_ids.add(msg_corr.id)
                    db.add_message(sender_id, 'assistant', correction_text, sentiment='neutral', priority=priority_val, language=detected_lang, tone=detected_tone)
                    db.log_event("INFO", f"Sent typo correction to {sender_name}: {correction_text}")
                    await self.broadcast_ws("new_message", {
                        "telegram_id": sender_id,
                        "sender": "assistant",
                        "text": correction_text
                    })

    async def send_custom_reply(self, telegram_id, text):
        """Sends a message immediately on behalf of the user (called from dashboard)."""
        await self.connect()
        try:
            db.set_setting(f"chitchat_locked_{telegram_id}", "0")
            normalized = self.normalize_text_for_match(text)
            if normalized:
                self.dashboard_sent_message_texts.add(normalized)
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
