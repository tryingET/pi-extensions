import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "ci", "packages.sh");

function expectedTopLevelPackageRoots() {
  return fs
    .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .filter((target) => fs.existsSync(path.join(ROOT, target, "package.json")))
    .sort();
}

function createFixture(t) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ci-packages-"));
  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const binDir = path.join(tmpRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const logPath = path.join(tmpRoot, "quality-gate-calls.log");
  const fakeBashPath = path.join(binDir, "bash");
  fs.writeFileSync(
    fakeBashPath,
    `#!/bin/sh
set -eu
if [ "$#" -ge 3 ] && [ "$1" = "${ROOT}/scripts/package-quality-gate.sh" ]; then
  printf '%s|%s\n' "$2" "$3" >> "$PI_CI_PACKAGES_LOG"
  exit 0
fi
exec /bin/bash "$@"
`,
    { encoding: "utf8", mode: 0o755 },
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    PI_CI_PACKAGES_LOG: logPath,
    PI_EXTENSIONS_TMPDIR: path.join(tmpRoot, "tmp"),
  };

  return {
    run(args = []) {
      return execFileSync("sh", [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    },
    readCalls() {
      if (!fs.existsSync(logPath)) return [];
      return fs
        .readFileSync(logPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    },
  };
}

test("default invocation still fans out to every top-level package root", (t) => {
  const fixture = createFixture(t);
  fixture.run();

  assert.deepEqual(
    fixture.readCalls(),
    expectedTopLevelPackageRoots().map((target) => `ci|${target}`),
  );
});

test("explicit package targets limit fan-out and accept bare names or package paths", (t) => {
  const fixture = createFixture(t);
  const output = fixture.run([
    "ci",
    "--package",
    "pi-autoresearch",
    "--package",
    "packages/pi-society-orchestrator",
  ]);

  assert.match(output, /==> package root check: packages\/pi-autoresearch \[ci\]/);
  assert.match(output, /==> package root check: packages\/pi-society-orchestrator \[ci\]/);
  assert.deepEqual(fixture.readCalls(), [
    "ci|packages/pi-autoresearch",
    "ci|packages/pi-society-orchestrator",
  ]);
});

test("explicit target preserves the requested stage", (t) => {
  const fixture = createFixture(t);
  fixture.run(["test", "--target=packages/pi-autoresearch"]);

  assert.deepEqual(fixture.readCalls(), ["test|packages/pi-autoresearch"]);
});

test("explicit targets are incompatible with staged-only discovery", (t) => {
  const fixture = createFixture(t);

  assert.throws(
    () => fixture.run(["pre-commit", "--staged-only", "--package", "pi-autoresearch"]),
    /--staged-only cannot be combined with explicit package targets/,
  );
});
