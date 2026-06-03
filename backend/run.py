import uvicorn
import os
import sys
import asyncio

if __name__ == "__main__":
    # Auto-adjust path and working directory to resolve module loading on Render
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    try:
        os.chdir(backend_dir)
    except Exception:
        pass

    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    port = int(os.getenv("PORT", 8000))
    # We load app using string notation
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
