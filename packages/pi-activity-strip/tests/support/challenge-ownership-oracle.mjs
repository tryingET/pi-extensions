// ---
// summary: "challenges the replay oracle using isolated production-defect mechanism mutations"
// read_when:
//   - "qualifying generated ownership tests before a structural refactor"
// ---

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ak7417-oracle-challenge-"));
const mutations = [
  { name: "control" },
  {
    name: "publisher-order",
    file: "src/native/interaction-context.mjs",
    before: "].sort();",
    after: "];",
    expected: "oracle boundary hover reorder",
  },
  {
    name: "own-release",
    file: "src/native/panel-projection.mjs",
    before: "generation === intentGeneration &&",
    after: "visibility.isEligible() && generation === intentGeneration &&",
    expected: "oracle boundary hover reorder",
  },
  {
    name: "duplicate-consumption",
    file: "src/native/panel-projection.mjs",
    before: "focusWindowId === null ||\n        consumedJumpRequest === request",
    after: "focusWindowId === null",
    expected: "duplicate hover Enter before release",
  },
];
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = { sourceRoot, scratch, checks: [] };
for (const mutation of mutations) {
  const root = path.join(scratch, mutation.name);
  fs.mkdirSync(path.join(root, "tests/support"), { recursive: true });
  fs.cpSync(path.join(sourceRoot, "src"), path.join(root, "src"), { recursive: true });
  for (const file of [
    "tests/generated-ownership.test.mjs",
    "tests/support/production-panel-fixture.mjs",
  ])
    fs.copyFileSync(path.join(sourceRoot, file), path.join(root, file));
  let originalSha256;
  if (mutation.file) {
    const file = path.join(root, mutation.file);
    const original = fs.readFileSync(file, "utf8");
    originalSha256 = digest(file);
    assert.equal(original.split(mutation.before).length, 2, `unique mutation: ${mutation.name}`);
    fs.writeFileSync(file, original.replace(mutation.before, mutation.after));
  }
  const env = { ...process.env };
  delete env.PI_ACTIVITY_STRIP_REPLAY_SEED;
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", "tests/generated-ownership.test.mjs"],
    {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.ifError(result.error);
  const output = `${result.stdout}${result.stderr}`;
  const tapPath = path.join(scratch, `${mutation.name}.tap`);
  fs.writeFileSync(tapPath, output);
  const check = {
    name: mutation.name,
    status: result.status,
    tapPath,
    originalSha256,
    mutatedSha256: mutation.file ? digest(path.join(root, mutation.file)) : undefined,
    testSha256: digest(path.join(root, "tests/generated-ownership.test.mjs")),
    failures: Number(output.match(/^# fail (\d+)$/m)?.[1] ?? -1),
  };
  report.checks.push(check);
  fs.writeFileSync(path.join(scratch, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (mutation.name === "control") assert.equal(result.status, 0, output);
  else {
    assert.equal(result.status, 1, `mutation must be detected: ${mutation.name}`);
    assert.ok(output.includes(mutation.expected), "required mechanism scenario executed");
    assert.ok(check.failures > 0);
    assert.doesNotMatch(
      output,
      /MODULE_NOT_FOUND|SyntaxError:/,
      "behavioral failure, not broken runner",
    );
  }
}
console.log(JSON.stringify(report, null, 2));
