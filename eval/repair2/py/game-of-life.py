g = [[c == "#" for c in row] for row in open("grid.txt").read().splitlines()]
H, W = len(g), len(g[0])
for gen in range(5):
    ng = []
    for y in range(H):
        row = []
        for x in range(W):
            nb = 0
            for dy in [-1, 0, 1]:
                for dx in [-1, 0, 1]:
                    if (dx != 0 or dy != 0) and g[(y + dy) % H][(x + dx) % W]:
                        nb = nb + 1
            row.append(nb == 3 or (g[y][x] and nb == 2))
        ng.append(row)
    g = ng
for row in g:
    print("".join("#" if c else "." for c in row))
