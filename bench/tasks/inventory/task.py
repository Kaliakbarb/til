import json

old = json.load(open("old.json"))
new = json.load(open("new.json"))
for k, v in new.items():
    if k not in old:
        print(f"+ {k} {v}")
for k in old:
    if k not in new:
        print(f"- {k}")
for k, v in old.items():
    if k in new and new[k] != v:
        print(f"~ {k} {v}->{new[k]}")
