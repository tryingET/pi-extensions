import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts", "ci", "rocs-validation.sh");
const ROCS_SCRIPT = path.join(ROOT, "scripts", "rocs.sh");
const TMPDIR = process.env.TMPDIR;
assert.ok(TMPDIR, "TMPDIR must be set for ROCS isolation tests");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  const diagnostic = `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`;
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(typeof result.status, "number", diagnostic);
  assert.equal(result.status, options.expectedStatus ?? 0, diagnostic);
  return result;
}

function gitSnapshot() {
  const indexResult = run("git", ["rev-parse", "--git-path", "index"]);
  return {
    index: fs.readFileSync(path.resolve(ROOT, indexResult.stdout.trim())),
    lsFiles: run("git", ["ls-files", "-z"]).stdout,
  };
}

function treeSnapshot(treeRoot) {
  if (!fs.existsSync(treeRoot)) return null;
  const entries = [];
  function visit(current, relative) {
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      entries.push({ relative, type: "directory", mode: stat.mode });
      for (const name of fs.readdirSync(current).sort()) {
        visit(path.join(current, name), path.join(relative, name));
      }
    } else if (stat.isSymbolicLink()) {
      entries.push({ relative, type: "symlink", mode: stat.mode, target: fs.readlinkSync(current) });
    } else {
      entries.push({ relative, type: "file", mode: stat.mode, bytes: fs.readFileSync(current) });
    }
  }
  visit(treeRoot, ".");
  return entries;
}

function liveSnapshot() {
  return {
    git: gitSnapshot(),
    dist: treeSnapshot(path.join(ROOT, "ontology", "dist")),
  };
}

function assertLiveUnchanged(before) {
  const after = liveSnapshot();
  assert.deepEqual(after.git.index, before.git.index, "live Git index bytes changed");
  assert.equal(after.git.lsFiles, before.git.lsFiles, "live git ls-files changed");
  assert.deepEqual(after.dist, before.dist, "live ontology/dist changed");
}

function makeCase(t) {
  const caseRoot = fs.mkdtempSync(path.join(TMPDIR, "rocs-validation-test-"));
  t.after(() => fs.rmSync(caseRoot, { recursive: true, force: true }));
  return caseRoot;
}

function fakeRocsSource() {
  return `#!/bin/sh
set -eu
printf '%s\\n' "$#" >> "$ROCS_FAKE_LOG"
for arg in "$@"; do printf '%s\\n' "$arg" >> "$ROCS_FAKE_LOG"; done
command_name=\${1:-}
if [ "\${BLOCK_ON:-}" = "$command_name" ]; then
  printf '%s\\n' "$$" > "$ROCS_FAKE_CHILD_PID"
  trap 'printf terminated\\n > "$ROCS_FAKE_TERMINATED"; exit 143' TERM
  : > "$ROCS_FAKE_READY"
  while :; do sleep 1; done
fi
shift || true
if [ "$command_name" = version ]; then exit 0; fi
repo=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = --repo ]; then
    shift
    repo=\${1:-}
  fi
  shift || true
done
[ -n "$repo" ] || exit 90
case "$repo" in
  "$LIVE_REPO"|"$LIVE_REPO"/*) exit 91 ;;
esac
case "$repo" in
  "$TEST_TMPDIR"/pi-extensions-rocs.*) ;;
  *) exit 92 ;;
esac
case "$command_name" in
  build)
    mkdir -p "$repo/ontology/dist"
    printf 'scratch-only\\n' > "$repo/ontology/dist/fake-rocs-output"
    ;;
  validate)
    [ -f "$repo/ontology/dist/fake-rocs-output" ] || exit 93
    printf 'validated\\n' >> "$repo/ontology/dist/fake-rocs-output"
    if [ "\${FAKE_ROCS_FAIL_VALIDATE:-0}" = 1 ]; then exit 42; fi
    ;;
  *) exit 94 ;;
esac
`;
}

function writeFakeRocs(caseRoot) {
  const fakeRocs = path.join(caseRoot, "fake-rocs.sh");
  fs.writeFileSync(fakeRocs, fakeRocsSource(), { mode: 0o700 });
  return fakeRocs;
}

