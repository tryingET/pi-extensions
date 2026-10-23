// ---
// summary: "challenges the replay oracle using isolated production-defect mechanism mutations"
// read_when:
//   - "qualifying generated ownership tests before a structural refactor"
// ---

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHILD_TEST_TIMEOUT_MS,
  detectedNamedFailure,
  runOwnershipWorker,
} from "./ownership-oracle-checks.mjs";

const defaultSourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const mutations = [
  { name: "control" },
  {
    name: "publisher-order",
    file: "src/native/interaction-context.mjs",
    before: "].sort();",
    after: "];",
    expected: "Scenario: oracle boundary hover reorder",
  },
  {
    name: "own-release",
    file: "src/native/panel-projection.mjs",
    before: "generation === intentGeneration &&",
    after: "visibility.isEligible() && generation === intentGeneration &&",
    expected: "Scenario: oracle boundary hover reorder",
  },
  {
    name: "duplicate-consumption",
    file: "src/native/panel-projection.mjs",
    before: "focusWindowId === null ||\n        consumedJumpRequest === request",
    after: "focusWindowId === null",
    expected: "Scenario: duplicate hover Enter before release cannot consume the intent twice",
  },
];
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// The injectable source/scratch roots let regression tests exercise the real copy/mutate/run/report
// pipeline without changing production or the active runtime.
export function runOwnershipChallenges({
  sourceRoot = defaultSourceRoot,
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ak7417-oracle-challenge-")),
  timeout = CHILD_TEST_TIMEOUT_MS,
} = {}) {
  fs.mkdirSync(scratch, { recursive: true });
  const report = { sourceRoot, scratch, checks: [] };
  for (const mutation of mutations) {
    const root = path.join(scratch, mutation.name);
    fs.mkdirSync(path.join(root, "tests/support"), { recursive: true });
    fs.cpSync(path.join(sourceRoot, "src"), path.join(root, "src"), { recursive: true });
    for (const file of [
      "tests/generated-ownership.test.mjs",
      "tests/support/production-panel-fixture.mjs",
      "tests/support/ownership-oracle-checks.mjs",
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
    const { output, ...worker } = runOwnershipWorker({
      root,
      tapPath: path.join(scratch, `${mutation.name}.tap`),
      timeout,
    });
    const check = {
      name: mutation.name,
      ...worker,
      detected: Boolean(
        mutation.expected && detectedNamedFailure({ ...worker, output }, mutation.expected),
      ),
      expected: mutation.expected,
      originalSha256,
      mutatedSha256: mutation.file ? digest(path.join(root, mutation.file)) : undefined,
      testSha256: digest(path.join(root, "tests/generated-ownership.test.mjs")),
      helperSha256: digest(path.join(root, "tests/support/ownership-oracle-checks.mjs")),
    };
    report.checks.push(check);
    // Retain diagnostics before any assertion, including runner errors and deadlines.
    fs.writeFileSync(path.join(scratch, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    assert.ok(check.completed, `worker did not complete: ${mutation.name}; see ${scratch}`);
    if (mutation.name === "control") assert.equal(check.status, 0, output);
    else
      assert.ok(
        check.detected,
        `named mechanism must fail: ${mutation.name}; see ${check.tapPath}`,
      );
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(runOwnershipChallenges(), null, 2));
