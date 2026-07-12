from statistics import mean, median, pstdev

xs = [float(l) for l in open("numbers.txt")]
print("count", len(xs))
print("mean", round(mean(xs), 2))
print("median", round(median(xs), 2))
print("stdev", round(pstdev(xs), 2))
