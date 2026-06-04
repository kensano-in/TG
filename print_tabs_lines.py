app_path = "frontend/src/App.jsx"

with open(app_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.read().splitlines()

for idx in range(11300, min(11460, len(lines))):
    print(f"{idx+1}: {lines[idx]}")
