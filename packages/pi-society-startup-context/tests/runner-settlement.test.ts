import assert from "node:assert/strict";
import test from "node:test";
import { runCommand, scanOwnedGroup } from "../src/command-runner.ts";

test("closed output pipes do not settle a live direct child", async () => {
  const result = await runCommand(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM',()=>{});process.stdout.destroy();process.stderr.destroy();setInterval(()=>{},1000)",
    ],
    { timeoutMs: 300 },
  );
  assert.equal(result.reason, "timeout");
  assert.equal(result.cleanup, "settled");
  assert.ok(result.elapsedMs >= 500);
});

test(
  "a transient group observation failure is not permanent cleanup failure once settlement is proven",
  { skip: process.platform !== "linux" },
  async () => {
    let observations = 0;
    const result = await runCommand(
      process.execPath,
      ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      {
        timeoutMs: 200,
        scanGroup: (group, start) => {
          if (++observations === 1) throw new Error("temporarily unavailable");
          return scanOwnedGroup(group, start);
        },
      },
    );
    assert.equal(result.reason, "timeout");
    assert.equal(result.cleanup, "settled");
    assert.ok(observations > 1);
  },
);
