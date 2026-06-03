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
            # Check for direct supabase hostname
            host = parsed_params.get("host", "")
            if host and host.endswith(".supabase.co"):
                print("="*60)
                print("CRITICAL WARNING: Direct Supabase hostname (.supabase.co) detected!")
                print("These hostnames are IPv6-only. Render does not support outbound IPv6.")
                print("Please configure your DATABASE_URL to use the Supabase Connection Pooler")
                print("hostname (e.g., aws-0-[region].pooler.supabase.com) from your Supabase dashboard.")
                print("="*60)

            # Try connecting with sslmode=require
            params_copy = parsed_params.copy()
            if "sslmode" not in params_copy and params_copy.get("host") and "localhost" not in params_copy.get("host") and "127.0.0.1" not in params_copy.get("host"):
                params_copy["sslmode"] = "require"
            
            try:
                conn = psycopg2.connect(**params_copy)
            except Exception as conn_err:
                print(f"PostgreSQL connection with sslmode=require failed: {conn_err}")
                # Fallback: try connecting with sslmode=prefer
                try:
                    print("Retrying connection with sslmode=prefer...")
                    params_copy["sslmode"] = "prefer"
                    conn = psycopg2.connect(**params_copy)
                except Exception as conn_err2:
                    print(f"PostgreSQL connection with sslmode=prefer failed: {conn_err2}")
                    # Final fallback: try connecting without forcing sslmode
                    try:
                        print("Retrying connection without forcing sslmode parameter...")
                        params_copy.pop("sslmode", None)
                        conn = psycopg2.connect(**params_copy)
                    except Exception as conn_err3:
                        print("="*60)
                        print("PostgreSQL connection failed under all SSL modes.")
                        print(f"Error details: {conn_err3}")
                        print("="*60)
                        raise conn_err3
        else:
            # Fallback to direct DSN string connection ONLY if parsing itself failed
            try:
                conn = psycopg2.connect(db_url)
            except Exception as fallback_err:
                print("="*60)
                print(f"PostgreSQL direct fallback connection failed: {fallback_err}")
                print("="*60)
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

    # Create scheduled_tasks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id BIGINT DEFAULT NULL,
        category TEXT DEFAULT NULL,
        message TEXT,
        send_at TEXT,
        status TEXT DEFAULT 'pending'
    )
    """)

    # Create broadcast_history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS broadcast_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        message TEXT,
        recipient_count INTEGER DEFAULT 0,
        sent_at TEXT,
        status TEXT DEFAULT 'sent'
    )
    """)

    # Create message_templates table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS message_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        content TEXT,
        created_at TEXT
    )
    """)

    # Create contact_tags table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS contact_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        tag TEXT,
        created_at TEXT
    )
    """)

    # Create custom_commands table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS custom_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_name TEXT UNIQUE,
        description TEXT,
        response_template TEXT,
        variables TEXT,
        created_at TEXT
    )
    """)

    # Create payment_methods table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        label TEXT,
        value TEXT,
        network TEXT,
        qr_image_path TEXT,
        command_trigger TEXT UNIQUE,
        enabled INTEGER DEFAULT 1
    )
    """)

    # Create deal_orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS deal_orders (
        order_id TEXT PRIMARY KEY,
        contact_id INTEGER,
        contact_name TEXT,
        items TEXT,
        amount REAL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'open',
        summary TEXT,
        thank_you_message TEXT,
        created_at TEXT,
        closed_at TEXT
    )
    """)

    # Create customer_licenses table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE,
        client_telegram_id INTEGER,
        client_name TEXT,
        store_name TEXT,
        expires_at TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT
    )
    """)

    # Create client_products table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS client_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_telegram_id INTEGER,
        product_name TEXT,
        price REAL,
        description TEXT,
        stock_count INTEGER DEFAULT 0
    )
    """)

    # Create client_orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS client_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_telegram_id INTEGER,
        buyer_telegram_id INTEGER,
        buyer_name TEXT,
        product_id INTEGER,
        amount REAL,
        status TEXT DEFAULT 'pending',
        created_at TEXT
    )
    """)

    # Create joined_chats table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS joined_chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id BIGINT UNIQUE,
        title TEXT,
        username TEXT,
        type TEXT,
        whitelisted INTEGER DEFAULT 0,
        joined_at TEXT
    )
    """)

    # Create forwarding_rules table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS forwarding_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_chat_id BIGINT,
        target_chat_id BIGINT,
        keywords TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT
    )
    """)

    # Create userbot_proxies table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS userbot_proxies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        addr TEXT,
        port INTEGER,
        username TEXT,
        password TEXT,
        latency INTEGER DEFAULT -1,
        status TEXT DEFAULT 'untested',
        created_at TEXT
    )
    """)

    # Create webhooks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        secret_token TEXT,
        events TEXT,
        created_at TEXT
    )
    """)

    # Create system_threats table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_threats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        event_type TEXT,
        telegram_id BIGINT,
        username TEXT,
        chat_id BIGINT,
        details TEXT
    )
    """)

    # Commit table creations to ensure they aren't rolled back by subsequent migration exceptions
    conn.commit()
    
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

    # Run migrations for contacts table fields
    _run_migration(conn, cursor, "ALTER TABLE contacts ADD COLUMN custom_prompt TEXT DEFAULT ''")
    _run_migration(conn, cursor, "ALTER TABLE contacts ADD COLUMN custom_delay INTEGER DEFAULT NULL")

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
        ("force_draft_vips", "0"), # force drafts for vip/clients
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
        ("active_hours_end", "23"),
        ("enable_human_delays", "1"),
        ("enable_reactions", "1"),
        ("enable_split_messages", "1"),
        ("var_upi", "shinichiro@upi"),
        ("var_website", "https://verlyn.dev"),
        ("custom_signature", ""),
        ("active_days", "mon,tue,wed,thu,fri,sat,sun"),
        ("log_level", "INFO"),
        ("gemini_model", "gemini-2.5-flash-lite"),
        ("gemini_temperature", "0.85"),
        ("gemini_max_tokens", "1500"),
        ("status_desc_online", "occupied in another chat rn"),
        ("status_desc_busy", "locked in a deal rn"),
        ("status_desc_focus", "heads down in deep work rn"),
        ("status_desc_sleeping", "asleep rn, will be back in the morning"),
        ("status_desc_travel", "traveling rn with limited signal"),
        ("status_desc_vacation", "on vacation rn"),
        ("status_prompt_online", "Tell them CatVos is occupied with another chat right now but will get to them soon."),
        ("status_prompt_busy", "Let them know CatVos is busy doing a deal. Ask if they can wait, or drop deal terms if it is an escrow coordination."),
        ("status_prompt_focus", "Let them know CatVos is in deep work/coding. Tell them to drop details and he will review later."),
        ("status_prompt_sleeping", "Reply by letting them know CatVos is asleep and you will forward their message. Be very brief and polite."),
        ("status_prompt_travel", "Let them know CatVos is traveling and signal is weak. Tell them he will reply when he hits a city."),
        ("status_prompt_vacation", "Tell them CatVos is on vacation and will be back in a few days."),
        ("session_response_limit", "5"),
        ("enable_group_replies", "0"),
        ("antispam_message_threshold", "10"),
        # Media Scheduler (Tab 31)
        ("media_scheduler_mode", "0"),
        ("scheduled_posts_limit", "10"),
        ("watermark_channel_name", ""),
        ("media_retry_count", "3"),
        ("media_max_file_size", "50"),
        ("caption_parse_mode", "html"),
        ("caption_signature_enabled", "0"),
        ("media_auto_delete_delay", "0"),
        ("media_compress_quality", "high"),
        ("media_aspect_ratio_crop", "none"),
        # Multi-Session Manager (Tab 32)
        ("session_failover_retries", "3"),
        ("session_check_interval", "300"),
        ("active_userbot_accounts", ""),
        ("session_load_balancing", "round_robin"),
        ("session_max_concurrency", "5"),
        ("session_auto_reconnect", "1"),
        ("session_health_timeout", "30"),
        ("session_log_level", "INFO"),
        ("session_proxy_bind_all", "0"),
        ("session_force_offline_all", "0"),
        # Lead Extractor (Tab 33)
        ("lead_scraper_limit", "100"),
        ("extractor_keywords", ""),
        ("min_user_active_days", "7"),
        ("lead_dedup_enabled", "1"),
        ("lead_exclude_admins", "1"),
        ("lead_save_format", "csv"),
        ("lead_scrape_interval", "3600"),
        ("lead_auto_export_email", ""),
        ("lead_max_messages_audit", "50"),
        ("lead_min_account_age", "30"),
        # Channel Mirroring (Tab 34)
        ("mirror_target_channels", ""),
        ("mirror_link_stripping", "1"),
        ("mirror_word_replacements", ""),
        ("mirror_watermark_text", ""),
        ("mirror_delay_sec", "0"),
        ("mirror_strip_formatting", "0"),
        ("mirror_exclude_keywords", ""),
        ("mirror_pinned_messages", "0"),
        ("mirror_media_only", "0"),
        ("mirror_auto_translate", "none"),
        # Dynamic Group Welcomer (Tab 35)
        ("welcome_custom_message", "Welcome to the group"),
        ("welcome_button_link", ""),
        ("welcome_auto_delete_delay", "60"),
        ("welcome_show_rules", "0"),
        ("welcome_tag_user", "1"),
        ("welcome_show_captcha_hint", "1"),
        ("welcome_restrict_until_captcha", "1"),
        ("welcome_max_daily_welcomes", "500"),
        ("welcome_custom_banner_path", ""),
        ("welcome_mention_type", "tag"),
        # Restrict & Kick Rules (Tab 36)
        ("warning_points_mute_limit", "3"),
        ("warning_duration", "86400"),
        ("media_restriction_timer", "3600"),
        ("restrict_sticker_flood", "1"),
        ("restrict_link_sharing", "1"),
        ("restrict_forwarded_msg", "0"),
        ("restrict_invitation_spam", "1"),
        ("restrict_voice_messages", "0"),
        ("kick_inactive_days", "30"),
        ("mute_warning_template", "Warning: spamming is not allowed."),
        # Sentiment Alert Radar (Tab 37)
        ("sentiment_angry_alert", "1"),
        ("escalation_alert_dest", "owner"),
        ("auto_owner_notification", "1"),
        ("sentiment_threshold_angry", "0.8"),
        ("sentiment_escalate_vip", "1"),
        ("sentiment_auto_reply_calm", "0"),
        ("sentiment_calming_template", "Please wait, looking into this for you."),
        ("sentiment_ignore_keywords", ""),
        ("sentiment_alert_slack", "0"),
        ("sentiment_alert_discord", "0"),
        # Escrow Vault Hub (Tab 38)
        ("escrow_deposit_duration", "86400"),
        ("escrow_release_window", "3600"),
        ("escrow_multisig_addresses", ""),
        ("escrow_auto_release", "0"),
        ("escrow_fee_handling", "split"),
        ("escrow_min_deposit_usd", "5"),
        ("escrow_max_deposit_usd", "5000"),
        ("escrow_notif_owner_deposit", "1"),
        ("escrow_notif_client_deposit", "1"),
        ("escrow_allow_cancel_pending", "1"),
        # Dispute Arbitration Portal (Tab 39)
        ("dispute_arbitrator_id", "7473010693"),
        ("arbitration_fee_pct", "5.0"),
        ("arbitration_split_rule", "pro_rata"),
        ("arbitration_timeout_days", "3"),
        ("arbitration_evidence_limit", "10"),
        ("arbitration_auto_resolved", "0"),
        ("arbitration_refund_policy", "deposit_refund"),
        ("arbitration_escalate_dev", "0"),
        ("arbitration_custom_notes", ""),
        ("arbitration_log_publicly", "0"),
        # Vouch & Feedback Manager (Tab 40)
        ("vouch_request_delay", "600"),
        ("vouch_target_channel", ""),
        ("vouch_template_format", "Thank you for the vouch!"),
        ("vouch_auto_post", "0"),
        ("vouch_min_rating", "4"),
        ("vouch_incentive_enabled", "0"),
        ("vouch_incentive_details", ""),
        ("vouch_check_completed_deals", "1"),
        ("vouch_custom_signature", ""),
        ("vouch_collect_anonymously", "0"),
        # Direct Message Campaign (Tab 41)
        ("dm_campaign_throttle", "10"),
        ("dm_spin_tax_enabled", "1"),
        ("dm_daily_limit", "50"),
        ("dm_campaign_cooldown", "60"),
        ("dm_recipient_list_csv", ""),
        ("dm_randomize_sending_order", "1"),
        ("dm_skip_muted_contacts", "1"),
        ("dm_report_on_completion", "1"),
        ("dm_campaign_max_retries", "2"),
        ("dm_ignore_blacklist_override", "0"),
        # Advanced Text Filters & Regex (Tab 42)
        ("regex_spam_patterns", ""),
        ("regex_action_override", "delete"),
        ("regex_white_lists", ""),
        ("regex_case_insensitive", "1"),
        ("regex_match_unicode", "1"),
        ("regex_alert_admin_on_match", "1"),
        ("regex_fuzzy_match_ratio", "80"),
        ("regex_strip_links", "0"),
        ("regex_block_profanity", "0"),
        ("regex_warning_penalty", "1"),
        # Spam Wave Blocker (Tab 43)
        ("spam_join_window", "10"),
        ("profile_picture_required", "0"),
        ("username_entropy_threshold", "3"),
        ("spam_max_joins_window", "5"),
        ("spam_block_empty_names", "1"),
        ("spam_block_non_english", "0"),
        ("spam_action_on_bot", "kick"),
        ("spam_alert_channel", ""),
        ("spam_whitelist_inviter", ""),
        ("spam_captcha_level", "easy"),
        # Link Protection (Tab 44)
        ("link_rotator_domain", ""),
        ("link_click_limit", "1000"),
        ("link_report_override", "0"),
        ("link_expiration_hours", "24"),
        ("link_custom_redirect", ""),
        ("link_cloaking_enabled", "0"),
        ("link_track_analytics", "1"),
        ("link_ban_suspicious_ips", "1"),
        ("link_password_protection", "0"),
        ("link_max_active_keys", "20"),
        # Archive Exporter (Tab 45)
        ("auto_archive_interval", "86400"),
        ("archive_media_retention", "30"),
        ("archive_export_format", "json"),
        ("archive_dest_folder", "archives"),
        ("archive_backup_database", "1"),
        ("archive_encrypt_zip", "0"),
        ("archive_password_protect", ""),
        ("archive_exclude_deleted", "1"),
        ("archive_upload_gdrive", "0"),
        ("archive_auto_prune_logs", "0"),
        # Tone & Dialect Mirror (Tab 46)
        ("dialect_mirror_slang", ""),
        ("dialect_casing_rules", "natural"),
        ("typo_frequency_pct", "2.0"),
        ("dialect_sentence_split_ratio", "0.3"),
        ("dialect_abbreviation_usage", "1"),
        ("dialect_hinglish_slang", "1"),
        ("dialect_caps_emphasis", "0"),
        ("dialect_punctuation_rate", "0.9"),
        ("dialect_mimic_intensity", "0.5"),
        ("dialect_owner_style_override", "0"),
        # Outbound Alerts Integration (Tab 47)
        ("notify_dest_discord", ""),
        ("notify_dest_slack", ""),
        ("notify_pushover_token", ""),
        ("notify_pushover_user", ""),
        ("notify_email_receiver", ""),
        ("notify_sms_callback", ""),
        ("notify_trigger_on_threat", "1"),
        ("notify_trigger_on_escrow", "1"),
        ("notify_trigger_on_deal", "1"),
        ("notify_trigger_on_system_error", "1"),
        # Multi-Store Invoicing (Tab 48)
        ("billing_tax_pct", "0.0"),
        ("billing_pdf_layout", "standard"),
        ("billing_revenue_milestones", "1000,5000,10000"),
        ("billing_invoice_prefix", "SHI-"),
        ("billing_company_name", "Shinken"),
        ("billing_default_currency", "USD"),
        ("billing_enable_auto_invoices", "0"),
        ("billing_logo_url", ""),
        ("billing_footer_note", "Thank you for your business!"),
        ("billing_split_agent_pct", "0.0"),
        # Deep Heatmaps & Telemetry (Tab 49)
        ("telemetry_refresh_rate", "5000"),
        ("telemetry_chart_points", "20"),
        ("telemetry_latency_triggers", "500"),
        ("telemetry_db_stats_enabled", "1"),
        ("telemetry_log_read_writes", "0"),
        ("telemetry_cpu_monitor_enabled", "0"),
        ("telemetry_track_ws_messages", "1"),
        ("telemetry_peak_hours_start", "18"),
        ("telemetry_peak_hours_end", "22"),
        ("telemetry_alert_on_high_load", "0"),
        # Database Performance & Vacuum (Tab 50)
        ("optimizer_vacuum_interval", "604800"),
        ("optimizer_compress_threshold", "10"),
        ("optimizer_index_optim", "1"),
        ("optimizer_auto_analyze", "1"),
        ("optimizer_wal_checkpoint_size", "1000"),
        ("optimizer_prune_logs_days", "15"),
        ("optimizer_prune_history_days", "180"),
        ("optimizer_backup_before_vacuum", "1"),
        ("optimizer_integrity_check", "1"),
        ("optimizer_last_vacuum_time", "0")
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

    # One-time migration to set force_draft_vips to "0" (to allow auto-reply to clients/deals by default)
    cursor.execute("SELECT value FROM settings WHERE key = 'migration_force_draft_vips_v2'")
    mig_row = cursor.fetchone()
    if not mig_row:
        cursor.execute("UPDATE settings SET value = '0' WHERE key = 'force_draft_vips'")
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_force_draft_vips_v2', '1')")
        
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

def update_contact(telegram_id, category=None, notes=None, relationship_summary=None, is_muted=None, custom_prompt=None, custom_delay=None):
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
    if custom_prompt is not None:
        fields.append("custom_prompt = ?")
        params.append(custom_prompt)
    if custom_delay is not None:
        # Save as NULL if None/negative, otherwise integer
        fields.append("custom_delay = ?")
        if custom_delay == -1 or custom_delay is None:
            params.append(None)
        else:
            params.append(int(custom_delay))
        
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
            
        # Active Days constraint check
        active_days_str = get_setting("active_days", "")
        if active_days_str:
            days_list = [d.strip().lower()[:3] for d in active_days_str.split(",") if d.strip()]
            if days_list:
                current_day = local_now.strftime("%a").lower()
                if current_day not in days_list:
                    return "sleeping"

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

def resolve_contact_id_by_identifier(identifier):
    """
    Resolves a contact's telegram_id from either a numeric string, username (with or without @), or raw integer.
    Returns integer telegram_id or None.
    """
    if not identifier:
        return None
    import re
    # If it is numeric
    id_str = str(identifier).strip().replace("@", "")
    if id_str.isdigit():
        return int(id_str)
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Search by username case-insensitively
        cursor.execute("SELECT telegram_id FROM contacts WHERE LOWER(username) = ?", (id_str.lower(),))
        row = cursor.fetchone()
        conn.close()
        if row:
            return row[0]
    except Exception as e:
        print(f"Error resolving contact identifier: {e}")
    return None

def vacuum_db():
    """Run SQLite VACUUM to compress and optimize database size, or no-op on Postgres."""
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        log_event("INFO", "Autovacuum is handled automatically on PostgreSQL.")
        return True
    try:
        conn = get_db_connection()
        conn.execute("VACUUM")
        conn.close()
        log_event("INFO", "SQLite database vacuumed and optimized successfully.")
        return True
    except Exception as e:
        log_event("ERROR", f"Failed to vacuum SQLite database: {e}")
        return False

def add_scheduled_task(telegram_id, category, message, send_at):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO scheduled_tasks (telegram_id, category, message, send_at, status)
        VALUES (?, ?, ?, ?, 'pending')
    """, (telegram_id, category, message, send_at))
    conn.commit()
    conn.close()

