import fs from "node:fs";
const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
const active = users.filter(u => u.active).map(u => ({ name: u.name, email: u.email }));
console.log(JSON.stringify(active));
