import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key starting with: {api_key[:8] if api_key else 'None'}")

genai.configure(api_key=api_key)

try:
    print("--- Listing Models ---")
    for m in genai.list_models():
        print(f"Model: {m.name} - methods: {m.supported_generation_methods}")
except Exception as e:
    print(f"Error listing models: {e}")