def get_all_scheduled_tasks():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scheduled_tasks ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_pending_scheduled_tasks(current_time):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM scheduled_tasks 
        WHERE status = 'pending' AND send_at <= ?
    """, (current_time,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_scheduled_task_status(task_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE scheduled_tasks SET status = ? WHERE id = ?", (status, task_id))
    conn.commit()
    conn.close()

def delete_scheduled_task(task_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scheduled_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()

def clear_all_event_logs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM logs")
    conn.commit()
    conn.close()


# --- Broadcast History Helpers ---
def log_broadcast_sent(category, message, recipient_count):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO broadcast_history (category, message, recipient_count, sent_at, status) VALUES (?, ?, ?, ?, ?)",
        (category, message, recipient_count, datetime.utcnow().isoformat(), "sent")
    )
    conn.commit()
    conn.close()

def get_broadcast_history(limit=50):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM broadcast_history ORDER BY sent_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Message Template Helpers ---
def get_message_templates():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM message_templates ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_message_template(name, content):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO message_templates (name, content, created_at) VALUES (?, ?, ?)",
        (name, content, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

def delete_message_template(template_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM message_templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()


# --- Contact Tags Helpers ---
def get_contact_tags(telegram_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT tag FROM contact_tags WHERE telegram_id = ?", (telegram_id,))
    rows = cursor.fetchall()
    conn.close()
    return [r[0] for r in rows]

def set_contact_tags(telegram_id, tags):
    """Replace all tags for a contact."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM contact_tags WHERE telegram_id = ?", (telegram_id,))
    for tag in tags:
        if tag.strip():
            cursor.execute(
                "INSERT INTO contact_tags (telegram_id, tag, created_at) VALUES (?, ?, ?)",
                (telegram_id, tag.strip(), datetime.utcnow().isoformat())
            )
    conn.commit()
    conn.close()


