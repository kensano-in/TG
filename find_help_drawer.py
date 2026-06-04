app_path = "frontend/src/App.jsx"

with open(app_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.read().splitlines()

# Search for helpOpen or similar
help_idx = -1
for i, line in enumerate(lines):
    if 'helpOpen' in line:
        if i > 8000: # Usually towards the end
            help_idx = i
            break

if help_idx != -1:
    print(f"Help Drawer starts around line {help_idx + 1}")
    for j in range(max(0, help_idx - 10), min(len(lines), help_idx + 40)):
        print(f"{j+1}: {lines[j]}")
else:
    print("Could not find Help Drawer check.")
