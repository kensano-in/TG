css_path = "frontend/src/index.css"

with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.read().splitlines()

# Search for .sidebar rule
found = False
for i, line in enumerate(lines):
    if '.sidebar' in line:
        print(f"Line {i+1}:")
        # Print 40 lines around it
        for j in range(max(0, i-2), min(len(lines), i+30)):
            print(f"  {j+1}: {lines[j]}")
        found = True
        print("--------------------")

if not found:
    print("No .sidebar rule found.")
