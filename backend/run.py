import uvicorn
import os
import sys
import asyncio

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
    port = int(os.getenv("PORT", 8000))
    # We load app using string notation
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
