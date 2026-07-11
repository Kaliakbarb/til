totals = {}
for line in open("sales.csv").read().splitlines()[1:]:
    region, amount = line.split(",")
    totals[region] = totals.get(region, 0) + int(amount)
for region, total in totals.items():
    print(region, total)
