import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("orchestrator builds its adapter export from a clean standalone source package", (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "adapter standalone "));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const original = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(original.scripts.prepack, /^npm run task-session:build && /);
  const script = original.scripts["task-session:build"];
  assert.equal(script, "node scripts/task-session-build.mjs");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
  for (const relative of [
    "scripts/task-session-build.mjs",
    "src/runtime/task-session-adapter.ts",
    "src/runtime/task-session-protocol-v1.json",
    "src/runtime/task-session-deployment-v1.json",
  ]) {
    mkdirSync(dirname(join(scratch, relative)), { recursive: true });
    cpSync(join(root, relative), join(scratch, relative));
  }
  // Use the locked local toolchain, but no sibling package or prior build output.
  symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "dir");
  const run = spawnSync(process.execPath, [join(scratch, "scripts/task-session-build.mjs")], {
    cwd: scratch,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  for (const name of ["protocol", "deployment"]) {
    assert.deepEqual(
      readFileSync(join(scratch, `dist/task-session/task-session-${name}-v1.json`)),
      readFileSync(join(root, `src/runtime/task-session-${name}-v1.json`)),
    );
  }
  const loaded = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {taskSessionAdapterIdentity as i} from "./dist/task-session/task-session-adapter.js"; if (i.configurationRequired !== true) process.exit(1);',
    ],
    { cwd: scratch, encoding: "utf8" },
  );
  assert.equal(loaded.status, 0, loaded.stderr);
});
