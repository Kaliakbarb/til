import fs from "node:fs";
const groups = {};
for (const w of fs.readFileSync("words.txt", "utf8").trim().split(/\s+/)) (groups[[...w].sort().join("")] ??= []).push(w);
for (const g of Object.values(groups)) if (g.length > 1) console.log(g.join(" "));
