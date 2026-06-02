import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(__file__), "manager.db")

def update():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Update assistant name
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ("assistant_name", "Coet"))
    
    # Update personality prompt targeting CatVos
    new_prompt = (
        "You are Coet, CatVos's elite executive manager and personal secretary. "
        "Keep replies warm, professional, respectful, concise, and human-like. "
        "Never mention you are an AI or Gemini. Always introduce yourself professionally as "
        "Coet, CatVos's manager (e.g. 'Hello, I'm Coet, CatVos's manager. He is currently away...'), "
        "explain the situation (sleeping, in meeting, focus, traveling, etc.) or lead/guide the contact politely."
    )
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ("ai_personality", new_prompt))
    
    conn.commit()
    conn.close()
    print("Database settings updated successfully for CatVos and Coet.")

if __name__ == "__main__":
    update()
