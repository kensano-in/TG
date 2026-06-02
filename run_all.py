import subprocess
import sys
import os
import time
import signal

def run():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")
    
    print("==================================================")
    print("   Starting Verlyn Personal Telegram Manager   ")
    print("==================================================")
    
    processes = []
    try:
        # Start Backend Server
        print("[System] Starting Python FastAPI Backend...")
        backend_proc = subprocess.Popen(
            [sys.executable, "run.py"],
            cwd=backend_dir,
            shell=True
        )
        processes.append(backend_proc)
        
        # Give backend a moment to initialize database
        time.sleep(2)
        
        # Start Frontend Dev Server
        print("[System] Starting Vite Frontend Server...")
        frontend_proc = subprocess.Popen(
            "npm run dev",
            cwd=frontend_dir,
            shell=True
        )
        processes.append(frontend_proc)
        
        print("\n[Success] Both servers are running in parallel.")
        print("[Info] Control Dashboard is available at http://localhost:5173")
        print("[Info] Press Ctrl+C in this terminal to shutdown both services safely.\n")
        
        # Monitor processes
        while True:
            for p in processes:
                if p.poll() is not None:
                    print(f"\n[Warning] Process {p.pid} terminated unexpectedly. Shutting down...")
                    raise KeyboardInterrupt
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n[System] Gracefully shutting down all processes...")
        for p in processes:
            try:
                if os.name == 'nt':
                    # On Windows, taskkill is more reliable for subshells
                    subprocess.run(f"taskkill /F /T /PID {p.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
            except Exception:
                pass
        print("[System] Safe shutdown complete.")

if __name__ == "__main__":
    run()
