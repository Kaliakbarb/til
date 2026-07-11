from collections import Counter

text = open("input.txt").read().lower()
for word, n in Counter(text.split()).most_common(5):
    print(word, n)
