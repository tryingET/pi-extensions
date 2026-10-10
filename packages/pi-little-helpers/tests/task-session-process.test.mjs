import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { durableWrite, physicalIdentity, readSnapshot } from "../dist/task-session/state.js";

const root = () => mkdtempSync(join(tmpdir(), "task5480-process-"));
const pause = () => new Promise((r) => setTimeout(r, 10));
async function until(fn) {
  for (let i = 0; i < 300; i++) {
    if (fn()) return;
    await pause();
  }
  throw new Error("synthetic_wait_timeout");
}
test("real Linux inherited OFD survives supervisor death, CLOEXEC marked, DB-free inspect independent", async () => {
  const dir = root();
  const lock = join(dir, "ak-synthetic.lock");
  writeFileSync(lock, "", { mode: 0o600 });
  const executable = join(dir, "supervisor");
  const source = fileURLToPath(
    new URL("./fixtures/task-session/custody-supervisor.c", import.meta.url),
  );
  assert.equal(
    spawnSync("/usr/bin/cc", ["-Wall", "-Wextra", "-Werror", "-o", executable, source]).status,
    0,
  );
  const host = fileURLToPath(new URL("./fixtures/task-session/custody-host.mjs", import.meta.url));
  const supervisor = spawnSync(executable, [lock, process.execPath, host, dir], {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  assert.equal(supervisor.status, 0, supervisor.stderr);
  assert.ok(Number(supervisor.stdout.trim()) > 0);
  try {
    const proof = JSON.parse(readFileSync(join(dir, "adopted.json"), "utf8"));
    assert.ok(
      proof.flags.every((flags) => (flags & 0o2000000) !== 0),
      "both inherited descriptors CLOEXEC",
    );
    assert.ok(!proof.child.includes(lock), "normal spawned child did not inherit lock");
    assert.equal(
      spawnSync("/usr/bin/flock", ["-n", lock, "/bin/true"]).status,
      1,
      "surviving host holds same lock after supervisor exit",
    );
    assert.equal(
      readFileSync(join(dir, "adopted.json"), "utf8").length > 0,
      true,
      "out-of-band metadata readable without AK lock",
    );
  } finally {
    writeFileSync(join(dir, "release"), "release");
  }
  await until(() => existsSync(join(dir, "closed")));
  assert.equal(spawnSync("/usr/bin/flock", ["-n", lock, "/bin/true"]).status, 0);
});
test("independent real processes cannot both reserve same domain", async () => {
  const dir = root();
  writeFileSync(join(dir, "namespace.lock"), "", { mode: 0o600 });
  const ds = lstatSync(dir),
    ls = lstatSync(join(dir, "namespace.lock"));
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "test",
    root: dir,
    uid: process.getuid(),
    rootDev: ds.dev,
    rootIno: ds.ino,
    lockDev: ls.dev,
    lockIno: ls.ino,
  };
  mkdirSync(join(dir, ".git"));
  const domain = {
    akInstance: "test",
    taskId: 1,
    checkout: dir,
    commonGit: join(dir, ".git"),
    sharedEffects: [],
    physical: { checkout: physicalIdentity(dir), commonGit: physicalIdentity(join(dir, ".git")) },
  };
  durableWrite(join(dir, "state.json"), {
    schema: "pi.task-session.state.v1",
    namespace: "test",
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [domain],
    enrolled: [domain],
    attempts: [],
  });
  const module = new URL("../dist/task-session/state.js", import.meta.url).href;
  const jobs = Array.from(
    { length: 8 },
    (_, i) =>
      new Promise((resolve) => {
        const code = `import {reserve} from ${JSON.stringify(module)};try {reserve(${JSON.stringify(locator)},'request${i}','${"a".repeat(64)}',${JSON.stringify(domain)});process.exitCode=0;}catch {process.exitCode=2;}`;
        const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
          stdio: "ignore",
        });
        child.once("exit", (status) => resolve(status));
      }),
  );
  const results = await Promise.all(jobs);
  assert.equal(results.filter((x) => x === 0).length, 1);
  assert.equal(readSnapshot(locator).attempts.length, 1);
});
test("emitted CLI help/capability and invalid options never require namespace/provider", () => {
  const bin = fileURLToPath(new URL("../dist/task-session/bin.js", import.meta.url));
  const dir = root();
  const preload = join(dir, "private-account.mjs");
  // Match the package's provisioning-test pattern: production uses userInfo(),
  // not HOME, so HOME alone does not isolate the real owner configuration.
  const run = (...args) =>
    spawnSync(process.execPath, ["--import", preload, bin, ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: dir, TEST_HOME: dir },
    });
  try {
    writeFileSync(
      preload,
      'import os from "node:os"; import {syncBuiltinESMExports} from "node:module";\n' +
        "const account = os.userInfo(); os.userInfo = () => ({...account, homedir: process.env.TEST_HOME});\n" +
        "syncBuiltinESMExports();\n",
      { mode: 0o600 },
    );
    const help = run("--help");
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /DB-free/);
    const capability = run("capability");
    assert.equal(capability.status, 0, capability.stderr);
    const packet = JSON.parse(capability.stdout);
    assert.equal(packet.admissionAvailable, false);
    assert.equal(packet.authority, false);
    assert.ok(packet.blockers.length > 0);
    const bad = run("launch", "--exec", "/bin/sh");
    assert.equal(bad.status, 2);
    assert.equal(JSON.parse(bad.stdout).reason, "unsupported_or_duplicate_options");
  } finally {
    // Only synchronous, exited children used this run-owned private fixture.
    rmSync(dir, { recursive: true, force: true });
  }
});
