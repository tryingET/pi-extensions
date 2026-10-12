import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../scripts/reality-check.mjs", import.meta.url));
function run(...args) {
  const env = { ...process.env };
  delete env.ASC_TABS_LIVE;
  // This is an independent CLI, not a nested Node test-runner IPC child.
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [runner, ...args], { env, encoding: "utf8" });
}
test("Given one exact reality file, When selected without live authorization, Then only its guarded assertion skips without dispatch", () => {
  const result = run("--only=subagent-attachments.reality.live.mjs");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /running 1 assertion/);
  assert.match(result.stdout, /requires explicit ASC_TABS_LIVE=1/);
  assert.doesNotMatch(result.stdout, /reality: every recognized live Pi controller/);
});
for (const args of [
  ["--only=missing.reality.live.mjs"],
  ["--only=../subagent-attachments.reality.live.mjs"],
  ["--only=subagent-attachments.reality.live.mjs", "--only=another.reality.live.mjs"],
  ["--eval=throw new Error()"],
]) {
  test(`Given invalid exact-file selection ${JSON.stringify(args)}, When run, Then refuse before any reality assertion`, () => {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /running \d+ assertion/);
  });
}
