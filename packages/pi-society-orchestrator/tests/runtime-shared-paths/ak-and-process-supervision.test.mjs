import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveAkPath, runAkCommand, runAkCommandAsync } from "../../src/runtime/ak.ts";
import { superviseProcess } from "../../src/runtime/process-supervisor.ts";

test("runAkCommand injects AK_DB when environment does not provide one", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-"));
  const marker = path.join(tempDir, "ak-db.txt");
  const akPath = path.join(tempDir, "ak-mock.sh");
  const bashAkDbExpansion = "${" + "AK_DB:-}";

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
printf '%s' "${bashAkDbExpansion}" > ${JSON.stringify(marker)}
`,
  );
  fs.chmodSync(akPath, 0o755);

  const previousAkDb = process.env.AK_DB;
  try {
    delete process.env.AK_DB;
    const result = runAkCommand({
      akPath,
      societyDb: "/tmp/custom-society.v2.db",
      args: [],
    });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(marker, "utf8"), "/tmp/custom-society.v2.db");
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommand honors explicit societyDb over ambient AK_DB", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-precedence-"));
  const marker = path.join(tempDir, "ak-db.txt");
  const akPath = path.join(tempDir, "ak-mock.sh");
  const bashAkDbExpansion = "${" + "AK_DB:-}";

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
printf '%s' "${bashAkDbExpansion}" > ${JSON.stringify(marker)}
`,
  );
  fs.chmodSync(akPath, 0o755);

  const previousAkDb = process.env.AK_DB;
  try {
    process.env.AK_DB = "/tmp/ambient-ak.db";
    const result = runAkCommand({
      akPath,
      societyDb: "/tmp/explicit-society.v2.db",
      args: [],
    });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(marker, "utf8"), "/tmp/explicit-society.v2.db");
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveAkPath prefers a repo-local scripts/ak.sh wrapper when available", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-wrapper-"));
  const repoRoot = path.join(tempDir, "repo");
  const nestedCwd = path.join(repoRoot, "packages", "demo");
  const wrapperPath = path.join(repoRoot, "scripts", "ak.sh");
  const previousAgentKernel = process.env.AGENT_KERNEL;

  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(wrapperPath, "#!/usr/bin/env sh\nexit 0\n");
  fs.chmodSync(wrapperPath, 0o755);

  try {
    delete process.env.AGENT_KERNEL;
    assert.equal(resolveAkPath({ cwd: nestedCwd }), wrapperPath);
  } finally {
    if (previousAgentKernel === undefined) {
      delete process.env.AGENT_KERNEL;
    } else {
      process.env.AGENT_KERNEL = previousAgentKernel;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveAkPath honors AGENT_KERNEL over any repo-local wrapper", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-explicit-"));
  const repoRoot = path.join(tempDir, "repo");
  const nestedCwd = path.join(repoRoot, "packages", "demo");
  const wrapperPath = path.join(repoRoot, "scripts", "ak.sh");
  const previousAgentKernel = process.env.AGENT_KERNEL;

  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(wrapperPath, "#!/usr/bin/env sh\nexit 0\n");
  fs.chmodSync(wrapperPath, 0o755);

  try {
    process.env.AGENT_KERNEL = "/tmp/explicit-ak";
    assert.equal(resolveAkPath({ cwd: nestedCwd }), "/tmp/explicit-ak");
  } finally {
    if (previousAgentKernel === undefined) {
      delete process.env.AGENT_KERNEL;
    } else {
      process.env.AGENT_KERNEL = previousAgentKernel;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommandAsync injects AK_DB without blocking the event loop", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-async-"));
  const marker = path.join(tempDir, "ak-db.txt");
  const akPath = path.join(tempDir, "ak-mock.sh");
  const bashAkDbExpansion = "${" + "AK_DB:-}";

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
sleep 0.2
printf '%s' "${bashAkDbExpansion}" > ${JSON.stringify(marker)}
printf 'async-ok'
`,
  );
  fs.chmodSync(akPath, 0o755);

  const previousAkDb = process.env.AK_DB;
  try {
    delete process.env.AK_DB;
    let timerFired = false;
    const timer = new Promise((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve(undefined);
      }, 20);
    });

    const start = Date.now();
    const resultPromise = runAkCommandAsync({
      akPath,
      societyDb: "/tmp/async-society.v2.db",
      args: [],
    });

    await timer;
    const elapsedUntilTimer = Date.now() - start;
    assert.equal(timerFired, true);
    assert.ok(
      elapsedUntilTimer < 150,
      `expected event loop to stay responsive, got ${elapsedUntilTimer}ms`,
    );

    const result = await resultPromise;
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "async-ok");
    assert.equal(fs.readFileSync(marker, "utf8"), "/tmp/async-society.v2.db");
  } finally {
    if (previousAkDb === undefined) {
      delete process.env.AK_DB;
    } else {
      process.env.AK_DB = previousAkDb;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommandAsync runs ak commands from the provided cwd", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-cwd-"));
  const nestedCwd = path.join(tempDir, "nested", "repo");
  const marker = path.join(tempDir, "cwd.txt");
  const akPath = path.join(tempDir, "ak-cwd.sh");

  fs.mkdirSync(nestedCwd, { recursive: true });
  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
pwd > ${JSON.stringify(marker)}
printf 'cwd-ok'
`,
  );
  fs.chmodSync(akPath, 0o755);

  try {
    const result = await runAkCommandAsync({
      akPath,
      societyDb: "/tmp/cwd-society.v2.db",
      args: [],
      cwd: nestedCwd,
    });
    assert.equal(result.ok, true);
    assert.equal(result.stdout, "cwd-ok");
    assert.equal(fs.readFileSync(marker, "utf8").trim(), nestedCwd);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommandAsync fails closed when machine output exceeds its capture bound", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-capture-"));
  const akPath = path.join(tempDir, "ak-capture.sh");
  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
