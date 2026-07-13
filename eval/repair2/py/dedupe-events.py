latest = {}
for l in open("events.txt").read().splitlines():
    p = l.split()
    ts = int(p[1])
    if p[0] not in latest or ts >= latest[p[0]]:
        latest[p[0]] = ts
print(len(latest))
print(sum(latest.values()))
