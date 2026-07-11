import fs from "node:fs";
const totals = new Map();
for (const line of fs.readFileSync("sales.csv", "utf8").trim().split("\n").slice(1)) {
  const [region, amount] = line.split(",");
  totals.set(region, (totals.get(region) || 0) + Number(amount));
}
for (const [region, total] of totals) console.log(region, total);
