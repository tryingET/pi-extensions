// Unshipped relocation of OS-home, desktop transport and supervisor resources ONLY.
// Actual public core, compatibility, descriptor, readonly owner plan and native admission are used.
import cp from "node:child_process";
import fs, { appendFileSync, readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { join } from "node:path";

const root = process.env.TASK5480_FIXTURE_ROOT,
  c = JSON.parse(readFileSync(join(root, "public-fixture.json")));
const account = os.userInfo();
os.userInfo = () => ({ ...account, homedir: c.home });
const spawn = cp.spawn,
  execFile = cp.execFile;
cp.spawn = (command, args, options) => {
  appendFileSync(
    join(root, "public-ports.jsonl"),
    `${JSON.stringify({ operation: "spawn", command, args })}\n`,
  );
  if (
    command === c.gate &&
    JSON.stringify(args) === JSON.stringify(["--", "task-session", "supervise"])
  )
    return spawn(
      "/usr/bin/python3",
      ["-I", "-B", join(import.meta.dirname, "supervisor.py"), root],
      { ...options, env: { ...options.env, TASK5480_FIXTURE_ROOT: root } },
    );
  throw Error("unapproved_fixture_spawn");
};
cp.execFile = (command, args, options, callback) => {
  appendFileSync(
    join(root, "public-ports.jsonl"),
    `${JSON.stringify({ operation: "execFile", command, args })}\n`,
  );
  if (command === "/usr/bin/ghostty")
    return execFile(
      "/usr/bin/python3",
      ["-I", "-B", join(import.meta.dirname, "viewer.py"), root, args.at(-1)],
      { ...options, env: { ...options.env, TASK5480_FIXTURE_ROOT: root } },
      callback,
    );
  if (
    command === c.gate &&
    JSON.stringify(args.slice(0, 2)) === JSON.stringify(["--", "task-session"]) &&
    ["describe", "plan"].includes(args[2])
  )
    return execFile(command, args, options, callback);
  throw Error("unapproved_fixture_exec");
};
globalThis.fetch = () => {
  throw Error("controller_provider_forbidden");
};
// Audit only: owner subprocesses may read their policy; the Pi consumer must not.
for (const key of ["readFileSync", "openSync"]) {
  const original = fs[key];
  fs[key] = function (path, ...args) {
    const value = path instanceof URL ? path.pathname : String(path);
    if (
      value === join(c.owner, "policy/ak-runtime-access.json") ||
      value.startsWith(c.databasePath)
    )
      throw Error("consumer_owner_storage_read_forbidden");
    return original.call(this, path, ...args);
  };
}
syncBuiltinESMExports();
