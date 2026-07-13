rv = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
def rom(s):
    tot = 0
    for i, c in enumerate(s):
        v = rv[c]
        if i + 1 < len(s) and rv[s[i + 1]] > v:
            tot = tot - v
        else:
            tot = tot + v
    return tot
rs = open("roman.txt").read().splitlines()
for r in rs:
    print(f"{r} {rom(r)}")
print(f"sum {sum(rom(r) for r in rs)}")
