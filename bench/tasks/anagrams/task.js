import fs from "node:fs";
const groups = new Map();
for (const w of fs.readFileSync("words.txt", "utf8").split(/\s+/).filter(Boolean)) {
  const key = [...w].sort().join("");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(w);
}
for (const g of groups.values()) if (g.length > 1) console.log(g.join(" "));
