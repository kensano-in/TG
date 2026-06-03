import sqlite3
import os
import time
from datetime import datetime

# Cache for settings table to reduce disk/db query latency

class PostgresCursorWrapper:
    def __init__(self, pg_cursor):
        self.cursor = pg_cursor

    def execute(self, query, params=None):
        # Translate SQLite parameters '?' to Postgres '%s'
        if params is not None:
            query = query.replace("?", "%s")
        
        # Translate INSERT OR IGNORE syntax
        if "INSERT OR IGNORE" in query:
            if "settings" in query.lower():
                query = query.replace("INSERT OR IGNORE INTO settings", "INSERT INTO settings")
                query += " ON CONFLICT (key) DO NOTHING"
            elif "keyword_rules" in query.lower():
                query = query.replace("INSERT OR IGNORE INTO keyword_rules", "INSERT INTO keyword_rules")
                query += " ON CONFLICT (keyword) DO NOTHING"
            elif "contacts" in query.lower():
                query = query.replace("INSERT OR IGNORE INTO contacts", "INSERT INTO contacts")
                query += " ON CONFLICT (telegram_id) DO NOTHING"
            elif "qa_backup" in query.lower():
                query = query.replace("INSERT OR IGNORE INTO qa_backup", "INSERT INTO qa_backup")
                query += " ON CONFLICT (cleaned_query) DO NOTHING"
        
        # Translate INSERT OR REPLACE syntax
        if "INSERT OR REPLACE" in query:
            if "settings" in query.lower():
                query = query.replace("INSERT OR REPLACE INTO settings", "INSERT INTO settings")
                query += " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            elif "keyword_rules" in query.lower():
                query = query.replace("INSERT OR REPLACE INTO keyword_rules", "INSERT INTO keyword_rules")
                query += " ON CONFLICT (keyword) DO UPDATE SET response = EXCLUDED.response, match_mode = EXCLUDED.match_mode, action_type = EXCLUDED.action_type, action_value = EXCLUDED.action_value"
            elif "qa_backup" in query.lower():
                query = query.replace("INSERT OR REPLACE INTO qa_backup", "INSERT INTO qa_backup")
                query += " ON CONFLICT (cleaned_query) DO UPDATE SET response = EXCLUDED.response"
        
        # Auto-increment conversion
        if "AUTOINCREMENT" in query:
            query = query.replace("AUTOINCREMENT", "")
            
        # INTEGER PRIMARY KEY -> SERIAL PRIMARY KEY
        if "INTEGER PRIMARY KEY" in query and "contacts" not in query.lower():
            query = query.replace("INTEGER PRIMARY KEY", "SERIAL PRIMARY KEY")
        elif "INTEGER PRIMARY KEY" in query and "contacts" in query.lower():
            # Keep contacts telegram_id as BIGINT PRIMARY KEY
            query = query.replace("INTEGER PRIMARY KEY", "BIGINT PRIMARY KEY")

        # sqlite DATETIME/INTEGER conversion mappings
        if "julianday" in query.lower():
            # Custom translation for approx response time query on postgres
            query = """
                SELECT AVG(EXTRACT(EPOCH FROM (a.timestamp::timestamp - c.timestamp::timestamp)))
                FROM messages c
                JOIN messages a ON a.telegram_id = c.telegram_id AND a.sender = 'assistant' AND a.id = (
                    SELECT MIN(id) FROM messages WHERE telegram_id = c.telegram_id AND sender = 'assistant' AND id > c.id
                )
                WHERE c.sender = 'contact'
            """
            params = None

        if "date(" in query.lower():
            query = query.replace("date(timestamp)", "timestamp::date")
            query = query.replace("date(timestamp) DESC", "timestamp::date DESC")
            query = query.replace("GROUP BY date(timestamp)", "GROUP BY timestamp::date")
            query = query.replace("ORDER BY date(timestamp) DESC", "ORDER BY timestamp::date DESC")

        # Telegram IDs are 64-bit integers — fix per-line using regex so we don't
        # accidentally match 'PRIMARY KEY' on a DIFFERENT line of the same CREATE TABLE.
        import re
        query = re.sub(r'\btelegram_id\s+INTEGER(?!\s+PRIMARY)', 'telegram_id BIGINT', query)

        # CRITICAL: psycopg2 maps Python int -> PostgreSQL INTEGER (32-bit) by default.
        # Telegram user IDs can be up to 64-bit (e.g. 7814788493 > 2,147,483,647).
        # Wrap any oversized integer param in Int8 so psycopg2 sends it as BIGINT.
        if params is not None:
            import psycopg2.extensions
            _INT32_MAX = 2_147_483_647
            fixed = []
            for p in (params if isinstance(params, (list, tuple)) else [params]):
                if isinstance(p, int) and not isinstance(p, bool) and abs(p) > _INT32_MAX:
                    fixed.append(psycopg2.extensions.AsIs(str(p)))
                else:
                    fixed.append(p)
            params = type(params)(fixed) if isinstance(params, (list, tuple)) else fixed[0]

        # Execute query
        if params is not None:
            self.cursor.execute(query, params)

        else:
            self.cursor.execute(query)
        return self

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        # psycopg2 DictCursor returns DictRow — convert to plain dict for consistent access
        try:
            return dict(row)
        except Exception:
            return row

    def fetchall(self):
        rows = self.cursor.fetchall()
        result = []
        for row in rows:
            try:
                result.append(dict(row))
            except Exception:
                result.append(row)
        return result

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def __iter__(self):
        return iter(self.cursor)

