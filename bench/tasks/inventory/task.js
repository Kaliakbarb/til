import fs from "node:fs";
const old = JSON.parse(fs.readFileSync("old.json", "utf8"));
const cur = JSON.parse(fs.readFileSync("new.json", "utf8"));
for (const [k, v] of Object.entries(cur)) if (!(k in old)) console.log(`+ ${k} ${v}`);
for (const k of Object.keys(old)) if (!(k in cur)) console.log(`- ${k}`);
for (const [k, v] of Object.entries(old)) if (k in cur && cur[k] !== v) console.log(`~ ${k} ${v}->${cur[k]}`);
