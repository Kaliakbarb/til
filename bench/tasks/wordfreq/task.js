import fs from "node:fs";
const counts = {};
for (const w of fs.readFileSync("input.txt", "utf8").trim().toLowerCase().split(/\s+/)) counts[w] = (counts[w] || 0) + 1;
Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([w, n]) => console.log(w, n));
