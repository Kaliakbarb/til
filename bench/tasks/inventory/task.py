import json

old = json.load(open("old.json"))
new = json.load(open("new.json"))
for k in new:
    if k not in old:
        print("+", k, new[k])
for k in old:
    if k not in new:
        print("-", k)
for k in old:
    if k in new and new[k] != old[k]:
        print(f"~ {k} {old[k]}->{new[k]}")
