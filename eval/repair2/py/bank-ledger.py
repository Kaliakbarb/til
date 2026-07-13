bal = {}
order = []
rejected = 0
for t in open("txns.txt").read().splitlines():
    p = t.split()
    k, a, m = p[0], p[1], int(p[2])
    if a not in bal:
        bal[a] = 0
        order.append(a)
    if k == "deposit":
        bal[a] = bal[a] + m
    elif bal[a] >= m:
        bal[a] = bal[a] - m
    else:
        rejected = rejected + 1
for a in order:
    print(f"{a} {bal[a]}")
print(f"rejected {rejected}")
