import json

users = json.load(open("users.json"))
active = [{"name": u["name"], "email": u["email"]} for u in users if u["active"]]
print(json.dumps(active, separators=(",", ":")))