function fakeEnv(caseRoot, fakeRocs, extra = {}) {
  return {
    TMPDIR: caseRoot,
    ROCS_BIN: fakeRocs,
    ROCS_FAKE_LOG: path.join(caseRoot, "rocs.log"),
    LIVE_REPO: ROOT,
    TEST_TMPDIR: caseRoot,
    ROCS_WORKSPACE_ROOT: caseRoot,
    ...extra,
  };
}

function readInvocations(logPath) {
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
  const invocations = [];
  for (let index = 0; index < lines.length; ) {
    const count = Number(lines[index]);
    assert.ok(Number.isInteger(count), `invalid argument count: ${lines[index]}`);
    index += 1;
    invocations.push(lines.slice(index, index + count));
    index += count;
  }
  return invocations;
}

function exercise(t, { failValidation }) {
  const caseRoot = makeCase(t);
  const fakeRocs = writeFakeRocs(caseRoot);
  const env = fakeEnv(caseRoot, fakeRocs, {
    FAKE_ROCS_FAIL_VALIDATE: failValidation ? "1" : "0",
  });
  const before = liveSnapshot();

  run(SCRIPT, [], {
    expectedStatus: failValidation ? 42 : 0,
    env,
  });
  assertLiveUnchanged(before);

  const invocations = readInvocations(env.ROCS_FAKE_LOG);
  assert.equal(invocations.length, 3);
  assert.deepEqual(invocations[0], ["version"]);
  const scratch = invocations[1][2];
  assert.deepEqual(invocations[1], [
    "build",
    "--repo",
    scratch,
    "--resolve-refs",
    "--clean",
    "--workspace-root",
    caseRoot,
  ]);
  assert.deepEqual(invocations[2], [
    "validate",
    "--repo",
    scratch,
    "--resolve-refs",
    "--workspace-root",
    caseRoot,
  ]);
  assert.equal(fs.existsSync(scratch), false, "owned ROCS scratch was not removed");
}

function copyWrapperFixture(caseRoot) {
  const fixtureRoot = path.join(caseRoot, "repo");
  fs.mkdirSync(path.join(fixtureRoot, "scripts", "ci"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "ontology", "dist"), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(fixtureRoot, "scripts", "ci", "rocs-validation.sh"));
  fs.copyFileSync(ROCS_SCRIPT, path.join(fixtureRoot, "scripts", "rocs.sh"));
  fs.chmodSync(path.join(fixtureRoot, "scripts", "ci", "rocs-validation.sh"), 0o755);
  fs.chmodSync(path.join(fixtureRoot, "scripts", "rocs.sh"), 0o755);
  return fixtureRoot;
}

function assertNoRocsOrScratch(caseRoot, logPath) {
  assert.equal(fs.existsSync(logPath), false, "fake ROCS must not be invoked");
  const scratch = fs.readdirSync(caseRoot).filter((name) => name.startsWith("pi-extensions-rocs."));
  assert.deepEqual(scratch, [], "owned ROCS scratch was not removed");
}

function exerciseSourceSymlink(t, linkTarget) {
  const caseRoot = makeCase(t);
  const fixtureRoot = copyWrapperFixture(caseRoot);
  const fakeRocs = writeFakeRocs(caseRoot);
  const external = path.join(caseRoot, "external.txt");
  fs.writeFileSync(external, "external-unchanged\n");
  fs.symlinkSync(linkTarget(external), path.join(fixtureRoot, "ontology", "dist", "escape"));
  const env = fakeEnv(caseRoot, fakeRocs);
  const before = liveSnapshot();

  const result = run(path.join(fixtureRoot, "scripts", "ci", "rocs-validation.sh"), [], {
    expectedStatus: 2,
    env,
  });
  assert.match(result.stderr, /source ontology contains a symlink/u);
  assert.equal(fs.readFileSync(external, "utf8"), "external-unchanged\n");
  assertNoRocsOrScratch(caseRoot, env.ROCS_FAKE_LOG);
  assertLiveUnchanged(before);
}

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${filePath}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

test("ROCS isolation keeps live state unchanged on success and uses exact argv", (t) => {
  exercise(t, { failValidation: false });
});

