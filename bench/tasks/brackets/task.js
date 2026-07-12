import fs from "node:fs";
function balanced(s) {
  const close = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const c of s) {
    if ("([{".includes(c)) stack.push(c);
    else if (c in close && stack.pop() !== close[c]) return false;
  }
  return !stack.length;
}
for (const line of fs.readFileSync("cases.txt", "utf8").trim().split("\n"))
  console.log(balanced(line) ? "ok" : "bad");
