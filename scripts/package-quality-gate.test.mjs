import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "package-quality-gate.sh");

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createFixture(t, { privatePackage = false, releaseCheckQuick = false } = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-package-gate-"));
  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const binDir = path.join(tmpRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  const logPath = path.join(tmpRoot, "npm-calls.log");
  const quickMarkerPath = path.join(tmpRoot, "quick-release-ran");
  const packMarkerPath = path.join(tmpRoot, "pack-fallback-ran");
  const fakeNpmPath = path.join(binDir, "npm");
  fs.writeFileSync(
    fakeNpmPath,
    `#!/bin/sh
set -eu
printf '%s|%s\n' "$PWD" "$*" >> "$FAKE_NPM_LOG"
if [ "$#" -ge 2 ] && [ "$1" = "run" ] && [ "$2" = "release:check:quick" ]; then
  : > "$FAKE_NPM_QUICK_MARK"
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = "pack" ] && [ "$2" = "--dry-run" ]; then
  : > "$FAKE_NPM_PACK_MARK"
  exit 0
fi
echo "unexpected npm invocation: $*" >&2
exit 1
`,
    { encoding: "utf8", mode: 0o755 },
  );

  const packageDir = path.join(tmpRoot, "package-under-test");
  fs.mkdirSync(packageDir, { recursive: true });

  const scripts = {};
  if (releaseCheckQuick) {
    scripts["release:check:quick"] = "node -e \"process.exit(0)\"";
  }

  writeJson(path.join(packageDir, "package.json"), {
    name: "fixture-package",
    version: "0.0.0",
    ...(privatePackage ? { private: true } : {}),
    ...(Object.keys(scripts).length > 0 ? { scripts } : {}),
  });

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_NPM_LOG: logPath,
    FAKE_NPM_QUICK_MARK: quickMarkerPath,
    FAKE_NPM_PACK_MARK: packMarkerPath,
    PI_EXTENSIONS_TMPDIR: path.join(tmpRoot, "tmp"),
  };

  return {
    packageDir,
    logPath,
    quickMarkerPath,
    packMarkerPath,
    run(stage = "ci") {
      return execFileSync("bash", [SCRIPT, stage, packageDir], {
        cwd: ROOT,
        encoding: "utf8",
        env,
      });
    },
    readLog() {
      if (!fs.existsSync(logPath)) return [];
      return fs
        .readFileSync(logPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    },
  };
}

test("ci prefers release:check:quick over npm pack fallback when available", (t) => {
  const fixture = createFixture(t, { releaseCheckQuick: true });
  const output = fixture.run();

  assert.match(output, /packaging: running scripts\.release:check:quick/);
  assert.equal(fs.existsSync(fixture.quickMarkerPath), true);
  assert.equal(fs.existsSync(fixture.packMarkerPath), false);
  assert.deepEqual(fixture.readLog().map((line) => line.split("|")[1]), ["run release:check:quick"]);
});

test("ci falls back to npm pack --dry-run for publishable packages without release:check:quick", (t) => {
  const fixture = createFixture(t);
  const output = fixture.run();

  assert.match(output, /packaging: fallback to npm pack --dry-run/);
  assert.equal(fs.existsSync(fixture.quickMarkerPath), false);
  assert.equal(fs.existsSync(fixture.packMarkerPath), true);
  assert.deepEqual(fixture.readLog().map((line) => line.split("|")[1]), ["pack --dry-run"]);
});

test("ci skips packaging for private packages without release:check:quick", (t) => {
  const fixture = createFixture(t, { privatePackage: true });
  const output = fixture.run();

  assert.match(output, /packaging: skipped/);
  assert.equal(fs.existsSync(fixture.quickMarkerPath), false);
  assert.equal(fs.existsSync(fixture.packMarkerPath), false);
  assert.deepEqual(fixture.readLog(), []);
});
