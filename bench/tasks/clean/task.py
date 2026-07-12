print(*sorted({l.strip() for l in open("messy.txt") if l.strip() and not l.startswith("#")}), sep="\n")
