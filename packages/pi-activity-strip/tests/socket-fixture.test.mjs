// ---
// summary: "checks real broker/child transport and failure cleanup with a managed path beyond sockaddr_un"
// read_when:
//   - "changing socket fixture alias lifetime, long-path support or setup rejection cleanup"
// ---

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { getBrokerStatus } from "../src/client/broker-client.mjs";
import { createSocketFixture } from "./support/socket-fixture.mjs";

for (const length of [0, 180])
  test(`Scenario: real socket remains managed and reachable from another process with extra TMPDIR depth=${length}`, async (t) => {
    const owned = fs.mkdtempSync(path.join(os.tmpdir(), "socket-path-proof-"));
    const tmpdir = length ? path.join(owned, "managed-".repeat(length / 8)) : owned;
    fs.mkdirSync(tmpdir, { recursive: true });
    const fixture = createSocketFixture(t, { tmpdir });
    try {
      assert.ok(fixture.root.startsWith(`${tmpdir}/`), "no fallback outside managed scratch");
      assert.equal(fs.realpathSync(fixture.socketDir), fixture.root);
      assert.ok(Buffer.byteLength(fixture.socketPath) < 108);
      if (length)
        assert.ok(
          Buffer.byteLength(path.join(fixture.root, "broker.sock")) > 108,
          "the deep case must exceed the physical Unix address limit",
        );
      assert.equal(fs.statSync(fixture.root).mode & 0o777, 0o700);
      await fixture.startBroker({ getRuntimeStatus: () => ({ state: "ready", startedAt: 1 }) });
      assert.equal(fs.statSync(path.join(fixture.root, "broker.sock")).isSocket(), true);
      assert.equal((await getBrokerStatus({ socketPath: fixture.socketPath })).ok, true);
      const client = new URL("../src/client/broker-client.mjs", import.meta.url).href;
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {getBrokerStatus} from ${JSON.stringify(client)}; console.log(JSON.stringify(await getBrokerStatus()));`,
        ],
        {
          cwd: fixture.root,
          env: {
            ...process.env,
            PI_ACTIVITY_STRIP_SOCKET_DIR: fixture.socketDir,
            PI_ACTIVITY_STRIP_SOCKET_PATH: fixture.socketPath,
          },
        },
      );
      assert.equal(JSON.parse(stdout).runtimeStatus.state, "ready");
      await fixture.cleanup();
      assert.equal(fs.existsSync(fixture.root), false);
      assert.equal(
        fs.existsSync(fixture.socketDir),
        false,
        "descriptor released after broker/client exit",
      );
      await fixture.cleanup(); // Node's registered after hook may also call cleanup.
    } finally {
      await fixture.cleanup();
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });

test("Scenario: rejection after actual listen closes the owned broker before releasing its directory", async (t) => {
  const fixture = createSocketFixture(t);
  const chmod = fs.chmodSync;
  const injected = t.mock.method(fs, "chmodSync", (file, mode) => {
    if (file === fixture.socketPath)
      throw Object.assign(new Error("injected socket chmod failure"), { code: "EACCES" });
    return chmod(file, mode);
  });
  try {
    await assert.rejects(fixture.startBroker(), { code: "EACCES" });
    assert.equal(
      fs.existsSync(fixture.root),
      false,
      "setup rejection does not orphan a live socket directory",
    );
    assert.equal(fs.existsSync(fixture.socketDir), false, "setup rejection closes the descriptor");
  } finally {
    injected.mock.restore();
    await fixture.cleanup();
  }
});

for (const operation of ["chmodSync", "openSync"])
  test(`Scenario: ${operation} rejection during fixture construction leaves no scratch behind`, (t) => {
    const owned = fs.mkdtempSync(path.join(os.tmpdir(), "socket-construction-proof-"));
    const original = fs[operation];
    const injected = t.mock.method(fs, operation, (file, ...args) => {
      if (typeof file === "string" && file.startsWith(`${owned}/`))
        throw Object.assign(new Error(`injected ${operation} failure`), { code: "EACCES" });
      return original(file, ...args);
    });
    try {
      assert.throws(() => createSocketFixture(t, { tmpdir: owned }), { code: "EACCES" });
      assert.deepEqual(fs.readdirSync(owned), []);
    } finally {
      injected.mock.restore();
      fs.rmSync(owned, { recursive: true, force: true });
    }
  });
