import asyncio
import os
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import jwt
from dotenv import load_dotenv

import time

import db
from telegram_client import TelegramManager, trigger_webhook
import ai_engine

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "verlyn_manager_secret_123!@#")
tg_manager = TelegramManager()

app = FastAPI(title="Coet Personal Telegram Manager API")

# Enable CORS for frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Startup and shutdown lifecycle
@app.on_event("startup")
async def startup():
    db.init_db()
    db.log_event("INFO", "Initializing database and starting Telegram backend...")
    
    # Rebuild owner style profile if not set yet
    profile = db.get_setting("owner_style_profile")
    if not profile:
        import threading
        import ai_engine
        db.log_event("INFO", "Owner style DNA profile not found. Rebuilding on startup...")
        threading.Thread(target=ai_engine.rebuild_owner_style_profile, daemon=True).start()
    
    # Run the connection and listener registration in a background task to handle initial network drops robustly
    async def connect_and_start_bg():
        db.log_event("INFO", "Starting background Telegram client connection thread...")
        while True:
            try:
                await tg_manager.connect()
                # CRITICAL: Always register listeners regardless of userbot authorization.
                # The bot token client works independently — handlers MUST be registered
                # even when the userbot session is missing (e.g. after Render deploys wipe ephemeral fs).
                tg_manager.start_listener()
                if await tg_manager.is_authorized():
                    db.log_event("INFO", "Telegram userbot authorized. All listeners (userbot + bot) active.")
                else:
                    db.log_event("WARNING", "Telegram userbot NOT authorized (session missing). Bot token listeners are active. Login via dashboard to restore userbot.")
                break
            except Exception as e:
                import traceback
                db.log_event("ERROR", f"Error connecting to Telegram in background: {str(e)}\n{traceback.format_exc()}. Retrying in 10s...")
                await asyncio.sleep(10)

    asyncio.create_task(connect_and_start_bg())

    # Background self-healing key diagnostics
    async def auto_heal_keys_bg():
        db.log_event("INFO", "Self-healing background task for key rotation pool started.")
        while True:
            await asyncio.sleep(300)
            try:
                await asyncio.to_thread(ai_engine.run_key_diagnostics)
            except Exception as e:
                db.log_event("ERROR", f"Error in background key self-healing: {e}")
    asyncio.create_task(auto_heal_keys_bg())

# Request Models
class LoginCredentials(BaseModel):
    code: str
    password: Optional[str] = None

class ContactUpdate(BaseModel):
    category: Optional[str] = None
    notes: Optional[str] = None
    relationship_summary: Optional[str] = None
    is_muted: Optional[int] = None
    custom_prompt: Optional[str] = None
    custom_delay: Optional[int] = None

class SettingsUpdate(BaseModel):
    model_config = {"extra": "allow"}
    status: Optional[str] = None
    ai_enabled: Optional[str] = None
    approval_mode: Optional[str] = None
    idle_threshold: Optional[str] = None
    ai_personality: Optional[str] = None
    dashboard_password: Optional[str] = None
    timezone: Optional[str] = None
    owner_activity_override: Optional[str] = None
    bypass_family_friends: Optional[bool] = None
    force_draft_vips: Optional[bool] = None
    tone_profile: Optional[str] = None
    smart_hinglish: Optional[bool] = None
    auto_sleep_enabled: Optional[bool] = None
    auto_busy_enabled: Optional[bool] = None
    knowledge_base: Optional[str] = None
    blacklist_keywords: Optional[str] = None
    reply_delay_min: Optional[str] = None
    reply_delay_max: Optional[str] = None
    active_hours_start: Optional[str] = None
    active_hours_end: Optional[str] = None
    assistant_name: Optional[str] = None
    owner_style_profile: Optional[str] = None
    enable_human_delays: Optional[bool] = None
    enable_reactions: Optional[bool] = None
    enable_split_messages: Optional[bool] = None
    var_upi: Optional[str] = None
    var_website: Optional[str] = None
    custom_signature: Optional[str] = None
    active_days: Optional[str] = None
    log_level: Optional[str] = None
    gemini_model: Optional[str] = None
    gemini_temperature: Optional[str] = None
    gemini_max_tokens: Optional[str] = None
    status_desc_online: Optional[str] = None
    status_desc_busy: Optional[str] = None
    status_desc_focus: Optional[str] = None
    status_desc_sleeping: Optional[str] = None
    status_desc_travel: Optional[str] = None
    status_desc_vacation: Optional[str] = None
    status_prompt_online: Optional[str] = None
    status_prompt_busy: Optional[str] = None
    status_prompt_focus: Optional[str] = None
    status_prompt_sleeping: Optional[str] = None
    status_prompt_travel: Optional[str] = None
    status_prompt_vacation: Optional[str] = None
    session_response_limit: Optional[str] = None
    enable_group_replies: Optional[bool] = None
    antispam_message_threshold: Optional[str] = None
    enable_captcha_gate: Optional[bool] = None
    enable_scam_shield: Optional[bool] = None
    ai_swarm_mode: Optional[bool] = None
    swarm_sales_prompt: Optional[str] = None
    swarm_support_prompt: Optional[str] = None
    swarm_dispute_prompt: Optional[str] = None
    threat_level: Optional[str] = None
    max_joins_per_minute: Optional[str] = None
    auto_kick_vpn: Optional[bool] = None
    captcha_difficulty: Optional[str] = None
    retention_days_logs: Optional[str] = None
    db_check_interval_mins: Optional[str] = None
    ledger_fee_pct: Optional[str] = None

class ScheduledTaskCreate(BaseModel):
    telegram_id: Optional[int] = None
    category: Optional[str] = None
    message: str
    send_at: str

class ManualReply(BaseModel):
    telegram_id: int
    text: str

class KeywordRuleRequest(BaseModel):
    keyword: str
    response: Optional[str] = ""
    match_mode: Optional[str] = "contains"
    action_type: Optional[str] = "reply"
    action_value: Optional[str] = ""

class KeywordTestRequest(BaseModel):
    text: str
    telegram_id: Optional[int] = None

class BriefingRequest(BaseModel):
    send_telegram: Optional[bool] = False

class BroadcastRequest(BaseModel):
    category: str
    message: str

class DirectSendRequest(BaseModel):
    target_username: str
    message: str

class AuthRequest(BaseModel):

    password: str
    timezone: Optional[str] = None

class ReminderCreate(BaseModel):
    telegram_id: Optional[int] = None
    task: str
    due_time: str

class ReminderUpdate(BaseModel):
    status: str

class KeyCreateRequest(BaseModel):
    key: str
    label: Optional[str] = ""

class KeyDeleteRequest(BaseModel):
    key: str

class KeyTestSpecificRequest(BaseModel):
    key: str

class KeyToggleRequest(BaseModel):
    key: str
    enabled: bool

class KeyUpdateLimitsRequest(BaseModel):
    key: str
    rpm_limit: int
    rpd_limit: int

class KeyResetRequest(BaseModel):
    key: str

class KeyUpdateTierRequest(BaseModel):
    key: str
    tier: str

class KeyUpdateWeightRequest(BaseModel):
    key: str
    weight: int

class QARuleRequest(BaseModel):
    query: str
    response: str

