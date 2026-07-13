s = open("brackets.txt").read().strip()
best = 0
stack = [-1]
for i, c in enumerate(s):
    if c == "(":
        stack.append(i)
    else:
        stack.pop()
        if not stack:
            stack.append(i)
        elif i - stack[-1] > best:
            best = i - stack[-1]
print(best)
