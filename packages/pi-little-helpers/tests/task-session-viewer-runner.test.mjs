import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detachedViewerRunner } from "../dist/task-session/launch.js";

// AK5482 canary A: the viewer terminal stays in the foreground until its window closes. The old
// runner waited for its exit with a 4 s timeout, so every real window was killed and the launch
// reported transport_effect_indeterminate although the viewer had already signalled ready.
test("viewer runner returns once the terminal starts and leaves it running", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "viewer-runner-"));
  const marker = join(dir, "still-running");
  const started = Date.now();
  const result = await detachedViewerRunner("/bin/sh", ["-c", `sleep 1; echo ok > '${marker}'`], {
    cwd: dir,
  });
  assert.deepEqual(result, { code: 0, killed: false });
  assert.ok(Date.now() - started < 500, "the runner waited for the terminal to exit");
  assert.ok(!existsSync(marker));
  await new Promise((r) => setTimeout(r, 2000));
  assert.ok(existsSync(marker), "the started terminal was killed");
});

test("viewer runner reports a terminal that cannot start", async () => {
  const result = await detachedViewerRunner("/nonexistent/terminal", [], { cwd: "/" });
  assert.deepEqual(result, { code: 1, killed: false });
});
