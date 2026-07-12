import fs from "node:fs";
const lines = fs.readFileSync("messy.txt", "utf8").split("\n").map(l => l.trim());
console.log([...new Set(lines.filter(l => l && !l.startsWith("#")))].sort().join("\n"));
