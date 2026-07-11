lines = [l.strip() for l in open("messy.txt")]
kept = [l for l in lines if l and not l.startswith("#")]
for line in sorted(set(kept)):
    print(line)
