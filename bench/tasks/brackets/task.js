import fs from "node:fs";
function balanced(s) {
  const close = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const c of s) {
    if ("([{".includes(c)) stack.push(c);
    else if (c in close) {
      if (stack.pop() !== close[c]) return false;
    }
  }
  return stack.length === 0;
}
for (const line of fs.readFileSync("cases.txt", "utf8").split("\n").slice(0, -1))
  console.log(balanced(line) ? "ok" : "bad");