class PostgresConnectionWrapper:
    def __init__(self, pg_conn):
        self.conn = pg_conn

    def cursor(self):
        import psycopg2.extras
        # DictCursor lets us access columns as row['key'] as sqlite3.Row does
        return PostgresCursorWrapper(self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def execute(self, query, params=None):
        cursor = self.cursor()
        cursor.execute(query, params)
        return cursor

DB_FILE = os.path.join(os.path.dirname(__file__), "manager.db")

# Cache for settings table to reduce disk/db query latency
_settings_cache = {}
_settings_cache_time = 0.0
CACHE_TTL = 3.0 # seconds

def load_settings_cache():
    global _settings_cache, _settings_cache_time
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        conn.close()
        _settings_cache = {row['key']: row['value'] for row in rows}
        _settings_cache_time = time.time()
    except Exception as e:
        print(f"Error loading settings cache: {e}")

def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        db_url = db_url.strip().strip("'").strip('"')
        import psycopg2
        from urllib.parse import unquote
        
        parsed_successfully = False
        try:
            # Robust custom parsing to handle passwords with special characters like '@' or '#'
            url_str = db_url
            if url_str.startswith("postgresql://"):
                url_str = url_str[len("postgresql://"):]
            elif url_str.startswith("postgres://"):
                url_str = url_str[len("postgres://"):]
            elif "://" in url_str:
                url_str = url_str.split("://", 1)[1]
                
            if "@" in url_str:
                parts = url_str.rsplit("@", 1)
                user_pass = parts[0]
                host_port_db = parts[1]
                
                if ":" in user_pass:
                    username, password = user_pass.split(":", 1)
                else:
                    username = user_pass
                    password = ""
                    
                if "/" in host_port_db:
                    host_port, database = host_port_db.split("/", 1)
                else:
                    host_port = host_port_db
                    database = ""
                    
                conn_kwargs = {}
                if "?" in database:
                    database, query_str = database.split("?", 1)
                    from urllib.parse import parse_qsl
                    for k, v in parse_qsl(query_str):
                        conn_kwargs[k] = v
                        
                if ":" in host_port:
                    hostname, port = host_port.split(":", 1)
                else:
                    hostname = host_port
                    port = "5432"
                
                # Auto-bridge IPv6 network unreachable on Render by routing to IPv4 Supavisor pooler
                if hostname == "db.yzeqznydbrdkzsryjctq.supabase.co":
                    hostname = "aws-1-ap-northeast-1.pooler.supabase.com"
                    port = "6543"
                    if username == "postgres":
                        username = "postgres.yzeqznydbrdkzsryjctq"
                elif hostname and hostname.endswith(".supabase.co") and not hostname.startswith("db.yzeqznydbrdkzsryjctq.supabase.co"):
                    parts_host = hostname.split(".")
                    if len(parts_host) >= 2:
                        project_ref = parts_host[1]
                        hostname = "aws-0-ap-south-1.pooler.supabase.com"
                        port = "6543"
                        if username == "postgres":
                            username = f"postgres.{project_ref}"
                
                parsed_params = {
                    "database": unquote(database),
                    "user": unquote(username),
                    "password": unquote(password),
                    "host": hostname,
                    "port": int(port) if port.isdigit() else 5432,
                    **conn_kwargs
                }
                parsed_successfully = True
            else:
                from urllib.parse import urlparse
                temp_url = db_url
                if "://" not in temp_url:
                    temp_url = "postgresql://" + temp_url
                result = urlparse(temp_url)
                
                database = unquote(result.path[1:]) if result.path else None
                conn_kwargs = {}
                if database and "?" in database:
                    database, query_str = database.split("?", 1)
                    from urllib.parse import parse_qsl
                    for k, v in parse_qsl(query_str):
                        conn_kwargs[k] = v
                        
                hostname = result.hostname
                port = result.port
                username = result.username
                
                # Auto-bridge IPv6 network unreachable on Render by routing to IPv4 Supavisor pooler
                if hostname == "db.yzeqznydbrdkzsryjctq.supabase.co":
                    hostname = "aws-1-ap-northeast-1.pooler.supabase.com"
                    port = 6543
                    if username == "postgres":
                        username = "postgres.yzeqznydbrdkzsryjctq"
                elif hostname and hostname.endswith(".supabase.co") and not hostname.startswith("db.yzeqznydbrdkzsryjctq.supabase.co"):
                    parts_host = hostname.split(".")
                    if len(parts_host) >= 2:
                        project_ref = parts_host[1]
                        hostname = "aws-0-ap-south-1.pooler.supabase.com"
                        port = 6543
                        if username == "postgres":
                            username = f"postgres.{project_ref}"
                            
                parsed_params = {
                    "database": database,
                    "user": unquote(username) if username else None,
                    "password": unquote(result.password) if result.password else None,
                    "host": hostname,
                    "port": port,
                    **conn_kwargs
                }
                parsed_successfully = True
        except Exception as parse_err:
            print(f"DATABASE_URL parsing error: {parse_err}")
            parsed_successfully = False
            
        if parsed_successfully:
            try:
                # Add default sslmode=require if not specified and host is a remote database
                if "sslmode" not in parsed_params and parsed_params.get("host") and "localhost" not in parsed_params.get("host") and "127.0.0.1" not in parsed_params.get("host"):
                    parsed_params["sslmode"] = "require"
                conn = psycopg2.connect(**parsed_params)
            except Exception as conn_err:
                print(f"PostgreSQL connection via parsed keywords failed: {conn_err}")
                raise conn_err
        else:
            # Fallback to direct DSN string connection ONLY if parsing itself failed
            try:
                conn = psycopg2.connect(db_url)
            except Exception as fallback_err:
                print(f"PostgreSQL direct fallback connection failed: {fallback_err}")
                raise fallback_err
                
        return PostgresConnectionWrapper(conn)
    else:
        conn = sqlite3.connect(DB_FILE, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    db_url = os.getenv("DATABASE_URL")
    conn = get_db_connection()
    if not db_url:
        # Enable WAL mode and synchronous normal once at startup for speed & safety
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
        except Exception:
            pass
    cursor = conn.cursor()
    
    # Create contacts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS contacts (
        telegram_id INTEGER PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        username TEXT,
        category TEXT DEFAULT 'unknown',
        notes TEXT DEFAULT '',
        relationship_summary TEXT DEFAULT '',
        is_muted INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # Create messages table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        sender TEXT, -- 'contact', 'owner', 'assistant'
        text TEXT,
        timestamp TEXT,
        sentiment TEXT DEFAULT 'neutral',
        priority TEXT DEFAULT 'normal'
    )
    """)
    
    # Create settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    
    # Create keyword_rules table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS keyword_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE,
        response TEXT
    )
    """)
    
    # Create logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        level TEXT,
        message TEXT
    )
    """)
    
    # Create reminders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        task TEXT,
        due_time TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT
    )
    """)

    # Create founder_items table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS founder_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT, -- 'task', 'goal', 'note', 'reminder'
        content TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT
    )
    """)

    # Create saved_vault table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS saved_vault (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT, -- 'save', 'bookmark', 'clip', 'archive'
        text TEXT,
        media_path TEXT,
        timestamp TEXT
    )
    """)

    # Create qa_backup table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qa_backup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cleaned_query TEXT UNIQUE,
        original_query TEXT,
        response TEXT
    )
    """)
    
    # Run migrations for language and tone in messages table
    # NOTE: We must handle BOTH sqlite3.OperationalError (SQLite) AND psycopg2 DuplicateColumn errors (PostgreSQL)
    # PostgreSQL aborts the transaction on any error, so we must commit/rollback between migration attempts
    def _run_migration(conn, cursor, sql):
        """Safely attempt a schema migration, ignoring column-already-exists errors."""
        try:
            cursor.execute(sql)
            conn.commit()
        except Exception:
            # Rollback to clear the aborted transaction state (critical for PostgreSQL)
            try:
                conn.rollback()
            except Exception:
                pass

    _run_migration(conn, cursor, "ALTER TABLE messages ADD COLUMN language TEXT DEFAULT 'english'")
    _run_migration(conn, cursor, "ALTER TABLE messages ADD COLUMN tone TEXT DEFAULT 'neutral'")

    # Run migrations for keyword_rules table fields
    _run_migration(conn, cursor, "ALTER TABLE keyword_rules ADD COLUMN match_mode TEXT DEFAULT 'contains'")
    _run_migration(conn, cursor, "ALTER TABLE keyword_rules ADD COLUMN action_type TEXT DEFAULT 'reply'")
    _run_migration(conn, cursor, "ALTER TABLE keyword_rules ADD COLUMN action_value TEXT DEFAULT ''")

    # CRITICAL: Migrate telegram_id columns from INTEGER (32-bit) to BIGINT (64-bit)
    # Modern Telegram user IDs exceed PostgreSQL INTEGER range (max ~2.1 billion)
    # These ALTER statements are safe no-ops on SQLite (ignored via exception catch)
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        _run_migration(conn, cursor, "ALTER TABLE messages ALTER COLUMN telegram_id TYPE BIGINT")
        _run_migration(conn, cursor, "ALTER TABLE reminders ALTER COLUMN telegram_id TYPE BIGINT")
        _run_migration(conn, cursor, "ALTER TABLE founder_items ALTER COLUMN id TYPE BIGINT")
        _run_migration(conn, cursor, "ALTER TABLE contacts ALTER COLUMN is_muted TYPE BIGINT")
    # Insert default settings if they don't exist
    default_settings = [
        ("status", "focus"), # online, busy, sleeping, travel, focus, vacation
        ("ai_enabled", "1"),
        ("approval_mode", "0"), # 0 = auto-reply directly, 1 = save as draft for dashboard approval
        ("idle_threshold", "300"), # seconds before considered offline/idle (5 mins)
        ("assistant_name", "Coet"),
        ("ai_personality", "You are Coet, CatVos's executive assistant/manager. Keep replies warm, professional, respectful, concise, and human-like. Never mention you are an AI or Gemini. Only introduce yourself as Coet, CatVos's manager on the first message or if the contact asks who you are. For subsequent messages, speak naturally and directly as his manager without repeating your name or introduction. Keep replies to 1 sentence maximum."),
        ("last_owner_activity", str(datetime.utcnow().timestamp())),
        ("dashboard_password", os.getenv("DASHBOARD_PASSWORD", "admin")), # default password
        ("timezone", "Asia/Kolkata"), # default timezone (India)
        ("owner_activity_override", "auto"), # auto, online, offline
        ("bypass_family_friends", "0"), # bypass auto replies for family & friends
        ("force_draft_vips", "1"), # force drafts for vip/clients
        ("tone_profile", "concise"), # concise, elaborated
        ("smart_hinglish", "1"), # smart detection and reply in Hinglish
        ("auto_sleep_enabled", "1"), # auto-sleep at night
        ("auto_busy_enabled", "1"), # auto-busy if chatting with other DMs
        ("last_owner_chat_partner", ""), # track owner last DM partner ID
        ("last_owner_chat_partner_time", "0"), # track owner last DM partner activity timestamp
        ("knowledge_base", "CatVos is a developer and middleman. Middleman deals carry a 5% secure fee. WhatsApp accounts stock and Telegram channels stock are available. For website projects and design/editing requests, contact the developer for custom quotes."),
        ("blacklist_keywords", ""),
        ("reply_delay_min", "1.2"),
        ("reply_delay_max", "4.0"),
        ("active_hours_start", "9"),
        ("active_hours_end", "23")
    ]
    
    for key, val in default_settings:
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))
        
    # Insert default keyword rules
    default_rules = [
        ("kya hal", "Sab badhiya! CatVos abhi offline hai, main unka manager Coet hu. Bataiye kya kaam tha?"),
        ("kya chal", "Sab badhiya hai dost! CatVos abhi resting state me hai, main unka manager Coet hu. Kuch specific kaam tha?"),
        ("help", "Hi, main CatVos ka manager Coet hu. Agar koi emergency hai toh please unhe direct call kariye ya 'urgent' likhiye.")
    ]
    for kw, resp in default_rules:
        cursor.execute("INSERT OR IGNORE INTO keyword_rules (keyword, response) VALUES (?, ?)", (kw, resp))

    # Insert default Q&A backups for high-fidelity offline fallback
    default_qa = [
        ("what is middleman fee", "Flat 5% secure middleman fee is charged for all escrow transactions."),
        ("middleman charges", "Escrow and middleman charges are 5% of the deal value to ensure transaction safety."),
        ("middleman rules", "All middleman deals are held securely by CatVos. Secure fee is flat 5% per transaction."),
        ("mm fee", "MM fee is flat 5% per transaction, handled securely by CatVos."),
        ("escrow fee", "Escrow fee is flat 5% per deal. CatVos manages the transaction security."),
        ("do you have whatsapp stock", "Yes, WhatsApp alts/accounts stock is available. CatVos will share the catalog and rates directly once online."),
        ("whatsapp rates", "WhatsApp accounts pricing depends on the batch size. CatVos will share the catalog and rates directly."),
        ("whatsapp accounts price", "WhatsApp alts/accounts pricing details and stock catalog will be shared by CatVos directly when online."),
        ("wp price", "WhatsApp accounts pricing details and stock catalog will be shared by CatVos directly when online."),
        ("wp stock", "Yes, fresh WhatsApp alts stock is available. CatVos will share details directly once back."),
        ("whatsapp numbers", "WhatsApp numbers are available in stock. CatVos will share rates once back."),
        ("telegram channels stock", "Telegram channels and group stock are available. CatVos will share the details and options directly."),
        ("telegram channel price", "Telegram channel rates depend on members/niche. CatVos will share the list and pricing once online."),
        ("tg channel rate", "Telegram channel rates depend on members/niche. CatVos will share the list and pricing once online."),
        ("tg stock", "Telegram channels and group stock are available. CatVos will share the details and options directly."),
        ("do you do website coding", "Yes, custom website development, UI/UX designs, and custom scripts are offered. Drop your project brief here and CatVos will coordinate directly."),
        ("website pricing", "For custom website projects, please wait for CatVos to coordinate with you directly to provide a custom quote."),
        ("site price", "For custom website projects, please wait for CatVos to coordinate with you directly to provide a custom quote."),
        ("web development", "Yes, custom website development, UI/UX designs, and custom scripts are offered. Drop your project brief here and CatVos will coordinate directly."),
        ("video editing services", "Yes, premium video editing and graphic design work are available. Check out the preview channel: @previewcom on Telegram."),
        ("logo design banner thumbnail", "Logo, banner, and thumbnail designs are available. Check out the preview channel: @previewcom on Telegram."),
        ("edit thumbnail", "Logo, banner, and thumbnail designs are available. Check out the preview channel: @previewcom on Telegram."),
        ("graphic designer", "Yes, premium graphic design work is available. Check out the preview channel: @previewcom on Telegram."),
        ("what payment methods do you accept", "We support UPI for instant fiat settlement. CatVos will provide the active UPI details once online."),
        ("do you accept upi", "Yes, UPI payments are supported. CatVos will share the active UPI details once the deal is finalized."),
        ("upi details", "UPI payments are supported. CatVos will share the active UPI details once the deal is finalized."),
        ("payment upi", "UPI payments are supported. CatVos will share the active UPI details once the deal is finalized."),
        ("official website link", "You can visit the official website at https://verlyn.dev."),
        ("verlyn dev", "You can visit the official website at https://verlyn.dev."),
        ("website url", "You can visit the official website at https://verlyn.dev."),
        ("who made you", "I am Coet, built by lead developer shinichiro (@shinichirofr) to manage CatVos's communications."),
        ("how to get this bot", "For bot setups, Digital Twin clones, and client managers, contact lead developer @shinichirofr directly."),
        ("coet setup details", "Custom chatbot setups and userbot manager deployments are handled directly by @shinichirofr."),
        ("shinichiro telegram", "Contact lead developer @shinichirofr directly on Telegram."),
    ]
    
    import re
    for q, r in default_qa:
        cleaned = q.lower().strip()
        cleaned = re.sub(r'<[^>]*>', '', cleaned)
        cleaned = re.sub(r'[\*\_\`\~]', '', cleaned)
        cleaned = re.sub(r'[\.\,\!\?\:\;\-\"\'\(\)\[\]\{\}]', '', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        cursor.execute(
            "INSERT OR IGNORE INTO qa_backup (cleaned_query, original_query, response) VALUES (?, ?, ?)",
            (cleaned, q, r)
        )
        
    # Migrate/Update existing setting if it was using the old, repetitive introduction prompt
    cursor.execute("SELECT value FROM settings WHERE key = 'ai_personality'")
    row = cursor.fetchone()
    _row_value = (row.get('value') if isinstance(row, dict) else row[0]) if row else None
    if _row_value and "Always introduce yourself" in _row_value:
        cursor.execute("UPDATE settings SET value = ? WHERE key = 'ai_personality'", (
            "You are Coet, CatVos's executive assistant/manager. Keep replies warm, professional, respectful, concise, and human-like. Never mention you are an AI or Gemini. Only introduce yourself as Coet, CatVos's manager on the first message or if the contact asks who you are. For subsequent messages, speak naturally and directly as his manager without repeating your name or introduction. Keep replies to 1 sentence maximum.",
        ))
        
    conn.commit()
    conn.close()

def get_setting(key, default=None):
    global _settings_cache, _settings_cache_time
    now = time.time()
    if not _settings_cache or (now - _settings_cache_time) > CACHE_TTL:
        load_settings_cache()
    return _settings_cache.get(key, default)

def set_setting(key, value):
    global _settings_cache
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
    conn.commit()
    conn.close()
    if _settings_cache is not None:
        _settings_cache[key] = str(value)

def log_event(level, message):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    cursor.execute("INSERT INTO logs (timestamp, level, message) VALUES (?, ?, ?)", (now, level, message))
    conn.commit()
    conn.close()
    print(f"[{level}] {message}")

def get_logs(limit=150):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Contact Operations
def get_or_create_contact(telegram_id, first_name="", last_name="", username=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM contacts WHERE telegram_id = ?", (telegram_id,))
    contact = cursor.fetchone()
    
    if not contact:
        now = datetime.utcnow().isoformat() + "Z"
        cursor.execute("""
            INSERT INTO contacts (telegram_id, first_name, last_name, username, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (telegram_id, first_name, last_name, username, now, now))
        conn.commit()
        cursor.execute("SELECT * FROM contacts WHERE telegram_id = ?", (telegram_id,))
        contact = cursor.fetchone()
        
    conn.close()
    return dict(contact)