printf '0123456789abcdef'
`,
  );
  fs.chmodSync(akPath, 0o755);

  try {
    const result = await runAkCommandAsync({
      akPath,
      societyDb: "/tmp/capture-society.v2.db",
      args: [],
      maxStdoutBytes: 8,
    });
    assert.equal(result.ok, false);
    assert.equal(result.stdoutTruncated, true);
    assert.equal(result.stdout, "01234567");
    assert.match(result.stderr, /stdout exceeded the bounded capture limit/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runAkCommandAsync returns a timeout failure for hung processes", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ak-timeout-"));
  const akPath = path.join(tempDir, "ak-timeout.sh");

  fs.writeFileSync(
    akPath,
    `#!/usr/bin/env bash
sleep 2
`,
  );
  fs.chmodSync(akPath, 0o755);

  try {
    const result = await runAkCommandAsync({
      akPath,
      societyDb: "/tmp/timeout-society.v2.db",
      args: [],
      timeoutMs: 50,
    });
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
    assert.match(result.stderr, /timed out/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("superviseProcess preserves actual exit code when a timed-out process exits cleanly after SIGTERM", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-supervisor-timeout-"));
  const scriptPath = path.join(tempDir, "graceful-timeout.sh");

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
trap 'printf graceful-exit; exit 0' TERM
while true; do sleep 0.05; done
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = await superviseProcess({
      command: scriptPath,
      args: [],
      timeoutMs: 50,
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /graceful-exit/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("superviseProcess bounds captured stdout/stderr while preserving streaming callbacks", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-supervisor-bounded-"));
  const scriptPath = path.join(tempDir, "chatty.sh");
  let streamedStdout = "";
  let streamedStderr = "";

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
printf 'stdout-abcdefghijklmnopqrstuvwxyz'
printf 'stderr-abcdefghijklmnopqrstuvwxyz' >&2
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = await superviseProcess({
      command: scriptPath,
      args: [],
      timeoutMs: 1000,
      maxStdoutBytes: 10,
      maxStderrBytes: 12,
      onStdoutData(chunk) {
        streamedStdout += chunk;
      },
      onStderrData(chunk) {
        streamedStderr += chunk;
      },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdoutTruncated, true);
    assert.equal(result.stderrTruncated, true);
    assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 10);
    assert.ok(Buffer.byteLength(result.stderr, "utf8") <= 12);
    assert.match(streamedStdout, /stdout-abcdefghijklmnopqrstuvwxyz/);
    assert.match(streamedStderr, /stderr-abcdefghijklmnopqrstuvwxyz/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("superviseProcess treats non-positive capture limits as zero-length captures", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-supervisor-zero-capture-"));
  const scriptPath = path.join(tempDir, "chatty-zero.sh");

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
printf 'stdout-data'
printf 'stderr-data' >&2
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    const result = await superviseProcess({
      command: scriptPath,
      args: [],
      timeoutMs: 1000,
      maxStdoutBytes: 0,
      maxStderrBytes: -1,
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.equal(result.stdoutTruncated, true);
    assert.equal(result.stderrTruncated, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
