import json

users = json.load(open("users.json"))
print(json.dumps([{"name": u["name"], "email": u["email"]} for u in users if u["active"]], separators=(",", ":")))
