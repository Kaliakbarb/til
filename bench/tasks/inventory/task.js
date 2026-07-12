import fs from "node:fs";
const old = JSON.parse(fs.readFileSync("old.json", "utf8"));
const cur = JSON.parse(fs.readFileSync("new.json", "utf8"));
for (const k in cur) if (!(k in old)) console.log("+", k, cur[k]);
for (const k in old) if (!(k in cur)) console.log("-", k);
for (const k in old) if (k in cur && cur[k] !== old[k]) console.log(`~ ${k} ${old[k]}->${cur[k]}`);
