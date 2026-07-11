groups = {}
for w in open("words.txt").read().split():
    groups.setdefault("".join(sorted(w)), []).append(w)
for g in groups.values():
    if len(g) > 1:
        print(" ".join(g))
