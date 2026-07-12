from collections import Counter

for word, n in Counter(open("input.txt").read().lower().split()).most_common(5):
    print(word, n)
