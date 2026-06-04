app_path = "frontend/src/App.jsx"

with open(app_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

lines = content.splitlines()

# Search for the tab rendering lines
import re
matches = []
for i, line in enumerate(lines):
    if re.search(r'activeTab\s*===\s*\'[a-zA-Z0-9_]+\'\s*&&\s*\(', line):
        matches.append((i+1, line.strip()))

print(f"Found {len(matches)} tab render conditions:")
for line_num, text in matches:
    # Print the line and the next 10 lines of code to inspect their contents
    print(f"\n--- Line {line_num}: {text} ---")
    for j in range(line_num, min(line_num + 15, len(lines))):
        print(f"  {j+1}: {lines[j]}")
