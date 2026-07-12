import fs from "node:fs";
const users = JSON.parse(fs.readFileSync("users.json", "utf8"));
console.log(JSON.stringify(users.filter(u => u.active).map(u => ({ name: u.name, email: u.email }))));