# Helper: Token Validation
def verify_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")
    try:
        token = authorization.split(" ")[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

# Public Auth Route (Dashboard Login)
@app.post("/api/admin/login")
async def admin_login(payload: AuthRequest):
    stored_password = db.get_setting("dashboard_password", os.getenv("DASHBOARD_PASSWORD", "admin"))
    if payload.password == stored_password:
        if payload.timezone:
            db.set_setting("timezone", payload.timezone)
        token = jwt.encode(
            {"role": "admin", "exp": datetime.utcnow() + timedelta(days=7)},
            JWT_SECRET,
            algorithm="HS256"
        )
        return {"token": token}
    raise HTTPException(status_code=401, detail="Invalid password.")

# API Endpoints
@app.get("/api/status")
async def get_status():
    authorized = await tg_manager.is_authorized()
    status_mode = db.get_setting("status", "focus")
    ai_enabled = db.get_setting("ai_enabled", "1") == "1"
    approval_mode = db.get_setting("approval_mode", "0") == "1"
    idle_threshold = db.get_setting("idle_threshold", "300")
    
    # Calculate if owner is currently active (online)
    is_owner_online = False
    override = db.get_setting("owner_activity_override", "auto")
    if override == "online":
        is_owner_online = True
    elif override == "offline":
        is_owner_online = False
    else: # auto
        last_act = db.get_setting("last_owner_activity")
        if last_act:
            try:
                delta = time.time() - float(last_act)
                if delta < int(idle_threshold):
                    is_owner_online = True
            except ValueError:
                pass

    resolved_status = db.get_resolved_status()
    key_pool = ai_engine.get_key_pool_status()

    return {
        "telegram_connected": authorized,
        "phone": tg_manager.phone,
        "current_status": status_mode,
        "resolved_status": resolved_status,
        "owner_online": is_owner_online,
        "ai_enabled": ai_enabled,
        "approval_mode": approval_mode,
        "idle_threshold": int(idle_threshold),
        "key_pool": key_pool
    }

@app.post("/api/auth/send-code")
async def send_code():
    res = await tg_manager.send_code()
    if res["status"] == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@app.post("/api/auth/login")
async def login(creds: LoginCredentials):
    res = await tg_manager.login(creds.code, creds.password)
    if res["status"] == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res

# ─── Owner (Second) Account Auth ───────────────────────────────────────────
class OwnerSendCodeRequest(BaseModel):
    phone: str
    api_id: Optional[int] = 24804044
    api_hash: Optional[str] = "38cc69bebcb9888174f781a952cec711"

class OwnerLoginRequest(BaseModel):
    code: str
    password: Optional[str] = None

@app.post("/api/auth/owner/send-code")
async def owner_send_code(payload: OwnerSendCodeRequest, token: dict = Depends(verify_token)):
    """Send OTP to owner's personal Telegram account (Shinichiro)."""
    res = await tg_manager.owner_send_code(payload.phone, payload.api_id, payload.api_hash)
    if res["status"] == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@app.post("/api/auth/owner/login")
async def owner_login(creds: OwnerLoginRequest, token: dict = Depends(verify_token)):
    """Verify OTP and save owner session string."""
    res = await tg_manager.owner_login(creds.code, creds.password)
    if res["status"] == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@app.get("/api/auth/owner/status")
async def owner_status(token: dict = Depends(verify_token)):
    """Check if owner account is connected and authorized."""
    owner_session = db.get_setting("owner_session_string", "")
    if not owner_session:
        return {"connected": False, "username": None, "id": None}
    try:
        if tg_manager.owner_client is not None and await tg_manager.owner_client.is_user_authorized():
            me = await tg_manager.owner_client.get_me()
            return {"connected": True, "username": me.username, "id": me.id, "name": me.first_name}
        return {"connected": False, "username": None, "id": None}
    except Exception as e:
        return {"connected": False, "username": None, "id": None, "error": str(e)}

@app.post("/api/auth/owner/disconnect")
async def owner_disconnect(token: dict = Depends(verify_token)):
    """Remove owner session from database."""
    db.set_setting("owner_session_string", "")
    db.set_setting("owner_phone", "")
    if tg_manager.owner_client:
        try:
            await tg_manager.owner_client.disconnect()
        except Exception:
            pass
        tg_manager.owner_client = None
    db.log_event("INFO", "Owner (Shinichiro) account disconnected.")
    return {"status": "success"}

@app.get("/api/contacts")
async def get_contacts(token: dict = Depends(verify_token)):
    return db.get_all_contacts()

@app.put("/api/contacts/{telegram_id}")
async def update_contact_route(telegram_id: int, data: ContactUpdate, token: dict = Depends(verify_token)):
    db.update_contact(
        telegram_id,
        category=data.category,
        notes=data.notes,
        relationship_summary=data.relationship_summary,
        is_muted=data.is_muted,
        custom_prompt=data.custom_prompt,
        custom_delay=data.custom_delay
    )
    return {"status": "success"}

@app.get("/api/contacts/{telegram_id}/history")
async def get_history(telegram_id: int, token: dict = Depends(verify_token)):
    history = db.get_chat_history(telegram_id)
    draft = db.get_setting(f"draft_{telegram_id}", "")
    return {
        "history": history,
        "draft": draft
    }

@app.get("/api/settings")
async def get_settings(token: dict = Depends(verify_token)):
    res = {
        "status": db.get_setting("status"),
        "ai_enabled": db.get_setting("ai_enabled") == "1",
        "approval_mode": db.get_setting("approval_mode") == "1",
        "idle_threshold": int(db.get_setting("idle_threshold", "300")),
        "ai_personality": db.get_setting("ai_personality"),
        "assistant_name": db.get_setting("assistant_name"),
        "timezone": db.get_setting("timezone", "Asia/Kolkata"),
        "owner_activity_override": db.get_setting("owner_activity_override", "auto"),
        "bypass_family_friends": db.get_setting("bypass_family_friends", "0") == "1",
        "force_draft_vips": db.get_setting("force_draft_vips", "0") == "1",
        "tone_profile": db.get_setting("tone_profile", "concise"),
        "smart_hinglish": db.get_setting("smart_hinglish", "1") == "1",
        "auto_sleep_enabled": db.get_setting("auto_sleep_enabled", "1") == "1",
        "auto_busy_enabled": db.get_setting("auto_busy_enabled", "1") == "1",
        "knowledge_base": db.get_setting("knowledge_base", ""),
        "blacklist_keywords": db.get_setting("blacklist_keywords", ""),
        "reply_delay_min": db.get_setting("reply_delay_min", "1"),
        "reply_delay_max": db.get_setting("reply_delay_max", "4"),
        "active_hours_start": db.get_setting("active_hours_start", "9"),
        "active_hours_end": db.get_setting("active_hours_end", "23"),
        "owner_style_profile": db.get_setting("owner_style_profile", ""),
        "enable_human_delays": db.get_setting("enable_human_delays", "1") == "1",
        "enable_reactions": db.get_setting("enable_reactions", "1") == "1",
        "enable_split_messages": db.get_setting("enable_split_messages", "1") == "1",
        "var_upi": db.get_setting("var_upi", "shinichiro@upi"),
        "var_website": db.get_setting("var_website", "https://verlyn.dev"),
        "custom_signature": db.get_setting("custom_signature", ""),
        "active_days": db.get_setting("active_days", "mon,tue,wed,thu,fri,sat,sun"),
        "log_level": db.get_setting("log_level", "INFO"),
        "gemini_model": db.get_setting("gemini_model", "gemini-2.5-flash-lite"),
        "gemini_temperature": db.get_setting("gemini_temperature", "0.85"),
        "gemini_max_tokens": db.get_setting("gemini_max_tokens", "1500"),
        "key_pool_policy": db.get_setting("key_pool_policy", "priority"),
        "safety_harassment": db.get_setting("safety_harassment", "BLOCK_MEDIUM_AND_ABOVE"),
        "safety_hate_speech": db.get_setting("safety_hate_speech", "BLOCK_MEDIUM_AND_ABOVE"),
        "safety_sexually_explicit": db.get_setting("safety_sexually_explicit", "BLOCK_MEDIUM_AND_ABOVE"),
        "safety_dangerous_content": db.get_setting("safety_dangerous_content", "BLOCK_MEDIUM_AND_ABOVE"),
        "fallback_policy": db.get_setting("fallback_policy", "offline_rag"),
        "language_preference": db.get_setting("language_preference", "auto"),
        "emoji_density": db.get_setting("emoji_density", "medium"),
        "status_desc_online": db.get_setting("status_desc_online", "occupied in another chat rn"),
        "status_desc_busy": db.get_setting("status_desc_busy", "locked in a deal rn"),
        "status_desc_focus": db.get_setting("status_desc_focus", "heads down in deep work rn"),
        "status_desc_sleeping": db.get_setting("status_desc_sleeping", "asleep rn, will be back in the morning"),
        "status_desc_travel": db.get_setting("status_desc_travel", "traveling rn with limited signal"),
        "status_desc_vacation": db.get_setting("status_desc_vacation", "on vacation rn"),
        "status_prompt_online": db.get_setting("status_prompt_online", "Tell them CatVos is occupied with another chat right now but will get to them soon."),
        "status_prompt_busy": db.get_setting("status_prompt_busy", "Let them know CatVos is busy doing a deal. Ask if they can wait, or drop deal terms if it is an escrow coordination."),
        "status_prompt_focus": db.get_setting("status_prompt_focus", "Let them know CatVos is in deep work/coding. Tell them to drop details and he will review later."),
        "status_prompt_sleeping": db.get_setting("status_prompt_sleeping", "Reply by letting them know CatVos is asleep and you will forward their message. Be very brief and polite."),
        "status_prompt_travel": db.get_setting("status_prompt_travel", "Let them know CatVos is traveling and signal is weak. Tell them he will reply when he hits a city."),
        "status_prompt_vacation": db.get_setting("status_prompt_vacation", "Tell them CatVos is on vacation and will be back in a few days."),
        "session_response_limit": db.get_setting("session_response_limit", "5"),
        "enable_group_replies": db.get_setting("enable_group_replies", "0") == "1",
        "antispam_message_threshold": db.get_setting("antispam_message_threshold", "10"),
        "enable_captcha_gate": db.get_setting("enable_captcha_gate", "0") == "1",
        "enable_scam_shield": db.get_setting("enable_scam_shield", "1") == "1",
        "ai_swarm_mode": db.get_setting("ai_swarm_mode", "0") == "1",
        "swarm_sales_prompt": db.get_setting("swarm_sales_prompt", "You are the Sales Agent. Close the deal."),
        "swarm_support_prompt": db.get_setting("swarm_support_prompt", "You are the Support Agent. Resolve the client's query."),
        "swarm_dispute_prompt": db.get_setting("swarm_dispute_prompt", "You are the Dispute Agent. Help resolve the transaction issue peacefully."),
        "threat_level": db.get_setting("threat_level", "low"),
        "max_joins_per_minute": db.get_setting("max_joins_per_minute", "10"),
        "auto_kick_vpn": db.get_setting("auto_kick_vpn", "0") == "1",
        "captcha_difficulty": db.get_setting("captcha_difficulty", "easy"),
        "retention_days_logs": db.get_setting("retention_days_logs", "30"),
        "db_check_interval_mins": db.get_setting("db_check_interval_mins", "60"),
        "ledger_fee_pct": db.get_setting("ledger_fee_pct", "5.0")
    }
    
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    all_rows = cursor.fetchall()
    conn.close()
    
    for r in all_rows:
        k = r['key']
        v = r['value']
        if k not in res:
            # Smart boolean and type conversion for seeded dynamic values
            is_bool = any(x in k for x in ["enable", "required", "dedup", "exclude", "block", "track", "protect", "check", "randomize", "notify", "trigger", "vpn", "tax", "post", "shield", "strip", "only", "compliance", "alert", "anonymously"])
            if is_bool and (v == "1" or v == "0"):
                res[k] = (v == "1")
            else:
                res[k] = v
                
    return res

@app.post("/api/settings")
async def update_settings(data: SettingsUpdate, token: dict = Depends(verify_token)):
    if data.status is not None:
        db.set_setting("status", data.status)
        db.log_event("INFO", f"System status updated to: {data.status}")
    if data.ai_enabled is not None:
        db.set_setting("ai_enabled", "1" if data.ai_enabled else "0")
    if data.approval_mode is not None:
        db.set_setting("approval_mode", "1" if data.approval_mode else "0")
    if data.idle_threshold is not None:
        db.set_setting("idle_threshold", data.idle_threshold)
    if data.ai_personality is not None:
        db.set_setting("ai_personality", data.ai_personality)
    if data.dashboard_password is not None:
        db.set_setting("dashboard_password", data.dashboard_password)
    if data.timezone is not None:
        db.set_setting("timezone", data.timezone)
        db.log_event("INFO", f"System timezone updated to: {data.timezone}")
    if data.owner_activity_override is not None:
        db.set_setting("owner_activity_override", data.owner_activity_override)
        db.log_event("INFO", f"Owner activity tracker override set to: {data.owner_activity_override}")
    if data.bypass_family_friends is not None:
        db.set_setting("bypass_family_friends", "1" if data.bypass_family_friends else "0")
        db.log_event("INFO", f"System bypass family rule updated: {data.bypass_family_friends}")
    if data.force_draft_vips is not None:
        db.set_setting("force_draft_vips", "1" if data.force_draft_vips else "0")
        db.log_event("INFO", f"System force VIP draft rule updated: {data.force_draft_vips}")
    if data.tone_profile is not None:
        db.set_setting("tone_profile", data.tone_profile)
        db.log_event("INFO", f"System tone profile updated to: {data.tone_profile}")
    if data.smart_hinglish is not None:
        db.set_setting("smart_hinglish", "1" if data.smart_hinglish else "0")
        db.log_event("INFO", f"System smart Hinglish setting updated to: {data.smart_hinglish}")
    if data.auto_sleep_enabled is not None:
        db.set_setting("auto_sleep_enabled", "1" if data.auto_sleep_enabled else "0")
        db.log_event("INFO", f"System auto sleep setting updated to: {data.auto_sleep_enabled}")
    if data.auto_busy_enabled is not None:
        db.set_setting("auto_busy_enabled", "1" if data.auto_busy_enabled else "0")
        db.log_event("INFO", f"System auto busy setting updated to: {data.auto_busy_enabled}")
    if data.knowledge_base is not None:
        db.set_setting("knowledge_base", data.knowledge_base)
        db.log_event("INFO", "Business knowledge base updated.")
    if data.blacklist_keywords is not None:
        db.set_setting("blacklist_keywords", data.blacklist_keywords)
        db.log_event("INFO", f"Blacklist keywords updated.")
    if data.reply_delay_min is not None:
        db.set_setting("reply_delay_min", data.reply_delay_min)
    if data.reply_delay_max is not None:
        db.set_setting("reply_delay_max", data.reply_delay_max)
    if data.active_hours_start is not None:
        db.set_setting("active_hours_start", data.active_hours_start)
        db.log_event("INFO", f"Active hours start updated: {data.active_hours_start}")
    if data.active_hours_end is not None:
        db.set_setting("active_hours_end", data.active_hours_end)
        db.log_event("INFO", f"Active hours end updated: {data.active_hours_end}")
    if data.assistant_name is not None:
        db.set_setting("assistant_name", data.assistant_name)
        db.log_event("INFO", f"Assistant designation updated.")
    if data.owner_style_profile is not None:
        db.set_setting("owner_style_profile", data.owner_style_profile)
        db.log_event("INFO", "Owner style DNA profile updated.")
    if data.enable_human_delays is not None:
        db.set_setting("enable_human_delays", "1" if data.enable_human_delays else "0")
        db.log_event("INFO", f"System enable_human_delays setting updated to: {data.enable_human_delays}")
    if data.enable_reactions is not None:
        db.set_setting("enable_reactions", "1" if data.enable_reactions else "0")
        db.log_event("INFO", f"System enable_reactions setting updated to: {data.enable_reactions}")
    if data.enable_split_messages is not None:
        db.set_setting("enable_split_messages", "1" if data.enable_split_messages else "0")
        db.log_event("INFO", f"System enable_split_messages setting updated to: {data.enable_split_messages}")
    if data.var_upi is not None:
        db.set_setting("var_upi", data.var_upi)
        db.log_event("INFO", f"System var_upi setting updated to: {data.var_upi}")
    if data.var_website is not None:
        db.set_setting("var_website", data.var_website)
        db.log_event("INFO", f"System var_website setting updated to: {data.var_website}")
    if data.custom_signature is not None:
        db.set_setting("custom_signature", data.custom_signature)
        db.log_event("INFO", f"System custom_signature updated to: {data.custom_signature}")
    if data.active_days is not None:
        db.set_setting("active_days", data.active_days)
        db.log_event("INFO", f"System active_days updated to: {data.active_days}")
    if data.log_level is not None:
        db.set_setting("log_level", data.log_level)
        db.log_event("INFO", f"System log_level updated to: {data.log_level}")
    if data.gemini_model is not None:
        db.set_setting("gemini_model", data.gemini_model)
    if data.gemini_temperature is not None:
        db.set_setting("gemini_temperature", data.gemini_temperature)
    if data.gemini_max_tokens is not None:
        db.set_setting("gemini_max_tokens", data.gemini_max_tokens)
    if data.status_desc_online is not None:
        db.set_setting("status_desc_online", data.status_desc_online)
    if data.status_desc_busy is not None:
        db.set_setting("status_desc_busy", data.status_desc_busy)
    if data.status_desc_focus is not None:
        db.set_setting("status_desc_focus", data.status_desc_focus)
    if data.status_desc_sleeping is not None:
        db.set_setting("status_desc_sleeping", data.status_desc_sleeping)
    if data.status_desc_travel is not None:
        db.set_setting("status_desc_travel", data.status_desc_travel)
    if data.status_desc_vacation is not None:
        db.set_setting("status_desc_vacation", data.status_desc_vacation)
    if data.status_prompt_online is not None:
        db.set_setting("status_prompt_online", data.status_prompt_online)
    if data.status_prompt_busy is not None:
        db.set_setting("status_prompt_busy", data.status_prompt_busy)
    if data.status_prompt_focus is not None:
        db.set_setting("status_prompt_focus", data.status_prompt_focus)
    if data.status_prompt_sleeping is not None:
        db.set_setting("status_prompt_sleeping", data.status_prompt_sleeping)
    if data.status_prompt_travel is not None:
        db.set_setting("status_prompt_travel", data.status_prompt_travel)
    if data.status_prompt_vacation is not None:
        db.set_setting("status_prompt_vacation", data.status_prompt_vacation)
    if data.session_response_limit is not None:
        db.set_setting("session_response_limit", data.session_response_limit)
        db.log_event("INFO", f"System session_response_limit updated to: {data.session_response_limit}")
    if data.enable_group_replies is not None:
        db.set_setting("enable_group_replies", "1" if data.enable_group_replies else "0")
        db.log_event("INFO", f"System enable_group_replies updated to: {data.enable_group_replies}")
    if data.antispam_message_threshold is not None:
        db.set_setting("antispam_message_threshold", data.antispam_message_threshold)
        db.log_event("INFO", f"System antispam_message_threshold updated to: {data.antispam_message_threshold}")
    if data.enable_captcha_gate is not None:
        db.set_setting("enable_captcha_gate", "1" if data.enable_captcha_gate else "0")
        db.log_event("INFO", f"System enable_captcha_gate setting updated to: {data.enable_captcha_gate}")
    if data.enable_scam_shield is not None:
        db.set_setting("enable_scam_shield", "1" if data.enable_scam_shield else "0")
        db.log_event("INFO", f"System enable_scam_shield setting updated to: {data.enable_scam_shield}")
    if data.ai_swarm_mode is not None:
        db.set_setting("ai_swarm_mode", "1" if data.ai_swarm_mode else "0")
        db.log_event("INFO", f"System ai_swarm_mode updated to: {data.ai_swarm_mode}")
    if data.swarm_sales_prompt is not None:
        db.set_setting("swarm_sales_prompt", data.swarm_sales_prompt)
    if data.swarm_support_prompt is not None:
        db.set_setting("swarm_support_prompt", data.swarm_support_prompt)
    if data.swarm_dispute_prompt is not None:
        db.set_setting("swarm_dispute_prompt", data.swarm_dispute_prompt)
    if data.threat_level is not None:
        db.set_setting("threat_level", data.threat_level)
        db.log_event("INFO", f"System threat_level updated to: {data.threat_level}")
    if data.max_joins_per_minute is not None:
        db.set_setting("max_joins_per_minute", data.max_joins_per_minute)
    if data.auto_kick_vpn is not None:
        db.set_setting("auto_kick_vpn", "1" if data.auto_kick_vpn else "0")
    if data.captcha_difficulty is not None:
        db.set_setting("captcha_difficulty", data.captcha_difficulty)
    if data.retention_days_logs is not None:
        db.set_setting("retention_days_logs", data.retention_days_logs)
    if data.db_check_interval_mins is not None:
        db.set_setting("db_check_interval_mins", data.db_check_interval_mins)
    if data.ledger_fee_pct is not None:
        db.set_setting("ledger_fee_pct", data.ledger_fee_pct)
        
    # Dynamic settings saver for new parameters
    if data.model_extra:
        for k, v in data.model_extra.items():
            if v is not None:
                val_str = "1" if isinstance(v, bool) and v else ("0" if isinstance(v, bool) and not v else str(v))
                db.set_setting(k, val_str)
                
    return {"status": "success"}

@app.post("/api/settings/rebuild_owner_profile")
async def rebuild_owner_profile(token: dict = Depends(verify_token)):
    import ai_engine
    profile = ai_engine.rebuild_owner_style_profile()
    if profile:
        return {"status": "success", "profile": profile}
    else:
        return {"status": "error", "message": "Failed to rebuild style profile"}

@app.post("/api/admin/broadcast")
async def broadcast_messages(payload: BroadcastRequest, token: dict = Depends(verify_token)):
    # 1. Fetch target contacts
    contacts = db.get_all_contacts()
    target_category = payload.category.lower()
    
    # Filter targets
    targets = []
    for c in contacts:
        if target_category == "all" or c.get("category", "").lower() == target_category:
            # Skip muted if not personal
            if c.get("is_muted") == 1 and target_category not in ["friend", "family"]:
                continue
            targets.append(c)
            
    if not targets:
        return {"status": "success", "sent_count": 0, "message": "No contacts match target category."}
        
    # Send messages in background to avoid blocking API thread
    import asyncio
    
    # Define a background task
    async def run_broadcast(target_list, msg_template):
        sent_count = 0
        db.log_event("INFO", f"📢 Starting category broadcast to {len(target_list)} {target_category} contacts...")
        for c in target_list:
            try:
                name = c.get("first_name", "")
                text_formatted = msg_template.replace("{first_name}", name)
                
                # Send message via tg_manager
                await tg_manager.send_custom_reply(c["telegram_id"], text_formatted)
                
                # Save message
                db.add_message(c["telegram_id"], 'assistant', text_formatted, sentiment='neutral', priority='normal', language='english', tone='casual')
                db.log_event("INFO", f"📢 Broadcast successfully sent to {name} (ID: {c['telegram_id']})")
                sent_count += 1
                
                # Respect anti-spam limits
                await asyncio.sleep(2.5)
            except Exception as ex:
                db.log_event("ERROR", f"📢 Broadcast failed for ID {c.get('telegram_id')}: {ex}")
                
        db.log_event("INFO", f"📢 Category broadcast complete. Sent to {sent_count} of {len(target_list)} target contacts.")

    # Run in background via asyncio create_task
    asyncio.create_task(run_broadcast(targets, payload.message))
    return {"status": "success", "queued_count": len(targets)}

@app.post("/api/admin/send-direct-message")
async def send_direct_message(payload: DirectSendRequest, token: dict = Depends(verify_token)):
    try:
        await tg_manager.send_direct_message(payload.target_username, payload.message)
        db.log_event("INFO", f"Direct message sent successfully to {payload.target_username}")
        return {"status": "success"}
    except Exception as e:
        db.log_event("ERROR", f"Failed to send direct message to {payload.target_username}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/rules/keywords")
async def get_keywords(token: dict = Depends(verify_token)):
    return db.get_all_keyword_rules()

@app.post("/api/rules/keywords")
async def create_keyword_rule(payload: KeywordRuleRequest, token: dict = Depends(verify_token)):
    success = db.add_keyword_rule(
        keyword=payload.keyword,
        response=payload.response,
        match_mode=payload.match_mode,
        action_type=payload.action_type,
        action_value=payload.action_value
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to save keyword rule.")
    return {"status": "success"}

@app.post("/api/rules/test")
async def test_keyword_rule(payload: KeywordTestRequest, token: dict = Depends(verify_token)):
    # Test rules matching without committing database changes. 
    # Sender ID is optional and helps simulate first name templates
    matched = db.match_keyword_rule(payload.text, sender_id=payload.telegram_id)
    if matched:
        return {
            "matched": True,
            "rule": matched
        }
    return {"matched": False}

@app.post("/api/admin/check-keys")
async def check_api_keys(token: dict = Depends(verify_token)):
    """Actively ping all Gemini keys and update their health status."""
    results = await asyncio.to_thread(ai_engine.run_key_diagnostics)
    db.log_event("INFO", f"Admin ran key diagnostics: {len(results)} keys tested.")
    return {"keys": results}

@app.get("/api/admin/keys")
async def list_gemini_keys(token: dict = Depends(verify_token)):
    import json
    env_keys = []
    primary = os.getenv("GEMINI_API_KEY")
    if primary:
        env_keys.append(primary.strip())
    for idx in range(2, 11):
        key = os.getenv(f"GEMINI_API_KEY_{idx}")
        if key:
            env_keys.append(key.strip())

    db_keys_str = db.get_setting("gemini_keys", "[]")
    db_keys = []
    try:
        db_keys = json.loads(db_keys_str)
    except Exception:
        db_keys = []

    all_records = []
    def mask_key(k):
        if not k:
            return ""
        if len(k) > 12:
            return k[:6] + "..." + k[-6:]
        return k[:4] + "..."

    for idx, key in enumerate(env_keys, 1):
        health = ai_engine.get_key_health(key)
        metrics = ai_engine.get_key_metrics(key)
        all_records.append({
            "key_prefix": key[:8] + "...",
            "full_key_masked": mask_key(key),
            "label": f"Env Key #{idx}",
            "source": "env",
            "status": health["status"],
            "cooldown_remaining": max(0, int(health["until"] - time.time())) if health["until"] > 0 else 0,
            "raw_key": key,
            **metrics
        })
    for idx, item in enumerate(db_keys, 1):
        key = item.get("key", "").strip()
        label = item.get("label", f"DB Key #{idx}").strip()
        if not key:
            continue
        health = ai_engine.get_key_health(key)
        metrics = ai_engine.get_key_metrics(key)
        all_records.append({
            "key_prefix": key[:8] + "...",
            "full_key_masked": mask_key(key),
            "label": label or f"DB Key #{idx}",
            "source": "database",
            "status": health["status"],
            "cooldown_remaining": max(0, int(health["until"] - time.time())) if health["until"] > 0 else 0,
            "raw_key": key,
            **metrics
        })
    return all_records

@app.post("/api/admin/keys")
async def add_gemini_key(payload: KeyCreateRequest, token: dict = Depends(verify_token)):
    import json
    key = payload.key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Key cannot be empty.")
    
    db_keys_str = db.get_setting("gemini_keys", "[]")
    db_keys = []
    try:
        db_keys = json.loads(db_keys_str)
    except Exception:
        db_keys = []

    for item in db_keys:
        if item.get("key") == key:
            item["label"] = payload.label or item.get("label", "")
            db.set_setting("gemini_keys", json.dumps(db_keys))
            return {"status": "success", "message": "Key label updated."}
            
    db_keys.append({
        "key": key,
        "label": payload.label or f"DB Key #{len(db_keys) + 1}"
    })
    db.set_setting("gemini_keys", json.dumps(db_keys))
    db.log_event("INFO", f"New Gemini API key added to database: {payload.label}")
    return {"status": "success"}

@app.post("/api/admin/keys/delete")
async def delete_gemini_key(payload: KeyDeleteRequest, token: dict = Depends(verify_token)):
    import json
    key_to_delete = payload.key.strip()
    db_keys_str = db.get_setting("gemini_keys", "[]")
    db_keys = []
    try:
        db_keys = json.loads(db_keys_str)
    except Exception:
        db_keys = []

    original_len = len(db_keys)
    db_keys = [item for item in db_keys if item.get("key") != key_to_delete]
    
    if len(db_keys) == original_len:
        raise HTTPException(status_code=404, detail="Key not found in database settings.")
        
    db.set_setting("gemini_keys", json.dumps(db_keys))
    db.log_event("INFO", "A Gemini API key was deleted from database settings.")
    return {"status": "success"}

@app.post("/api/admin/keys/test-single")
async def test_single_key(payload: KeyTestSpecificRequest, token: dict = Depends(verify_token)):
    key = payload.key.strip()
    try:
        await asyncio.to_thread(
            ai_engine._gemini_rest_call,
            api_key=key,
            prompt="ping",
            model_name="gemini-2.5-flash-lite",
            timeout=10.0
        )
        ai_engine.set_key_health(key, "active")
        return {"status": "active", "message": "Key is active and working."}
    except Exception as e:
        err_str = str(e)
        status = ai_engine._classify_error(err_str)
        if status == "quota_exceeded":
            ai_engine.set_key_health(key, "quota_exceeded", ai_engine.COOLDOWN_QUOTA)
        elif status == "invalid":
            ai_engine.set_key_health(key, "invalid", ai_engine.COOLDOWN_INVALID)
        else:
            ai_engine.set_key_health(key, "timeout", ai_engine.COOLDOWN_TIMEOUT)
        return {"status": status, "message": err_str}

@app.post("/api/admin/keys/toggle")
async def toggle_gemini_key(payload: KeyToggleRequest, token: dict = Depends(verify_token)):
    key = payload.key.strip()
    prefix = ai_engine._key_prefix(key)
    val_str = "1" if payload.enabled else "0"
    db.set_setting(f"key_enabled_{prefix}", val_str)
    db.log_event("INFO", f"Key prefix {prefix} manual enable toggled to {payload.enabled}")
    return {"status": "success", "enabled": payload.enabled}

@app.post("/api/admin/keys/update-limits")
async def update_key_limits(payload: KeyUpdateLimitsRequest, token: dict = Depends(verify_token)):
    key = payload.key.strip()
    prefix = ai_engine._key_prefix(key)
    db.set_setting(f"key_limit_rpm_{prefix}", str(payload.rpm_limit))
    db.set_setting(f"key_limit_rpd_{prefix}", str(payload.rpd_limit))
    db.log_event("INFO", f"Updated limit for key prefix {prefix}: RPM={payload.rpm_limit}, RPD={payload.rpd_limit}")
    return {"status": "success"}

@app.post("/api/admin/keys/reset-metrics")
async def reset_key_metrics(payload: KeyResetRequest, token: dict = Depends(verify_token)):
    key = payload.key.strip()
    prefix = ai_engine._key_prefix(key)
    db.set_setting(f"key_cnt_total_{prefix}", "0")
    db.set_setting(f"key_cnt_success_{prefix}", "0")
    db.set_setting(f"key_ts_{prefix}", "[]")
    db.set_setting(f"key_tok_in_{prefix}", "0")
    db.set_setting(f"key_tok_out_{prefix}", "0")
    db.set_setting(f"key_err_quota_exceeded_{prefix}", "0")
    db.set_setting(f"key_err_invalid_{prefix}", "0")
    db.set_setting(f"key_err_timeout_{prefix}", "0")
    db.log_event("INFO", f"Reset statistics metrics for key prefix {prefix}")
    return {"status": "success"}

@app.post("/api/admin/keys/update-tier")
async def update_key_tier(payload: KeyUpdateTierRequest, token: dict = Depends(verify_token)):
    key = payload.key.strip()
    prefix = ai_engine._key_prefix(key)
    db.set_setting(f"key_tier_{prefix}", payload.tier)
    db.log_event("INFO", f"Updated tier for key prefix {prefix} to {payload.tier}")
    return {"status": "success"}

@app.post("/api/admin/keys/update-weight")
async def update_key_weight(payload: KeyUpdateWeightRequest, token: dict = Depends(verify_token)):
    key = payload.key.strip()
    prefix = ai_engine._key_prefix(key)
    db.set_setting(f"key_weight_{prefix}", str(payload.weight))
    db.log_event("INFO", f"Updated weight for key prefix {prefix} to {payload.weight}")
    return {"status": "success"}

@app.get("/api/rules/qa")
async def get_qa_rules(token: dict = Depends(verify_token)):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_backup ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/rules/qa")
async def create_qa_rule(payload: QARuleRequest, token: dict = Depends(verify_token)):
    import re
    q = payload.query.strip()
    r = payload.response.strip()
    if not q or not r:
        raise HTTPException(status_code=400, detail="Query and Response cannot be empty.")
        
    cleaned = q.lower().strip()
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    cleaned = re.sub(r'[\*\_\`\~]', '', cleaned)
    cleaned = re.sub(r'[\.\,\!\?\:\;\-\"\'\(\)\[\]\{\}]', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    conn = db.get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT OR REPLACE INTO qa_backup (cleaned_query, original_query, response) VALUES (?, ?, ?)",
                       (cleaned, q, r))
        conn.commit()
        conn.close()
        db.log_event("INFO", f"Offline Q&A Rule added/updated for: '{q}'")
        return {"status": "success"}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to save Q&A rule: {e}")

@app.delete("/api/rules/qa/{rule_id}")
async def delete_qa_rule(rule_id: int, token: dict = Depends(verify_token)):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM qa_backup WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    db.log_event("INFO", f"Deleted Offline Q&A Rule ID {rule_id}")
    return {"status": "success"}

@app.post("/api/admin/maintenance")
async def db_maintenance(token: dict = Depends(verify_token)):
    res = db.vacuum_db()
    if res:
        return {"status": "success", "message": "Database optimized successfully."}
    raise HTTPException(status_code=500, detail="Failed to run database maintenance.")


@app.post("/api/admin/briefing")
async def get_daily_briefing(payload: Optional[BriefingRequest] = None, token: dict = Depends(verify_token)):
    from datetime import datetime, timedelta
    
    conn = db.get_db_connection()
    cursor = conn.cursor()
    
    # Query last 24h messages
    yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
    cursor.execute("""
        SELECT m.sender, m.text, m.timestamp, m.telegram_id, c.first_name, c.last_name, c.username, c.category
        FROM messages m
        JOIN contacts c ON m.telegram_id = c.telegram_id
        WHERE m.timestamp > ?
        ORDER BY m.id ASC
    """, (yesterday,))
    rows = cursor.fetchall()
    conn.close()
    
    # Fallback to last 50 messages if yesterday was completely empty
    if len(rows) == 0:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.sender, m.text, m.timestamp, m.telegram_id, c.first_name, c.last_name, c.username, c.category
            FROM messages m
            JOIN contacts c ON m.telegram_id = c.telegram_id
            ORDER BY m.id DESC
            LIMIT 50
        """)
        rows = list(reversed(cursor.fetchall()))
        conn.close()
        
    chat_logs = [dict(r) for r in rows]
    
    # Generate briefing via Gemini
    briefing = await asyncio.to_thread(ai_engine.generate_daily_briefing, chat_logs)
    
    # Send via Bot if requested
    if payload and payload.send_telegram:
        date_str = briefing.get("date", datetime.utcnow().strftime("%Y-%m-%d %H:%M"))
        active_cnt = briefing.get("total_contacts_active", 0)
        
        deals = "\n".join([f"• {x}" for x in briefing.get("deal_pipeline", [])])
        urgents = "\n".join([f"• {x}" for x in briefing.get("urgent_action_items", [])])
        vibes = "\n".join([f"• {x}" for x in briefing.get("relationship_vibe_summary", [])])
        
        brief_msg = (
            f"📋 <b>CatVos Executive Daily Briefing</b>\n"
            f"<i>Compiled on: {date_str}</i>\n"
            f"Active Contacts (24h): {active_cnt}\n\n"
            f"💼 <b>Deal Pipeline:</b>\n{deals}\n\n"
            f"⚠️ <b>Urgent Action Items:</b>\n{urgents}\n\n"
            f"🎭 <b>Relationship Sentiments:</b>\n{vibes}"
        )
        tg_manager.send_bot_notification(brief_msg)
        
    return briefing


@app.post("/api/admin/force-migrate")
async def force_bigint_migration(token: dict = Depends(verify_token)):
    """Force ALTER TABLE to convert telegram_id columns from INTEGER to BIGINT.
    Uses autocommit=True to bypass Supavisor transaction mode DDL limitations.
    """
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return {"status": "skipped", "reason": "No DATABASE_URL (SQLite mode)"}

    results = {}
    migrations = [
        "ALTER TABLE messages ALTER COLUMN telegram_id TYPE BIGINT",
        "ALTER TABLE reminders ALTER COLUMN telegram_id TYPE BIGINT",
    ]

    try:
        import psycopg2
        from urllib.parse import unquote
        db_url = db_url.strip().strip("'").strip('"')
        url_str = db_url
        for prefix in ["postgresql://", "postgres://"]:
            if url_str.startswith(prefix):
                url_str = url_str[len(prefix):]
                break
        parts = url_str.rsplit("@", 1)
        user_pass = parts[0]
        host_port_db = parts[1]
        username, password = user_pass.split(":", 1) if ":" in user_pass else (user_pass, "")
        host_part, database = host_port_db.split("/", 1) if "/" in host_port_db else (host_port_db, "")
        if "?" in database:
            database = database.split("?", 1)[0]
        hostname, port = host_part.split(":", 1) if ":" in host_part else (host_part, "6543")

        # Switch to session pooler (port 5432) for DDL — transaction pooler may block it
        if hostname.endswith(".pooler.supabase.com"):
            port = "5432"

        conn = psycopg2.connect(
            host=hostname, port=int(port), database=unquote(database),
            user=unquote(username), password=unquote(password)
        )
        conn.autocommit = True  # DDL must not be wrapped in a transaction
        cursor = conn.cursor()

        for sql in migrations:
            try:
                cursor.execute(sql)
                results[sql] = "OK"
            except Exception as e:
                results[sql] = f"SKIPPED: {str(e)[:120]}"

        cursor.close()
        conn.close()
        db.log_event("INFO", f"force-migrate completed: {results}")
        return {"status": "done", "results": results}
    except Exception as e:
        db.log_event("ERROR", f"force-migrate failed: {e}")
        return {"status": "error", "detail": str(e)}


@app.delete("/api/rules/keywords/{rule_id}")
async def delete_keyword_rule_route(rule_id: int, token: dict = Depends(verify_token)):
    db.delete_keyword_rule(rule_id)
    return {"status": "success"}

@app.post("/api/contacts/{telegram_id}/clear-memory")
async def clear_contact_memory(telegram_id: int, token: dict = Depends(verify_token)):
    """Reset relationship memory and notes for a contact."""
    db.update_contact(telegram_id, relationship_summary="", notes="")
    db.log_event("INFO", f"Cleared relationship memory for contact {telegram_id}")
    return {"status": "success"}

class AITestRequest(BaseModel):
    message: str
    status_mode: Optional[str] = "busy"
    contact_name: Optional[str] = "Test User"

@app.post("/api/admin/test-ai")
async def test_ai_response(payload: AITestRequest, token: dict = Depends(verify_token)):
    """Test what Gemini would reply to a given message with current settings."""
    fake_sender = {"first_name": payload.contact_name, "last_name": "", "username": "testuser", "category": "client"}
    personality = db.get_setting("ai_personality", "")
    try:
        result = await asyncio.to_thread(
            ai_engine.generate_analysis_and_response,
            message_text=payload.message,
            sender_info=fake_sender,
            chat_history=[],
            status_mode=payload.status_mode,
            contact_notes="",
            custom_rules=personality,
            has_introduced=False,
            is_followup=False
        )
        return result
    except Exception as e:
        return {"draft_reply": f"[Error: {e}]", "sentiment": "neutral", "priority": "normal"}

@app.delete("/api/logs")
async def clear_all_logs(token: dict = Depends(verify_token)):
    """Clear all system logs."""
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM logs")
    conn.commit()
    conn.close()
    db.log_event("INFO", "System logs cleared by admin.")
    return {"status": "success"}

@app.post("/api/reply")
async def send_reply(payload: ManualReply, token: dict = Depends(verify_token)):
    res = await tg_manager.send_custom_reply(payload.telegram_id, payload.text)
    if res["status"] == "error":
        raise HTTPException(status_code=500, detail=res["message"])
    return res

@app.get("/api/logs")
async def get_logs(token: dict = Depends(verify_token)):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM logs ORDER BY id DESC LIMIT 150")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/analytics")
async def get_analytics(token: dict = Depends(verify_token)):
    conn = db.get_db_connection()
    cursor = conn.cursor()

    def _scalar(row):
        """Extract first value from either a sqlite3.Row, a dict (DictCursor), or a plain tuple."""
        if row is None:
            return 0
        if isinstance(row, dict):
            return list(row.values())[0]
        try:
            return row[0]
        except Exception:
            return 0
    
    # Message stats
    cursor.execute("SELECT COUNT(*) FROM messages")
    total_messages = _scalar(cursor.fetchone())
    
    cursor.execute("SELECT COUNT(*) FROM messages WHERE sender = 'assistant'")
    handled_by_ai = _scalar(cursor.fetchone())
    
    cursor.execute("SELECT COUNT(*) FROM messages WHERE priority = 'critical'")
    critical_alerts = _scalar(cursor.fetchone())

    # Response rate
    cursor.execute("SELECT COUNT(DISTINCT telegram_id) FROM messages WHERE sender = 'contact'")
    total_contact_chats = _scalar(cursor.fetchone())
    cursor.execute("SELECT COUNT(DISTINCT telegram_id) FROM messages WHERE sender = 'assistant'")
    replied_chats = _scalar(cursor.fetchone())
    response_rate = round((replied_chats / total_contact_chats * 100) if total_contact_chats > 0 else 0, 1)

    # Avg response time (seconds) — approximate
    # julianday() is SQLite-specific; the PostgresCursorWrapper translates this query automatically
    cursor.execute("""
        SELECT AVG(CAST(julianday(a.timestamp) * 86400 AS INTEGER) - CAST(julianday(c.timestamp) * 86400 AS INTEGER))
        FROM messages c
        JOIN messages a ON a.telegram_id = c.telegram_id AND a.sender = 'assistant' AND a.id = (
            SELECT MIN(id) FROM messages WHERE telegram_id = c.telegram_id AND sender = 'assistant' AND id > c.id
        )
        WHERE c.sender = 'contact'
    """)
    avg_rt = _scalar(cursor.fetchone())
    avg_response_time = round(float(avg_rt), 1) if avg_rt else 0
    
    # Categories count
    cursor.execute("SELECT category, COUNT(*) FROM contacts GROUP BY category")
    categories_raw = cursor.fetchall()
    categories = {}
    for r in categories_raw:
        if isinstance(r, dict):
            vals = list(r.values())
            cat, cnt = vals[0], vals[1]
        else:
            cat, cnt = r[0], r[1]
        if cat:
            categories[cat] = cnt
    
    # Sentiments
    cursor.execute("SELECT sentiment, COUNT(*) FROM messages WHERE sender = 'contact' GROUP BY sentiment")
    sentiments_raw = cursor.fetchall()
    sentiments = {}
    for r in sentiments_raw:
        if isinstance(r, dict):
            vals = list(r.values())
            sent, cnt = vals[0], vals[1]
        else:
            sent, cnt = r[0], r[1]
        if sent:
            sentiments[sent] = cnt
    
    # Daily counts (last 7 days)
    cursor.execute("""
        SELECT date(timestamp), COUNT(*) 
        FROM messages 
        GROUP BY date(timestamp) 
        ORDER BY date(timestamp) DESC 
        LIMIT 7
    """)
    daily_raw = cursor.fetchall()
    daily_history = []
    for r in daily_raw:
        if isinstance(r, dict):
            vals = list(r.values())
            daily_history.append({"date": str(vals[0]), "count": vals[1]})
        else:
            daily_history.append({"date": r[0], "count": r[1]})
    
    conn.close()
    
    return {
        "total_messages": total_messages,
        "handled_by_ai": handled_by_ai,
        "critical_alerts": critical_alerts,
        "response_rate": response_rate,
        "avg_response_time": avg_response_time,
        "categories": categories,
        "sentiments": sentiments,
        "daily_history": daily_history
    }

@app.get("/api/reminders")
async def get_reminders(token: dict = Depends(verify_token)):
    return db.get_all_reminders()

@app.post("/api/reminders")
async def create_reminder(payload: ReminderCreate, token: dict = Depends(verify_token)):
    db.add_reminder(payload.telegram_id, payload.task, payload.due_time)
    
    # Broadcast to WebSocket client to reload agenda in real-time
    await tg_manager.broadcast_ws("new_reminder", {
        "telegram_id": payload.telegram_id,
        "task": payload.task,
        "due_time": payload.due_time
    })
    return {"status": "success"}

@app.put("/api/reminders/{reminder_id}")
async def update_reminder(reminder_id: int, payload: ReminderUpdate, token: dict = Depends(verify_token)):
    db.update_reminder_status(reminder_id, payload.status)
    return {"status": "success"}

# WebSockets endpoint for live dashboard streaming
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    tg_manager.websocket_clients.add(websocket)
    try:
        while True:
            # Just keep connection alive, we broadcast asynchronously from the client
            await websocket.receive_text()
    except WebSocketDisconnect:
        tg_manager.websocket_clients.discard(websocket)
    except Exception:
        tg_manager.websocket_clients.discard(websocket)

@app.get("/api/debug-userbot")
async def debug_userbot():
    try:
        if tg_manager.client is None:
            return {"status": "client_is_none"}
        connected = tg_manager.client.is_connected()
        authorized = await tg_manager.client.is_user_authorized() if connected else False
        me = None
        if authorized:
            me_obj = await tg_manager.client.get_me()
            if me_obj:
                me = {"id": me_obj.id, "first_name": me_obj.first_name, "username": me_obj.username, "phone": me_obj.phone}
        
        bot_connected = tg_manager.bot_client.is_connected() if tg_manager.bot_client else False
        
        return {
            "status": "success",
            "connected": connected,
            "authorized": authorized,
            "me_id": tg_manager.me_id,
            "me": me,
            "bot_connected": bot_connected,
            "is_running": tg_manager.is_running
        }
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}

# --- SCHEDULER ENDPOINTS ---

@app.get("/api/scheduler/tasks")
async def get_scheduled_tasks(token: dict = Depends(verify_token)):
    return db.get_all_scheduled_tasks()

@app.post("/api/scheduler/tasks")
async def create_scheduled_task(payload: ScheduledTaskCreate, token: dict = Depends(verify_token)):
    try:
        # Validate timestamp format (e.g. 2026-06-03T18:00:00Z)
        clean_ts = payload.send_at.replace("Z", "")
        if "." in clean_ts:
            clean_ts = clean_ts.split(".")[0]
        datetime.fromisoformat(clean_ts)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ISO timestamp format. Use e.g. YYYY-MM-DDTHH:MM:SSZ")
        
    db.add_scheduled_task(
        telegram_id=payload.telegram_id,
        category=payload.category,
        message=payload.message,
        send_at=payload.send_at
    )
    db.log_event("INFO", f"📅 Scheduled new broadcast task to category '{payload.category}' or user ID {payload.telegram_id} at {payload.send_at}")
    return {"status": "success"}

@app.delete("/api/scheduler/tasks/{task_id}")
async def delete_scheduled_task(task_id: int, token: dict = Depends(verify_token)):
    db.delete_scheduled_task(task_id)
    db.log_event("INFO", f"📅 Deleted/canceled scheduled task ID {task_id}")
    return {"status": "success"}

# --- SYSTEM HEALTH & Q&A BACKUP ENDPOINTS ---

@app.get("/api/admin/qa/export")
async def export_qa_backup(token: dict = Depends(verify_token)):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT original_query, response FROM qa_backup")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/admin/qa/import")
async def import_qa_backup(payload: list, token: dict = Depends(verify_token)):
    conn = db.get_db_connection()
    cursor = conn.cursor()
    imported_count = 0
    for item in payload:
        q = item.get("original_query", "").strip()
        r = item.get("response", "").strip()
        if q and r:
            # Clean trigger phrase
            import re
            cleaned = q.lower().strip()
            cleaned = re.sub(r'[^\w\s]', '', cleaned)
            cleaned = re.sub(r'\s+', ' ', cleaned)
            
            cursor.execute("""
                INSERT INTO qa_backup (cleaned_query, original_query, response)
                VALUES (?, ?, ?)
                ON CONFLICT(cleaned_query) DO UPDATE SET response = EXCLUDED.response
            """, (cleaned, q, r))
            imported_count += 1
            
    conn.commit()
    conn.close()
    db.log_event("INFO", f"🧠 Imported/Synchronized {imported_count} offline Q&A fallback rules.")
    return {"status": "success", "imported": imported_count}

@app.post("/api/admin/system/clear_logs")
async def clear_logs(token: dict = Depends(verify_token)):
    db.clear_all_event_logs()
    db.log_event("INFO", "🧹 Database event logs cleared successfully by administrator.")
    return {"status": "success"}

@app.get("/api/admin/system/telemetry")
async def get_system_telemetry(token: dict = Depends(verify_token)):
    # 1. Database file size
    db_size_kb = 0
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        if os.path.exists(db.DB_FILE):
            db_size_kb = int(os.path.getsize(db.DB_FILE) / 1024)
    else:
        db_size_kb = -1 # Remote database
        
    # 2. Get totals
    conn = db.get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM contacts")
    contacts_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM keyword_rules")
    keyword_rules_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM logs")
    logs_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM messages")
    messages_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM messages WHERE sender = 'assistant'")
    ai_messages_count = cursor.fetchone()[0]
    
    conn.close()
    
    connected = False
    bot_connected = False
    try:
        connected = tg_manager.client.is_connected() if tg_manager.client else False
        bot_connected = tg_manager.bot_client.is_connected() if tg_manager.bot_client else False
    except Exception:
        pass
        
    return {
        "db_size_kb": db_size_kb,
        "is_postgres": db_url is not None,
        "contacts_count": contacts_count,
        "keyword_rules_count": keyword_rules_count,
        "logs_count": logs_count,
        "messages_count": messages_count,
        "ai_messages_count": ai_messages_count,
        "client_connected": connected,
        "bot_connected": bot_connected,
        "is_running": tg_manager.is_running
    }


# ============================================================
# === NEW ENDPOINTS — Broadcast History & Templates
# ============================================================

class TemplateCreate(BaseModel):
    name: str
    content: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class TagsUpdate(BaseModel):
    tags: List[str]

class SystemRestore(BaseModel):
    settings: dict

@app.get("/api/admin/broadcast/history")
async def get_broadcast_history_endpoint(token: dict = Depends(verify_token)):
    return db.get_broadcast_history(limit=100)

@app.get("/api/admin/broadcast/templates")
async def get_templates(token: dict = Depends(verify_token)):
    return db.get_message_templates()

@app.post("/api/admin/broadcast/templates")
async def save_template(req: TemplateCreate, token: dict = Depends(verify_token)):
    db.save_message_template(req.name, req.content)
    return {"status": "saved"}

@app.delete("/api/admin/broadcast/templates/{template_id}")
async def delete_template(template_id: int, token: dict = Depends(verify_token)):
    db.delete_message_template(template_id)
    return {"status": "deleted"}

# ============================================================
# === Contact Search & Tags
# ============================================================

@app.get("/api/contacts/search")
async def search_contacts(q: str = "", token: dict = Depends(verify_token)):
    all_contacts = db.get_all_contacts()
    q_lower = q.lower()
    if not q_lower:
        return all_contacts
    results = [
        c for c in all_contacts
        if q_lower in (c.get("first_name") or "").lower()
        or q_lower in (c.get("last_name") or "").lower()
        or q_lower in (c.get("username") or "").lower()
        or q_lower in str(c.get("telegram_id", ""))
    ]
    return results

@app.get("/api/contacts/{telegram_id}/tags")
async def get_tags(telegram_id: int, token: dict = Depends(verify_token)):
    return {"tags": db.get_contact_tags(telegram_id)}

@app.put("/api/contacts/{telegram_id}/tags")
async def update_tags(telegram_id: int, req: TagsUpdate, token: dict = Depends(verify_token)):
    db.set_contact_tags(telegram_id, req.tags)
    return {"status": "updated"}

# ============================================================
# === System Backup / Restore / Health
# ============================================================

@app.get("/api/admin/system/backup")
async def export_system_backup(token: dict = Depends(verify_token)):
    """Export all settings + Q&A rules + keyword rules as JSON backup."""
    import json
    settings = db.get_all_settings_dict()
    qa_rules = db.get_qa_backup_rules()
    kw_rules = db.get_keyword_rules()
    templates = db.get_message_templates()
    backup = {
        "version": "coet_backup_v1",
        "exported_at": datetime.utcnow().isoformat(),
        "settings": settings,
        "qa_rules": qa_rules,
        "keyword_rules": kw_rules,
        "templates": templates
    }
    from fastapi.responses import JSONResponse
    return JSONResponse(content=backup, headers={
        "Content-Disposition": f"attachment; filename=coet_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    })

@app.post("/api/admin/system/restore")
async def restore_system_backup(req: SystemRestore, token: dict = Depends(verify_token)):
    """Restore settings from a backup dict."""
    db.restore_settings_from_dict(req.settings)
    db.log_event("INFO", "🔁 System settings restored from backup.")
    return {"status": "restored", "keys_restored": len(req.settings)}

@app.get("/api/admin/system/health")
async def system_health_check(token: dict = Depends(verify_token)):
    """Return health status of all subsystems."""
    import time as time_module
    results = {}
    
    # DB health
    t0 = time_module.time()
    try:
        counts = db.get_table_row_counts()
        results["database"] = {"status": "ok", "latency_ms": round((time_module.time() - t0) * 1000, 1), "tables": counts}
    except Exception as e:
        results["database"] = {"status": "error", "error": str(e)}
    
    # Telegram client health
    try:
        client_ok = tg_manager.client.is_connected() if tg_manager.client else False
        bot_ok = tg_manager.bot_client.is_connected() if tg_manager.bot_client else False
        results["telegram_userbot"] = {"status": "ok" if client_ok else "disconnected"}
        results["telegram_bot"] = {"status": "ok" if bot_ok else "disconnected"}
    except Exception as e:
        results["telegram_userbot"] = {"status": "error", "error": str(e)}
        results["telegram_bot"] = {"status": "error", "error": str(e)}
    
    # AI engine health
    try:
        ai_key = os.getenv("GEMINI_API_KEY", "")
        results["ai_engine"] = {"status": "ok" if ai_key else "no_key", "model": db.get_setting("gemini_model") or "gemini-1.5-flash"}
    except Exception as e:
        results["ai_engine"] = {"status": "error", "error": str(e)}
    
    # Settings health
    try:
        ai_enabled = db.get_setting("ai_enabled")
        results["automation"] = {"status": "active" if ai_enabled == "1" else "paused", "ai_enabled": ai_enabled == "1"}
    except Exception as e:
        results["automation"] = {"status": "error"}
    
    return results

@app.get("/api/admin/system/db-counts")
async def get_db_counts(token: dict = Depends(verify_token)):
    return db.get_table_row_counts()

# ============================================================
# === Security & Access
# ============================================================

@app.get("/api/admin/security/sessions")
async def get_session_logs(token: dict = Depends(verify_token)):
    return db.get_recent_login_events(limit=20)

@app.post("/api/admin/security/change-password")
async def change_dashboard_password(req: PasswordChange, token: dict = Depends(verify_token)):
    current = db.get_setting("dashboard_password")
    if req.current_password != current:
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters.")
    db.set_setting("dashboard_password", req.new_password)
    db.log_event("INFO", "🔐 Dashboard password changed by administrator.")
    return {"status": "changed"}

@app.get("/api/admin/security/token-info")
async def get_token_info(token: dict = Depends(verify_token)):
    return {
        "issued_at": token.get("iat"),
        "expires_at": token.get("exp"),
        "timezone": token.get("timezone", "unknown"),
        "subject": token.get("sub", "admin")
    }

# ============================================================
# === New Features: Custom Commands, Payment Hub, Deals, Licenses
# ============================================================
import random
import string
import shutil
from fastapi import UploadFile, File

class CustomCommandPayload(BaseModel):
    trigger_name: str
    description: str
    response_template: str
    variables: str # JSON string

class PaymentMethodPayload(BaseModel):
    type: str
    label: str
    value: str
    network: Optional[str] = ""
    qr_image_path: Optional[str] = ""
    command_trigger: str
    enabled: Optional[int] = 1

class DealCreatePayload(BaseModel):
    contact_id: int
    contact_name: str
    items: str
    amount: float
    currency: Optional[str] = "USD"

class DealClosePayload(BaseModel):
    summary: str
    thank_you_message: str

class LicenseCreatePayload(BaseModel):
    client_telegram_id: int
    client_name: str
    store_name: str
    duration_days: int

class LicenseStatusPayload(BaseModel):
    status: str

# Custom Commands Routes
@app.get("/api/admin/custom-commands")
async def api_get_custom_commands(token: dict = Depends(verify_token)):
    return db.get_all_custom_commands()

@app.post("/api/admin/custom-commands")
async def api_save_custom_command(payload: CustomCommandPayload, token: dict = Depends(verify_token)):
    res = db.save_custom_command(
        payload.trigger_name,
        payload.description,
        payload.response_template,
        payload.variables
    )
    if not res:
        raise HTTPException(status_code=500, detail="Failed to save custom command.")
    db.log_event("INFO", f"Saved custom command: {payload.trigger_name}")
    return {"status": "success"}

@app.delete("/api/admin/custom-commands/{cmd_id}")
async def api_delete_custom_command(cmd_id: int, token: dict = Depends(verify_token)):
    res = db.delete_custom_command(cmd_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete custom command.")
    return {"status": "success"}

# Payment Methods Routes
@app.get("/api/admin/payment-methods")
async def api_get_payment_methods(token: dict = Depends(verify_token)):
    return db.get_all_payment_methods()

@app.post("/api/admin/payment-methods")
async def api_save_payment_method(payload: PaymentMethodPayload, token: dict = Depends(verify_token)):
    res = db.save_payment_method(
        payload.type,
        payload.label,
        payload.value,
        payload.network,
        payload.qr_image_path,
        payload.command_trigger,
        payload.enabled
    )
    if not res:
        raise HTTPException(status_code=500, detail="Failed to save payment method.")
    db.log_event("INFO", f"Saved payment method: {payload.label} ({payload.command_trigger})")
    return {"status": "success"}

@app.delete("/api/admin/payment-methods/{pm_id}")
async def api_delete_payment_method(pm_id: int, token: dict = Depends(verify_token)):
    res = db.delete_payment_method(pm_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete payment method.")
    return {"status": "success"}

@app.post("/api/admin/payment-methods/upload-qr")
async def api_upload_payment_qr(file: UploadFile = File(...), token: dict = Depends(verify_token)):
    os.makedirs("uploads", exist_ok=True)
    file_extension = os.path.splitext(file.filename)[1]
    if file_extension.lower() not in [".png", ".jpg", ".jpeg"]:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, or JPEG images are allowed.")
    
    file_name = f"qr_{int(time.time())}{file_extension}"
    file_path = os.path.join("uploads", file_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Return file path relative to host
    return {"qr_image_path": file_path}

# Deal Orders Routes
@app.get("/api/admin/deals")
async def api_get_deals(token: dict = Depends(verify_token)):
    return db.get_all_deal_orders()

@app.post("/api/admin/deals")
async def api_create_deal(payload: DealCreatePayload, token: dict = Depends(verify_token)):
    chars = string.ascii_uppercase + string.digits
    rand_part = "".join(random.choice(chars) for _ in range(21))
    order_id = f"SHI{rand_part}"
    
    res = db.create_deal_order(
        order_id,
        payload.contact_id,
        payload.contact_name,
        payload.items,
        payload.amount,
        payload.currency
    )
    if not res:
        raise HTTPException(status_code=500, detail="Failed to create deal order.")
    db.log_event("INFO", f"Created deal order: {order_id}")
    return {"status": "success", "order_id": order_id}

@app.post("/api/admin/deals/{order_id}/generate-summary")
async def api_generate_deal_summary(order_id: str, token: dict = Depends(verify_token)):
    order = db.get_deal_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    history = db.get_chat_history(order["contact_id"], limit=100)
    chat_lines = []
    for msg in history:
        sender_name = "Customer" if msg["sender"] == "contact" else "Assistant"
        chat_lines.append(f"{sender_name}: {msg['text']}")
    chat_history_text = "\n".join(chat_lines)
    
    prompt = f"""
You are the AI manager for Team Shinken.
Analyze the following chat history with a customer and write a summary of the deal and the client request.
Also, extract the Alt Number (phone number or account details purchased) from the chat if present.
Then, generate a professional thank-you message exactly following this template:

Hello there,

Thank you for your purchase! We noticed that you recently purchased an alt from our store, and we truly appreciate your support.

We hope you're satisfied with your purchase. If you ever need any additional services in the future, feel free to contact us anytime—we'll be happy to help.

Order Details:

Alt Number: [EXTRACTED ALT NUMBER OR DETAILS, E.G. +58 4265769872, or fallback to the items list '{order['items']}']
Order ID: {order_id}

Thank you once again for choosing Shinken.

Have a wonderful day ahead

— Team Shinken

Here is the chat history:
{chat_history_text}

Provide your response in JSON format (ensure it is valid JSON, no markdown codeblock wrappers, just raw JSON):
{{
  "summary": "Short 2-3 sentence summary of the conversation and transaction",
  "alt_number": "The alt number/details extracted from chat, or a polite placeholder if not found",
  "thank_you_message": "The complete formatted thank you message as per template"
}}
"""
    try:
        import ai_engine
        ai_resp = ai_engine.generate_content_with_retry(prompt)
        
        if ai_resp.startswith("```json"):
            ai_resp = ai_resp.replace("```json", "", 1)
        if ai_resp.endswith("```"):
            ai_resp = ai_resp.rsplit("```", 1)[0]
        ai_resp = ai_resp.strip()
        
        import json
        data = json.loads(ai_resp)
        return data
    except Exception as e:
        fallback_msg = f"""Hello there,

Thank you for your purchase! We noticed that you recently purchased an alt from our store, and we truly appreciate your support.

We hope you're satisfied with your purchase. If you ever need any additional services in the future, feel free to contact us anytime—we'll be happy to help.

Order Details:

Alt Number: {order['items']}
Order ID: {order_id}

Thank you once again for choosing Shinken.

Have a wonderful day ahead

— Team Shinken"""
        return {
            "summary": f"Deal order {order_id} closed. (AI Summary failed: {str(e)})",
            "alt_number": order['items'],
            "thank_you_message": fallback_msg
        }

@app.post("/api/admin/deals/{order_id}/close")
async def api_close_deal(order_id: str, payload: DealClosePayload, token: dict = Depends(verify_token)):
    res = db.close_deal_order(order_id, payload.summary, payload.thank_you_message)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to close deal order.")
    db.log_event("INFO", f"Closed deal order: {order_id}")
    try:
        order = db.get_deal_order(order_id)
        if order:
            await trigger_webhook("on_deal_closed", {
                "order_id": order_id,
                "contact_id": order.get("contact_id"),
                "contact_name": order.get("contact_name"),
                "items": order.get("items"),
                "amount": order.get("amount"),
                "currency": order.get("currency"),
                "summary": payload.summary,
                "closed_at": datetime.utcnow().isoformat()
            })
    except Exception as e:
        db.log_event("WARNING", f"Failed to dispatch deal closed webhook: {e}")
    return {"status": "success"}

@app.post("/api/admin/deals/{order_id}/send-thanks")
async def api_send_deal_thanks(order_id: str, token: dict = Depends(verify_token)):
    order = db.get_deal_order(order_id)
    if not order or not order.get("thank_you_message"):
        raise HTTPException(status_code=400, detail="Order has no generated thank-you message.")
    
    res = await tg_manager.send_custom_reply(order["contact_id"], order["thank_you_message"])
    if res["status"] == "error":
        raise HTTPException(status_code=500, detail=res["message"])
    db.log_event("INFO", f"Sent thank-you message to contact {order['contact_id']} for order {order_id}")
    return {"status": "success"}

# Customer Licenses Routes
@app.get("/api/admin/licenses")
async def api_get_licenses(token: dict = Depends(verify_token)):
    licenses = db.get_all_customer_licenses()
    enriched = []
    for lic in licenses:
        client_id = lic["client_telegram_id"]
        products = db.get_client_products(client_id)
        orders = db.get_client_orders(client_id)
        enriched.append({
            **lic,
            "products_count": len(products),
            "orders_count": len(orders),
            "products": products,
            "orders": orders
        })
    return enriched

@app.post("/api/admin/licenses")
async def api_create_license(payload: LicenseCreatePayload, token: dict = Depends(verify_token)):
    chars = string.ascii_uppercase + string.digits
    rand_part = "".join(random.choice(chars) for _ in range(16))
    license_key = f"COET_KEY_{rand_part}"
    
    from datetime import datetime, timedelta
    expiry = (datetime.utcnow() + timedelta(days=payload.duration_days)).isoformat()
    
    res = db.create_customer_license(
        license_key,
        payload.client_telegram_id,
        payload.client_name,
        payload.store_name,
        expiry
    )
    if not res:
        raise HTTPException(status_code=500, detail="Failed to generate customer license key.")
    
    db.log_event("INFO", f"Generated customer license for client {payload.client_name} (Expires: {expiry})")
    return {"status": "success", "license_key": license_key}

@app.put("/api/admin/licenses/{license_id}/status")
async def api_update_license_status(license_id: int, payload: LicenseStatusPayload, token: dict = Depends(verify_token)):
    res = db.update_customer_license_status(license_id, payload.status)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to update license status.")
    db.log_event("WARNING", f"Updated license ID {license_id} status to {payload.status}")
    return {"status": "success"}

@app.delete("/api/admin/licenses/{license_id}")
async def api_delete_license(license_id: int, token: dict = Depends(verify_token)):
    res = db.delete_customer_license(license_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete license.")
    return {"status": "success"}

# Payloads
class GCJoinPayload(BaseModel):
    link: str

class GCWhitelistPayload(BaseModel):
    whitelisted: int

class ForwardingRulePayload(BaseModel):
    source_chat_id: int
    target_chat_id: int
    keywords: str
    enabled: Optional[int] = 1

class ProxyPayload(BaseModel):
    type: str
    addr: str
    port: int
    username: Optional[str] = ""
    password: Optional[str] = ""

# GC Manager Routes
@app.get("/api/admin/gc/chats")
async def api_get_joined_chats(token: dict = Depends(verify_token)):
    return db.get_all_joined_chats()

@app.post("/api/admin/gc/join")
async def api_join_chat(payload: GCJoinPayload, token: dict = Depends(verify_token)):
    link = payload.link.strip()
    if not link:
        raise HTTPException(status_code=400, detail="Invite link or handle is required.")
    
    res = await tg_manager.join_group_or_channel(link)
    if res["status"] == "error":
        raise HTTPException(status_code=500, detail=res["message"])
    
    db.save_joined_chat(res["chat_id"], res["title"], res["username"], res["type"])
    db.log_event("INFO", f"Successfully joined chat {res['title']} ({res['chat_id']})")
    return {"status": "success", "chat_id": res["chat_id"], "title": res["title"]}

@app.put("/api/admin/gc/chats/{chat_id}/whitelist")
async def api_whitelist_chat(chat_id: int, payload: GCWhitelistPayload, token: dict = Depends(verify_token)):
    res = db.toggle_chat_whitelist(chat_id, payload.whitelisted)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to toggle whitelist.")
    db.log_event("INFO", f"Toggled whitelist for chat ID {chat_id} to {payload.whitelisted}")
    return {"status": "success"}

@app.delete("/api/admin/gc/chats/{chat_id}")
async def api_delete_chat(chat_id: int, token: dict = Depends(verify_token)):
    res = db.delete_joined_chat(chat_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete chat.")
    return {"status": "success"}

# Forwarding Rules Routes
@app.get("/api/admin/sync/rules")
async def api_get_forwarding_rules(token: dict = Depends(verify_token)):
    return db.get_all_forwarding_rules()

@app.post("/api/admin/sync/rules")
async def api_save_forwarding_rule(payload: ForwardingRulePayload, token: dict = Depends(verify_token)):
    res = db.save_forwarding_rule(
        payload.source_chat_id,
        payload.target_chat_id,
        payload.keywords,
        payload.enabled
    )
    if not res:
        raise HTTPException(status_code=500, detail="Failed to save forwarding rule.")
    db.log_event("INFO", f"Saved forwarding rule from {payload.source_chat_id} to {payload.target_chat_id}")
    return {"status": "success"}

@app.delete("/api/admin/sync/rules/{rule_id}")
async def api_delete_forwarding_rule(rule_id: int, token: dict = Depends(verify_token)):
    res = db.delete_forwarding_rule(rule_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete forwarding rule.")
    return {"status": "success"}

# Proxy Routes
@app.get("/api/admin/proxies")
async def api_get_proxies(token: dict = Depends(verify_token)):
    return db.get_all_proxies()

@app.post("/api/admin/proxies")
async def api_save_proxy(payload: ProxyPayload, token: dict = Depends(verify_token)):
    res = db.save_proxy(
        payload.type,
        payload.addr,
        payload.port,
        payload.username,
        payload.password
    )
    if not res:
        raise HTTPException(status_code=500, detail="Failed to save proxy.")
    db.log_event("INFO", f"Saved proxy: {payload.type}://{payload.addr}:{payload.port}")
    return {"status": "success"}

@app.post("/api/admin/proxies/test")
async def api_test_proxy(payload: dict, token: dict = Depends(verify_token)):
    proxy_id = payload.get("proxy_id")
    if not proxy_id:
        raise HTTPException(status_code=400, detail="Proxy ID is required.")
    
    res = await tg_manager.test_proxy_connection(proxy_id)
    return res

@app.delete("/api/admin/proxies/{proxy_id}")
async def api_delete_proxy(proxy_id: int, token: dict = Depends(verify_token)):
    res = db.delete_proxy(proxy_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete proxy.")
    return {"status": "success"}

# Storefront & Multi-Tenant Dashboard Analytics
@app.get("/api/admin/storefront/analytics")
async def api_get_storefront_analytics(token: dict = Depends(verify_token)):
    licenses = db.get_all_customer_licenses()
    total_stores = len(licenses)
    active_stores = len([l for l in licenses if l["status"] == "active"])
    
    conn = db.get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM client_products")
    total_products = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM client_orders")
    total_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT SUM(amount) FROM client_orders WHERE status = 'completed'")
    completed_row = cursor.fetchone()
    total_revenue = completed_row[0] if completed_row and completed_row[0] is not None else 0.0
    
    cursor.execute("SELECT status, COUNT(*) FROM client_orders GROUP BY status")
    order_status_rows = cursor.fetchall()
    order_statuses = {row[0]: row[1] for row in order_status_rows}
    
    conn.close()
    
    return {
        "total_stores": total_stores,
        "active_stores": active_stores,
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "order_statuses": order_statuses
    }

class WebhookPayload(BaseModel):
    url: str
    secret_token: Optional[str] = ""
    events: str

class QueryPayload(BaseModel):
    query: str

# Webhooks REST API
@app.get("/api/admin/webhooks")
async def api_get_webhooks(token: dict = Depends(verify_token)):
    return db.get_all_webhooks()

@app.post("/api/admin/webhooks")
async def api_save_webhook(payload: WebhookPayload, token: dict = Depends(verify_token)):
    res = db.save_webhook(payload.url, payload.secret_token, payload.events)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to save webhook.")
    db.log_event("INFO", f"Registered new webhook subscriber to {payload.url}")
    return {"status": "success"}

@app.delete("/api/admin/webhooks/{webhook_id}")
async def api_delete_webhook(webhook_id: int, token: dict = Depends(verify_token)):
    res = db.delete_webhook(webhook_id)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to delete webhook.")
    return {"status": "success"}

# Threat Radar REST API
@app.get("/api/admin/threats")
async def api_get_threats(token: dict = Depends(verify_token)):
    return db.get_all_threats()

@app.delete("/api/admin/threats")
async def api_clear_threats(token: dict = Depends(verify_token)):
    res = db.clear_threats()
    if not res:
        raise HTTPException(status_code=500, detail="Failed to clear threats.")
    return {"status": "success"}

# DB Query Sandbox REST API
@app.post("/api/admin/system/query")
async def api_run_system_query(payload: QueryPayload, token: dict = Depends(verify_token)):
    q = payload.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    q_lower = q.lower()
    # Block writing operations
    if any(x in q_lower for x in ["insert", "update", "delete", "drop", "alter", "create", "replace", "pragma"]):
        raise HTTPException(status_code=400, detail="Only read-only SELECT queries are permitted in sandbox mode.")
        
    try:
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(q)
        rows = cursor.fetchall()
        conn.close()
        return {"status": "success", "rows": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database execution error: {str(e)}")
