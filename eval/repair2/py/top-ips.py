tot = {}
order = []
for l in open("traffic.txt").read().splitlines():
    p = l.split()
    if p[0] not in tot:
        tot[p[0]] = 0
        order.append(p[0])
    tot[p[0]] = tot[p[0]] + int(p[1])
top3 = sorted(order, key=lambda ip: -tot[ip])[:3]
for ip in top3:
    print(f"{ip} {tot[ip]}")
