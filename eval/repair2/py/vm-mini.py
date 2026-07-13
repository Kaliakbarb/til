st = []
for line in open("ops.txt").read().splitlines():
    p = line.split()
    op = p[0]
    if op == "PUSH":
        st.append(int(p[1]))
    elif op == "DUP":
        st.append(st[-1])
    elif op == "SWAP":
        st[-1], st[-2] = st[-2], st[-1]
    else:
        b, a = st.pop(), st.pop()
        if op == "ADD":
            st.append(a + b)
        elif op == "MUL":
            st.append(a * b)
        elif op == "SUB":
            st.append(a - b)
print(st[-1])
