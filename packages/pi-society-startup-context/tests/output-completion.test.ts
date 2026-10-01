import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand } from "../src/command-runner.ts";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const identity = (pid: number) => {
  try {
    const value = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = value.slice(value.lastIndexOf(")") + 2).split(" ");
    return { start: fields[19], state: fields[0] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

test("success waits for both streams to complete, retaining large bounded output", async () => {
  const result = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('x'.repeat(900000));process.stderr.write('stderr complete')",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.stdout.length, 900_000);
  assert.equal(result.stderr, "stderr complete");
});

test(
  "owned group settlement cannot turn an incomplete inherited output stream into transport success",
  { skip: process.platform !== "linux" },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "society-output-"));
    const ready = join(root, "ready");
    let escaped: { pid: number; start: string } | undefined;
    let pending: ReturnType<typeof runCommand> | undefined;
    try {
      const leaf = `const fs=require('fs');const s=fs.readFileSync('/proc/self/stat','utf8');fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,start:s.slice(s.lastIndexOf(')')+2).split(' ')[19]}));setInterval(()=>{},1000)`;
      const leader = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{detached:true,stdio:'inherit'}).unref();const t=setInterval(()=>{if(require('fs').existsSync(${JSON.stringify(ready)})){clearInterval(t);process.stdout.write('{}');}},5)`;
      pending = runCommand(process.execPath, ["-e", leader], { drainTimeoutMs: 50 });
      for (let i = 0; i < 160 && !existsSync(ready); i++) await pause(25);
      assert.ok(existsSync(ready));
      escaped = JSON.parse(readFileSync(ready, "utf8"));
      const result = await pending;
      assert.equal(result.ok, false);
      assert.equal(result.reason, "output_incomplete");
      assert.equal(result.cleanup, "settled", "receipt describes only the original owned group");
      assert.equal(result.stdout, "{}");
    } finally {
      if (
        escaped &&
        identity(escaped.pid)?.start === escaped.start &&
        !["Z", "X"].includes(identity(escaped.pid)?.state || "")
      )
        process.kill(escaped.pid, "SIGKILL");
      await pending;
      if (escaped)
        for (let i = 0; i < 100; i++) {
          const value = identity(escaped.pid);
          if (!value || ["Z", "X"].includes(value.state)) break;
          await pause(20);
        }
      rmSync(root, { recursive: true, force: true });
    }
  },
);