test("ROCS isolation keeps live state unchanged on validation failure and uses exact argv", (t) => {
  exercise(t, { failValidation: true });
});

test("ROCS isolation rejects an absolute source ontology symlink before ROCS", (t) => {
  exerciseSourceSymlink(t, (external) => external);
});

test("ROCS isolation rejects a dot-dot escaping source ontology symlink before ROCS", (t) => {
  exerciseSourceSymlink(t, () => "../../../external.txt");
});

test("ROCS isolation rejects a symlink introduced in the scratch copy before ROCS", (t) => {
  const caseRoot = makeCase(t);
  const fixtureRoot = copyWrapperFixture(caseRoot);
  const fakeRocs = writeFakeRocs(caseRoot);
  const external = path.join(caseRoot, "external.txt");
  fs.writeFileSync(external, "external-unchanged\n");
  const fakeBin = path.join(caseRoot, "bin");
  fs.mkdirSync(fakeBin);
  const fakeCp = path.join(fakeBin, "cp");
  fs.writeFileSync(
    fakeCp,
    `#!/bin/sh\nset -eu\n"$REAL_CP" "$@"\nfor dest do :; done\nln -s "$POST_COPY_TARGET" "$dest/dist/copied-escape"\n`,
    { mode: 0o700 },
  );
  const env = fakeEnv(caseRoot, fakeRocs, {
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
    REAL_CP: "/usr/bin/cp",
    POST_COPY_TARGET: external,
  });
  const before = liveSnapshot();

  const result = run(path.join(fixtureRoot, "scripts", "ci", "rocs-validation.sh"), [], {
    expectedStatus: 2,
    env,
  });
  assert.match(result.stderr, /scratch ontology contains a symlink/u);
  assert.equal(fs.readFileSync(external, "utf8"), "external-unchanged\n");
  assertNoRocsOrScratch(caseRoot, env.ROCS_FAKE_LOG);
  assertLiveUnchanged(before);
});

async function exerciseSignal(t, signal, expectedStatus) {
  const caseRoot = makeCase(t);
  const fakeRocs = writeFakeRocs(caseRoot);
  const ready = path.join(caseRoot, "ready");
  const childPidPath = path.join(caseRoot, "child.pid");
  const terminated = path.join(caseRoot, "terminated");
  const env = fakeEnv(caseRoot, fakeRocs, {
    BLOCK_ON: "version",
    ROCS_FAKE_READY: ready,
    ROCS_FAKE_CHILD_PID: childPidPath,
    ROCS_FAKE_TERMINATED: terminated,
  });
  const before = liveSnapshot();
  const stdout = [];
  const stderr = [];
  const wrapper = spawn(SCRIPT, [], { cwd: ROOT, env: { ...process.env, ...env } });
  wrapper.stdout.on("data", (chunk) => stdout.push(chunk));
  wrapper.stderr.on("data", (chunk) => stderr.push(chunk));
  const exited = waitForExit(wrapper);

  await waitForFile(ready);
  const fakePid = Number(fs.readFileSync(childPidPath, "utf8").trim());
  assert.ok(Number.isInteger(fakePid));
  const scratch = fs.readdirSync(caseRoot).filter((name) => name.startsWith("pi-extensions-rocs."));
  assert.equal(scratch.length, 1);
  process.kill(wrapper.pid, signal);
  const result = await exited;
  const diagnostic = `${Buffer.concat(stderr).toString()}${Buffer.concat(stdout).toString()}`;
  assert.deepEqual(result, { code: expectedStatus, signal: null }, diagnostic);
  assert.equal(fs.existsSync(terminated), true, "active ROCS child did not handle TERM");
  assert.throws(() => process.kill(fakePid, 0), (error) => error?.code === "ESRCH");
  assert.equal(fs.existsSync(path.join(caseRoot, scratch[0])), false, "owned ROCS scratch was not removed");
  assertLiveUnchanged(before);
}

for (const [signal, expectedStatus] of [
  ["SIGHUP", 129],
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  test(`ROCS isolation terminates and reaps its active child on ${signal}`, async (t) => {
    await exerciseSignal(t, signal, expectedStatus);
  });
}
