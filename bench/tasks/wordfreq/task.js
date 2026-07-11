import fs from "node:fs";
const words = fs.readFileSync("input.txt", "utf8").toLowerCase().split(/\s+/).filter(Boolean);
const counts = new Map();
for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
[...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([w, n]) => console.log(w, n));