def update_contact(telegram_id, category=None, notes=None, relationship_summary=None, is_muted=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    fields = []
    params = []
    
    if category is not None:
        fields.append("category = ?")
        params.append(category)
    if notes is not None:
        fields.append("notes = ?")
        params.append(notes)
    if relationship_summary is not None:
        fields.append("relationship_summary = ?")
        params.append(relationship_summary)
    if is_muted is not None:
        fields.append("is_muted = ?")
        params.append(is_muted)
        
    if fields:
        fields.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat() + "Z")
        params.append(telegram_id)
        query = f"UPDATE contacts SET {', '.join(fields)} WHERE telegram_id = ?"
        cursor.execute(query, params)
        conn.commit()
    conn.close()

def get_all_contacts():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM contacts ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Message Operations
def add_message(telegram_id, sender, text, sentiment='neutral', priority='normal', language='english', tone='neutral'):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    cursor.execute("""
        INSERT INTO messages (telegram_id, sender, text, timestamp, sentiment, priority, language, tone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (telegram_id, sender, text, now, sentiment, priority, language, tone))
    conn.commit()
    conn.close()
    
def get_chat_history(telegram_id, limit=50):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM messages 
        WHERE telegram_id = ? 
        ORDER BY id DESC 
        LIMIT ?
    """, (telegram_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]

def get_owner_messages(limit=500):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT text FROM messages 
        WHERE sender = 'owner' 
        ORDER BY id DESC 
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [r['text'] for r in rows if r['text']]

def get_recent_messages_dashboard(limit=100):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Get recent messages with contact details
    cursor.execute("""
        SELECT m.*, c.first_name, c.last_name, c.username, c.category 
        FROM messages m
        JOIN contacts c ON m.telegram_id = c.telegram_id
        ORDER BY m.id DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Keyword Rules Operations
def get_all_keyword_rules():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM keyword_rules ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_keyword_rule(keyword, response, match_mode='contains', action_type='reply', action_value=''):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT OR REPLACE INTO keyword_rules (keyword, response, match_mode, action_type, action_value) 
            VALUES (?, ?, ?, ?, ?)
        """, (keyword.strip().lower(), response, match_mode, action_type, action_value))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        conn.close()
        print(f"Error adding keyword rule: {e}")
        return False

def delete_keyword_rule(rule_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM keyword_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()

def match_keyword_rule(message_text, sender_id=None):
    """
    Checks if message matches any of the defined keyword rules using contains, regex, or fuzzy matching.
    Executes automated actions (categorize, priority, mute) and compiles template variables.
    Returns a dict with resolved reply and priority, or None.
    """
    import re
    import difflib
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM keyword_rules")
    rules = cursor.fetchall()
    conn.close()
    
    cleaned_msg = message_text.lower().strip()
    
    for row in rules:
        kw = (row['keyword'] or '').lower().strip()
        if not kw:
            continue
            
        match_mode = row['match_mode'] or 'contains'
        matched = False
        
        if match_mode == 'contains':
            matched = kw in cleaned_msg
        elif match_mode == 'regex':
            try:
                matched = bool(re.search(kw, message_text, re.IGNORECASE))
            except Exception:
                matched = False
        elif match_mode == 'fuzzy':
            # Check if any word in the message is a fuzzy match to the keyword (similarity >= 0.8)
            words = cleaned_msg.split()
            for w in words:
                w_clean = re.sub(r'[^\w]', '', w) # strip punctuation
                if not w_clean:
                    continue
                ratio = difflib.SequenceMatcher(None, kw, w_clean).ratio()
                if ratio >= 0.8:
                    matched = True
                    break
                    
        if matched:
            action_type = row['action_type'] or 'reply'
            action_value = row['action_value'] or ''
            response = row['response'] or ''
            priority_override = None
            
            # Execute Actions if sender_id is provided
            if sender_id:
                if action_type == 'category' and action_value:
                    update_contact(sender_id, category=action_value)
                    log_event("INFO", f"Keyword Rule matched. Automatically categorized {sender_id} as '{action_value}'.")
                elif action_type == 'mute':
                    update_contact(sender_id, is_muted=1)
                    log_event("INFO", f"Keyword Rule matched. Automatically muted contact {sender_id}.")
                elif action_type == 'priority' and action_value:
                    priority_override = action_value
                    log_event("INFO", f"Keyword Rule matched. Priority overridden to '{action_value}'.")
                elif action_type == 'combined' and action_value:
                    # Combined action e.g. "category:vip;priority:critical"
                    parts = action_value.split(';')
                    for part in parts:
                        if ':' in part:
                            k, v = part.split(':', 1)
                            k = k.strip().lower()
                            v = v.strip()
                            if k == 'category':
                                update_contact(sender_id, category=v)
                            elif k == 'mute' and v == '1':
                                update_contact(sender_id, is_muted=1)
                            elif k == 'priority':
                                priority_override = v
                    log_event("INFO", f"Keyword Rule matched. Executed combined actions: {action_value}")
            
            # If priority rule matches, we set priority_override
            if action_type == 'priority' and action_value:
                priority_override = action_value
                
            # Compile template variables in the response
            if response:
                first_name = 'there'
                if sender_id:
                    contact = get_or_create_contact(sender_id)
                    first_name = contact.get('first_name') or 'there'
                assistant_name = get_setting("assistant_name", "Coet")
                status = get_resolved_status(sender_id=sender_id)
                
                response = response.replace("{first_name}", first_name)
                response = response.replace("{assistant_name}", assistant_name)
                response = response.replace("{status}", status)
                
            return {
                "id": row['id'],
                "keyword": row['keyword'],
                "response": response,
                "match_mode": match_mode,
                "action_type": action_type,
                "action_value": action_value,
                "priority": priority_override
            }
            
    return None

def get_assistant_reply_count_since_last_owner(telegram_id):
    """
    Returns the count of assistant replies to the contact since the owner's last interaction
    (last message sent by owner or last read event by owner for this contact).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Last owner message time
    cursor.execute("""
        SELECT timestamp FROM messages 
        WHERE telegram_id = ? AND sender = 'owner' 
        ORDER BY id DESC LIMIT 1
    """, (telegram_id,))
    row = cursor.fetchone()
    last_owner_msg_time = row['timestamp'] if row else None
    
    # 2. Last owner read time
    last_read_str = get_setting(f"last_owner_read_{telegram_id}")
    last_owner_read_time = None
    if last_read_str:
        try:
            last_owner_read_time = datetime.utcfromtimestamp(float(last_read_str)).isoformat() + "Z"
        except Exception:
            pass
            
    # Determine the most recent interaction timestamp
    since_time = None
    if last_owner_msg_time and last_owner_read_time:
        since_time = max(last_owner_msg_time, last_owner_read_time)
    elif last_owner_msg_time:
        since_time = last_owner_msg_time
    elif last_owner_read_time:
        since_time = last_owner_read_time
        
    if since_time:
        cursor.execute("""
            SELECT COUNT(*) FROM messages 
            WHERE telegram_id = ? AND sender = 'assistant' AND timestamp > ?
        """, (telegram_id, since_time))
    else:
        cursor.execute("""
            SELECT COUNT(*) FROM messages 
            WHERE telegram_id = ? AND sender = 'assistant'
        """, (telegram_id,))

    row = cursor.fetchone()
    if row is None:
        count = 0
    elif isinstance(row, dict):
        # DictCursor returns a dict; COUNT(*) column name varies
        count = list(row.values())[0]
    else:
        count = row[0]
    conn.close()
    return count


def get_resolved_status(sender_id=None):
    """
    Dynamically determines the assistant's status based on time of day (sleep mode) 
    and owner's active messaging state (busy/meeting override).
    """
    from zoneinfo import ZoneInfo
    base_status = get_setting("status", "focus")
    
    # 1. Night Sleep Override (outside Active Hours)
    auto_sleep = get_setting("auto_sleep_enabled", "1") == "1"
    if auto_sleep:
        tz_name = get_setting("timezone", "Asia/Kolkata")
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
        local_now = datetime.now(tz)
        
        try:
            start_hour = int(get_setting("active_hours_start", "9"))
            end_hour = int(get_setting("active_hours_end", "23"))
        except Exception:
            start_hour, end_hour = 9, 23
            
        if start_hour <= end_hour:
            if not (start_hour <= local_now.hour < end_hour):
                return "sleeping"
        else: # Handle overnight range e.g. start=22, end=6
            if not (local_now.hour >= start_hour or local_now.hour < end_hour):
                return "sleeping"
            
    # 2. Active Chat Busy Override (Owner chatting with someone else in another DM)
    auto_busy = get_setting("auto_busy_enabled", "1") == "1"
    if auto_busy and base_status == "online":
        last_partner = get_setting("last_owner_chat_partner")
        last_partner_time_str = get_setting("last_owner_chat_partner_time")
        if last_partner and last_partner_time_str:
            try:
                time_diff = time.time() - float(last_partner_time_str)
                # If owner was active with someone else within last 5 minutes (300 seconds)
                if time_diff < 300:
                    if sender_id is not None:
                        if str(sender_id) != str(last_partner):
                            return "busy"
                    else:
                        # General status check (e.g. Overview API)
                        return "busy"
            except ValueError:
                pass
                
    return base_status

def add_reminder(telegram_id, task, due_time):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    cursor.execute("""
        INSERT INTO reminders (telegram_id, task, due_time, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
    """, (telegram_id, task, due_time, now))
    conn.commit()
    conn.close()
    log_event("INFO", f"Saved reminder for contact {telegram_id}: {task} due at {due_time}")

def get_all_reminders():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reminders ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_reminder_status(reminder_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE reminders SET status = ? WHERE id = ?", (status, reminder_id))
    conn.commit()
    conn.close()
    log_event("INFO", f"Updated reminder {reminder_id} status to '{status}'")

# Founder & Saved Vault Operations
def add_founder_item(item_type, content):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    cursor.execute(
        "INSERT INTO founder_items (type, content, created_at) VALUES (?, ?, ?)",
        (item_type, content, now)
    )
    conn.commit()
    conn.close()

def get_founder_items(item_type=None, status=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM founder_items"
    params = []
    
    conditions = []
    if item_type:
        conditions.append("type = ?")
        params.append(item_type)
    if status:
        conditions.append("status = ?")
        params.append(status)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def complete_founder_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE founder_items SET status = 'completed' WHERE id = ?",
        (item_id,)
    )
    conn.commit()
    conn.close()

def add_vault_item(item_type, text, media_path=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    cursor.execute(
        "INSERT INTO saved_vault (type, text, media_path, timestamp) VALUES (?, ?, ?, ?)",
        (item_type, text, media_path, now)
    )
    conn.commit()
    conn.close()

def get_vault_items(item_type=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM saved_vault"
    params = []
    if item_type:
        query += " WHERE type = ?"
        params.append(item_type)
    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_qa_backup(original_query, response):
    """Save a query and its successful Gemini response for offline local Q&A fallback."""
    if not original_query or not response:
        return
    import re
    cleaned = original_query.lower().strip()
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    cleaned = re.sub(r'[\*\_\`\~]', '', cleaned)
    cleaned = re.sub(r'[\.\,\!\?\:\;\-\"\'\(\)\[\]\{\}]', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if not cleaned:
        return
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO qa_backup (cleaned_query, original_query, response) VALUES (?, ?, ?)",
            (cleaned, original_query.strip(), response.strip())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving QA backup: {e}")

def match_qa_backup(message_text):
    """
    Finds a highly similar Q&A backup record in the local database.
    Uses difflib SequenceMatcher to do high-fidelity fuzzy text matching.
    """
    if not message_text:
        return None
    import re
    import difflib
    
    cleaned = message_text.lower().strip()
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    cleaned = re.sub(r'[\*\_\`\~]', '', cleaned)
    cleaned = re.sub(r'[\.\,\!\?\:\;\-\"\'\(\)\[\]\{\}]', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if not cleaned:
        return None
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT cleaned_query, response FROM qa_backup")
        rows = cursor.fetchall()
        conn.close()
    except Exception as e:
        print(f"Error reading QA backup: {e}")
        return None
        
    best_match = None
    best_ratio = 0.0
    
    for row in rows:
        db_query = row['cleaned_query']
        if db_query == cleaned:
            return row['response']
        ratio = difflib.SequenceMatcher(None, cleaned, db_query).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = row['response']
            
    if best_ratio >= 0.8:
        return best_match
    return None
