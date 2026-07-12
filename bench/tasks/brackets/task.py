def balanced(s):
    close = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in "([{":
            stack.append(c)
        elif c in close:
            if not stack or stack.pop() != close[c]:
                return False
    return not stack

for line in open("cases.txt"):
    print("ok" if balanced(line) else "bad")
