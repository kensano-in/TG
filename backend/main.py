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
from telegram_client import TelegramManager
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
    
    # Run the connection and listener registration in a background task to handle initial network drops robustly
    async def connect_and_start_bg():
        db.log_event("INFO", "Starting background Telegram client connection thread...")
        while True:
            try:
                await tg_manager.connect()
                if await tg_manager.is_authorized():
                    tg_manager.start_listener()
                    db.log_event("INFO", "Telegram client authorized. Listeners active.")
                    break
                else:
                    db.log_event("WARNING", "Telegram client NOT authorized. Login required on dashboard.")
                    break
            except Exception as e:
                import traceback
                db.log_event("ERROR", f"Error connecting to Telegram in background: {str(e)}\n{traceback.format_exc()}. Retrying in 10s...")
                await asyncio.sleep(10)

    asyncio.create_task(connect_and_start_bg())

# Request Models
class LoginCredentials(BaseModel):
    code: str
    password: Optional[str] = None

class ContactUpdate(BaseModel):
    category: Optional[str] = None
    notes: Optional[str] = None
    relationship_summary: Optional[str] = None
    is_muted: Optional[int] = None

class SettingsUpdate(BaseModel):
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

class AuthRequest(BaseModel):
    password: str
    timezone: Optional[str] = None

class ReminderCreate(BaseModel):
    telegram_id: Optional[int] = None
    task: str
    due_time: str

class ReminderUpdate(BaseModel):
    status: str

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
        is_muted=data.is_muted
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
    return {
        "status": db.get_setting("status"),
        "ai_enabled": db.get_setting("ai_enabled") == "1",
        "approval_mode": db.get_setting("approval_mode") == "1",
        "idle_threshold": int(db.get_setting("idle_threshold", "300")),
        "ai_personality": db.get_setting("ai_personality"),
        "assistant_name": db.get_setting("assistant_name"),
        "timezone": db.get_setting("timezone", "Asia/Kolkata"),
        "owner_activity_override": db.get_setting("owner_activity_override", "auto"),
        "bypass_family_friends": db.get_setting("bypass_family_friends", "0") == "1",
        "force_draft_vips": db.get_setting("force_draft_vips", "1") == "1",
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
    }

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
        
    return {"status": "success"}

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
    
    # Message stats
    cursor.execute("SELECT COUNT(*) FROM messages")
    total_messages = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM messages WHERE sender = 'assistant'")
    handled_by_ai = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM messages WHERE priority = 'critical'")
    critical_alerts = cursor.fetchone()[0]

    # Response rate
    cursor.execute("SELECT COUNT(DISTINCT telegram_id) FROM messages WHERE sender = 'contact'")
    total_contact_chats = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(DISTINCT telegram_id) FROM messages WHERE sender = 'assistant'")
    replied_chats = cursor.fetchone()[0]
    response_rate = round((replied_chats / total_contact_chats * 100) if total_contact_chats > 0 else 0, 1)

    # Avg response time (seconds) — approximate
    cursor.execute("""
        SELECT AVG(CAST(julianday(a.timestamp) * 86400 AS INTEGER) - CAST(julianday(c.timestamp) * 86400 AS INTEGER))
        FROM messages c
        JOIN messages a ON a.telegram_id = c.telegram_id AND a.sender = 'assistant' AND a.id = (
            SELECT MIN(id) FROM messages WHERE telegram_id = c.telegram_id AND sender = 'assistant' AND id > c.id
        )
        WHERE c.sender = 'contact'
    """)
    avg_rt = cursor.fetchone()[0]
    avg_response_time = round(avg_rt, 1) if avg_rt else 0
    
    # Categories count
    cursor.execute("SELECT category, COUNT(*) FROM contacts GROUP BY category")
    categories_raw = cursor.fetchall()
    categories = {cat: count for cat, count in categories_raw if cat}
    
    # Sentiments
    cursor.execute("SELECT sentiment, COUNT(*) FROM messages WHERE sender = 'contact' GROUP BY sentiment")
    sentiments_raw = cursor.fetchall()
    sentiments = {sent: count for sent, count in sentiments_raw if sent}
    
    # Daily counts (last 7 days)
    cursor.execute("""
        SELECT date(timestamp), COUNT(*) 
        FROM messages 
        GROUP BY date(timestamp) 
        ORDER BY date(timestamp) DESC 
        LIMIT 7
    """)
    daily_history = [{"date": r[0], "count": r[1]} for r in cursor.fetchall()]
    
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
