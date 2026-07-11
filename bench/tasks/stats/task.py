import statistics

xs = sorted(float(l) for l in open("numbers.txt"))
n = len(xs)
print("count", n)
print("mean", round(sum(xs) / n, 2))
print("median", round(statistics.median(xs), 2))
print("stdev", round(statistics.pstdev(xs), 2))
