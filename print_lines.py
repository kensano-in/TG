app_path = "frontend/src/App.jsx"

with open(app_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.read().splitlines()

for i in range(29, 45):
    print(f"{i+1}: {lines[i]}")