# --- System Backup/Restore Helpers ---
def get_all_settings_dict():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}

def restore_settings_from_dict(data: dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    for key, value in data.items():
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

def get_recent_login_events(limit=20):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM logs WHERE message LIKE '%login%' OR message LIKE '%Login%' OR message LIKE '%auth%' ORDER BY timestamp DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_table_row_counts():
    tables = ["contacts", "messages", "settings", "keyword_rules", "logs",
              "reminders", "qa_backup", "scheduled_tasks", "broadcast_history",
              "message_templates", "contact_tags", "custom_commands", "payment_methods",
              "deal_orders", "customer_licenses", "client_products", "client_orders",
              "joined_chats", "forwarding_rules", "userbot_proxies", "webhooks", "system_threats"]
    conn = get_db_connection()
    cursor = conn.cursor()
    counts = {}
    for t in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            counts[t] = cursor.fetchone()[0]
        except Exception:
            counts[t] = "n/a"
    conn.close()
    return counts


# --- Custom Commands Helpers ---
def get_custom_command(trigger_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, trigger_name, description, response_template, variables, created_at FROM custom_commands WHERE trigger_name = ?", (trigger_name.lower().strip(),))
        row = cursor.fetchone()
        if row:
            return {
                "id": row[0],
                "trigger_name": row[1],
                "description": row[2],
                "response_template": row[3],
                "variables": row[4],
                "created_at": row[5]
            }
        return None
    except Exception:
        return None
    finally:
        conn.close()

def get_all_custom_commands():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, trigger_name, description, response_template, variables, created_at FROM custom_commands ORDER BY trigger_name ASC")
        rows = cursor.fetchall()
        cmds = []
        for r in rows:
            cmds.append({
                "id": r[0],
                "trigger_name": r[1],
                "description": r[2],
                "response_template": r[3],
                "variables": r[4],
                "created_at": r[5]
            })
        return cmds
    except Exception:
        return []
    finally:
        conn.close()

def save_custom_command(trigger_name, description, response_template, variables):
    conn = get_db_connection()
    cursor = conn.cursor()
    trigger_clean = trigger_name.lower().strip()
    try:
        cursor.execute("SELECT id FROM custom_commands WHERE trigger_name = ?", (trigger_clean,))
        row = cursor.fetchone()
        created_at = datetime.utcnow().isoformat()
        if row:
            cursor.execute("""
                UPDATE custom_commands 
                SET description = ?, response_template = ?, variables = ?
                WHERE trigger_name = ?
            """, (description, response_template, variables, trigger_clean))
        else:
            cursor.execute("""
                INSERT INTO custom_commands (trigger_name, description, response_template, variables, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (trigger_clean, description, response_template, variables, created_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def delete_custom_command(cmd_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM custom_commands WHERE id = ?", (cmd_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


# --- Payment Methods Helpers ---
def get_payment_method_by_command(command_trigger):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, type, label, value, network, qr_image_path, command_trigger, enabled FROM payment_methods WHERE command_trigger = ? AND enabled = 1", (command_trigger.lower().strip(),))
        row = cursor.fetchone()
        if row:
            return {
                "id": row[0],
                "type": row[1],
                "label": row[2],
                "value": row[3],
                "network": row[4],
                "qr_image_path": row[5],
                "command_trigger": row[6],
                "enabled": row[7]
            }
        return None
    except Exception:
        return None
    finally:
        conn.close()

def get_all_payment_methods():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, type, label, value, network, qr_image_path, command_trigger, enabled FROM payment_methods ORDER BY id ASC")
        rows = cursor.fetchall()
        methods = []
        for r in rows:
            methods.append({
                "id": r[0],
                "type": r[1],
                "label": r[2],
                "value": r[3],
                "network": r[4],
                "qr_image_path": r[5],
                "command_trigger": r[6],
                "enabled": r[7]
            })
        return methods
    except Exception:
        return []
    finally:
        conn.close()

def save_payment_method(p_type, label, value, network, qr_image_path, command_trigger, enabled=1):
    conn = get_db_connection()
    cursor = conn.cursor()
    cmd_clean = command_trigger.lower().strip()
    try:
        cursor.execute("SELECT id FROM payment_methods WHERE command_trigger = ?", (cmd_clean,))
        row = cursor.fetchone()
        if row:
            cursor.execute("""
                UPDATE payment_methods 
                SET type = ?, label = ?, value = ?, network = ?, qr_image_path = ?, enabled = ?
                WHERE command_trigger = ?
            """, (p_type, label, value, network, qr_image_path, enabled, cmd_clean))
        else:
            cursor.execute("""
                INSERT INTO payment_methods (type, label, value, network, qr_image_path, command_trigger, enabled)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (p_type, label, value, network, qr_image_path, cmd_clean, enabled))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def delete_payment_method(pm_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM payment_methods WHERE id = ?", (pm_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


# --- Deal Orders Helpers ---
def get_deal_order(order_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT order_id, contact_id, contact_name, items, amount, currency, status, summary, thank_you_message, created_at, closed_at FROM deal_orders WHERE order_id = ?", (order_id,))
        row = cursor.fetchone()
        if row:
            return {
                "order_id": row[0],
                "contact_id": row[1],
                "contact_name": row[2],
                "items": row[3],
                "amount": row[4],
                "currency": row[5],
                "status": row[6],
                "summary": row[7],
                "thank_you_message": row[8],
                "created_at": row[9],
                "closed_at": row[10]
            }
        return None
    except Exception:
        return None
    finally:
        conn.close()

def get_all_deal_orders():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT order_id, contact_id, contact_name, items, amount, currency, status, summary, thank_you_message, created_at, closed_at FROM deal_orders ORDER BY created_at DESC")
        rows = cursor.fetchall()
        deals = []
        for r in rows:
            deals.append({
                "order_id": r[0],
                "contact_id": r[1],
                "contact_name": r[2],
                "items": r[3],
                "amount": r[4],
                "currency": r[5],
                "status": r[6],
                "summary": r[7],
                "thank_you_message": r[8],
                "created_at": r[9],
                "closed_at": r[10]
            })
        return deals
    except Exception:
        return []
    finally:
        conn.close()

def create_deal_order(order_id, contact_id, contact_name, items, amount, currency='USD'):
    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO deal_orders (order_id, contact_id, contact_name, items, amount, currency, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
        """, (order_id, contact_id, contact_name, items, amount, currency, created_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def close_deal_order(order_id, summary, thank_you_message):
    conn = get_db_connection()
    cursor = conn.cursor()
    closed_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            UPDATE deal_orders 
            SET status = 'closed', summary = ?, thank_you_message = ?, closed_at = ?
            WHERE order_id = ?
        """, (summary, thank_you_message, closed_at, order_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()


# --- Customer Licenses Helpers ---
def get_customer_license(license_key):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, license_key, client_telegram_id, client_name, store_name, expires_at, status, created_at FROM customer_licenses WHERE license_key = ?", (license_key.strip(),))
        row = cursor.fetchone()
        if row:
            return {
                "id": row[0],
                "license_key": row[1],
                "client_telegram_id": row[2],
                "client_name": row[3],
                "store_name": row[4],
                "expires_at": row[5],
                "status": row[6],
                "created_at": row[7]
            }
        return None
    except Exception:
        return None
    finally:
        conn.close()

def get_customer_license_by_client_id(client_telegram_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, license_key, client_telegram_id, client_name, store_name, expires_at, status, created_at FROM customer_licenses WHERE client_telegram_id = ?", (client_telegram_id,))
        row = cursor.fetchone()
        if row:
            return {
                "id": row[0],
                "license_key": row[1],
                "client_telegram_id": row[2],
                "client_name": row[3],
                "store_name": row[4],
                "expires_at": row[5],
                "status": row[6],
                "created_at": row[7]
            }
        return None
    except Exception:
        return None
    finally:
        conn.close()

def get_all_customer_licenses():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, license_key, client_telegram_id, client_name, store_name, expires_at, status, created_at FROM customer_licenses ORDER BY id DESC")
        rows = cursor.fetchall()
        licenses = []
        for r in rows:
            licenses.append({
                "id": r[0],
                "license_key": r[1],
                "client_telegram_id": r[2],
                "client_name": r[3],
                "store_name": r[4],
                "expires_at": r[5],
                "status": r[6],
                "created_at": r[7]
            })
        return licenses
    except Exception:
        return []
    finally:
        conn.close()

def create_customer_license(license_key, client_telegram_id, client_name, store_name, expires_at):
    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO customer_licenses (license_key, client_telegram_id, client_name, store_name, expires_at, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?)
        """, (license_key, client_telegram_id, client_name, store_name, expires_at, created_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def update_customer_license_status(license_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE customer_licenses SET status = ? WHERE id = ?", (status, license_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def delete_customer_license(license_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM customer_licenses WHERE id = ?", (license_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

# Client Products
def get_client_products(client_telegram_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, client_telegram_id, product_name, price, description, stock_count FROM client_products WHERE client_telegram_id = ?", (client_telegram_id,))
        rows = cursor.fetchall()
        products = []
        for r in rows:
            products.append({
                "id": r[0],
                "client_telegram_id": r[1],
                "product_name": r[2],
                "price": r[3],
                "description": r[4],
                "stock_count": r[5]
            })
        return products
    except Exception:
        return []
    finally:
        conn.close()

def add_client_product(client_telegram_id, product_name, price, description, stock_count):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO client_products (client_telegram_id, product_name, price, description, stock_count)
            VALUES (?, ?, ?, ?, ?)
        """, (client_telegram_id, product_name, price, description, stock_count))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def delete_client_product(product_id, client_telegram_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM client_products WHERE id = ? AND client_telegram_id = ?", (product_id, client_telegram_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

# Client Orders
def get_client_orders(client_telegram_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT co.id, co.client_telegram_id, co.buyer_telegram_id, co.buyer_name, co.product_id, cp.product_name, co.amount, co.status, co.created_at
            FROM client_orders co
            LEFT JOIN client_products cp ON co.product_id = cp.id
            WHERE co.client_telegram_id = ?
            ORDER BY co.created_at DESC
        """, (client_telegram_id,))
        rows = cursor.fetchall()
        orders = []
        for r in rows:
            orders.append({
                "id": r[0],
                "client_telegram_id": r[1],
                "buyer_telegram_id": r[2],
                "buyer_name": r[3],
                "product_id": r[4],
                "product_name": r[5] or "Unknown Product",
                "amount": r[6],
                "status": r[7],
                "created_at": r[8]
            })
        return orders
    except Exception:
        return []
    finally:
        conn.close()

def add_client_order(client_telegram_id, buyer_telegram_id, buyer_name, product_id, amount):
    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO client_orders (client_telegram_id, buyer_telegram_id, buyer_name, product_id, amount, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
        """, (client_telegram_id, buyer_telegram_id, buyer_name, product_id, amount, created_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def update_client_order_status(order_id, client_telegram_id, status):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE client_orders SET status = ? WHERE id = ? AND client_telegram_id = ?", (status, order_id, client_telegram_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

# --- Groups & Channels (GC) Joined Chats Helpers ---
def save_joined_chat(chat_id, title, username, chat_type):
    conn = get_db_connection()
    cursor = conn.cursor()
    from datetime import datetime
    joined_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO joined_chats (chat_id, title, username, type, whitelisted, joined_at)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title, username=excluded.username
        """, (chat_id, title, username, chat_type, joined_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def get_all_joined_chats():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM joined_chats ORDER BY joined_at DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()

def toggle_chat_whitelist(chat_id, whitelisted):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE joined_chats SET whitelisted = ? WHERE chat_id = ?", (whitelisted, chat_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def delete_joined_chat(chat_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM joined_chats WHERE chat_id = ?", (chat_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

# --- Auto-Forwarding Rules Helpers ---
def save_forwarding_rule(source_chat_id, target_chat_id, keywords, enabled=1):
    conn = get_db_connection()
    cursor = conn.cursor()
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO forwarding_rules (source_chat_id, target_chat_id, keywords, enabled, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (source_chat_id, target_chat_id, keywords, enabled, created_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def get_all_forwarding_rules():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM forwarding_rules ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()

def delete_forwarding_rule(rule_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM forwarding_rules WHERE id = ?", (rule_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

# --- Proxy Management Helpers ---
def save_proxy(proxy_type, addr, port, username, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    from datetime import datetime
    created_at = datetime.utcnow().isoformat()
    try:
        cursor.execute("""
            INSERT INTO userbot_proxies (type, addr, port, username, password, latency, status, created_at)
            VALUES (?, ?, ?, ?, ?, -1, 'untested', ?)
        """, (proxy_type, addr, port, username, password, created_at))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def get_all_proxies():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM userbot_proxies ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()

def update_proxy_test_result(proxy_id, status, latency):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE userbot_proxies SET status = ?, latency = ? WHERE id = ?", (status, latency, proxy_id))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def delete_proxy(proxy_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM userbot_proxies WHERE id = ?", (proxy_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def save_webhook(url, secret_token, events):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        created_at = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO webhooks (url, secret_token, events, created_at) VALUES (?, ?, ?, ?)",
            (url.strip(), secret_token.strip(), events.strip(), created_at)
        )
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def get_all_webhooks():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, url, secret_token, events, created_at FROM webhooks ORDER BY id DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()

def delete_webhook(webhook_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM webhooks WHERE id = ?", (webhook_id,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def log_threat(event_type, telegram_id, username, chat_id, details):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        timestamp = datetime.utcnow().isoformat()
        cursor.execute(
            "INSERT INTO system_threats (timestamp, event_type, telegram_id, username, chat_id, details) VALUES (?, ?, ?, ?, ?, ?)",
            (timestamp, event_type, telegram_id, username, chat_id, details)
        )
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def get_all_threats(limit=100):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, timestamp, event_type, telegram_id, username, chat_id, details FROM system_threats ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()

def clear_threats():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM system_threats")
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()
