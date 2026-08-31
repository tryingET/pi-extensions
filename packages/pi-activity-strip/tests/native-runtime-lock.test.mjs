// ---
// summary: "proves concurrent native-runtime starts admit exactly one flock owner"
// read_when:
//   - "changing native singleton launch or broker socket ownership"
// ---

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runContender(lockPath, receiptPath) {
  const script = [
    'const fs = require("node:fs");',
    `fs.appendFileSync(${JSON.stringify(receiptPath)}, process.pid + "\\n");`,
    "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);",
  ].join("");
  const child = spawn("flock", ["--nonblock", lockPath, process.execPath, "-e", script], {
    stdio: "ignore",
  });
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

test("flock singleton cannot unlink or replace a live concurrent owner", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-activity-native-lock-"));
  const lockPath = path.join(root, "runtime.lock");
  const receiptPath = path.join(root, "owners.txt");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const results = await Promise.all(
    Array.from({ length: 12 }, () => runContender(lockPath, receiptPath)),
  );
  const owners = fs.readFileSync(receiptPath, "utf8").trim().split("\n").filter(Boolean);

  assert.equal(owners.length, 1);
  assert.equal(results.filter((code) => code === 0).length, 1);
});
