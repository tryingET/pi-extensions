import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { native } from "../../../dist/task-session/native.js";

const root = process.argv[2];
native().adoptCustody();
const flags = [0, 1].map((fd) =>
  Number.parseInt(/flags:\s*([0-7]+)/.exec(readFileSync(`/proc/self/fdinfo/${fd}`, "utf8"))[1], 8),
);
const child = spawnSync("/bin/sh", ["-c", "readlink /proc/self/fd/0; readlink /proc/self/fd/1"], {
  encoding: "utf8",
});
writeFileSync(
  join(root, "adopted.json"),
  JSON.stringify({ pid: process.pid, flags, child: child.stdout }),
  { mode: 0o600 },
);
writeSync(0, Buffer.from("a"));
const timer = setInterval(() => {
  if (existsSync(join(root, "release"))) {
    native().closeCustody();
    clearInterval(timer);
    writeFileSync(join(root, "closed"), "closed");
  }
}, 10);
setTimeout(() => {
  clearInterval(timer);
}, 10000).unref();
