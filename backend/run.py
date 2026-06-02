import uvicorn
import os

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    # We load app using string notation
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
