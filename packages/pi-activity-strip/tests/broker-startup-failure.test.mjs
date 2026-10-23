// summary: "Checks transactional production broker startup on private real Unix sockets."
// read_when:
//   - "Changing broker startup, transport bounds, or failed-start cleanup."

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { ActivityStripBroker, createActivityStripBroker } from "../src/broker/server.mjs";
import { createSocketFixture } from "./support/socket-fixture.mjs";

function fixture(t) {
  const { root, socketDir, socketPath } = createSocketFixture(t, { prefix: "bs-" });
  // Only use address allocation, never startBroker(): fixture rollback must not
  // conceal whether the production start()/factory cleaned up before rejecting.
  return { root, socketDir, socketPath };
}

async function close(server) {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}

for (const factory of [false, true]) {
  test(`Given a real bind, when socket chmod fails, then ${factory ? "factory" : "start"} rolls back before rejecting`, async (t) => {
    const options = fixture(t);
    const permissionError = Object.assign(new Error("injected socket chmod failure"), {
      code: "EACCES",
    });
    let server;
    let broker;
    let injected = false;
    const createServer = net.createServer;
    t.mock.method(net, "createServer", (...args) => {
      server = createServer(...args);
      return server;
    });
    t.after(async () => {
      if (broker?.tick) clearInterval(broker.tick);
      if (server) await close(server);
    });
    const chmod = fs.chmodSync;
    const injection = t.mock.method(fs, "chmodSync", (target, mode) => {
      if (target === options.socketPath) {
        // Given: permission failure is injected only AFTER the production server bound.
        assert.equal(server.listening, true);
        assert.equal(fs.statSync(target).isSocket(), true);
        injected = true;
        throw permissionError;
      }
      return chmod(target, mode);
    });

    // When: use the actual exported production entrypoint, not a lifecycle fake.
    if (!factory) broker = new ActivityStripBroker(options);
    const started = factory ? createActivityStripBroker(options) : broker.start();
    await assert.rejects(started, (error) => error === permissionError);
    injection.mock.restore();

    // Then: rejection preserves the cause and leaves no referenced listening handle.
    assert.equal(injected, true);
    assert.equal(server.listening, false);
    assert.equal(fs.existsSync(options.socketPath), false);
    if (broker) assert.equal(broker.tick, null);
  });
}

test("Given a factory caller in a child process, when socket chmod rejects, then the caller exits without forced cleanup", (t) => {
  const options = fixture(t);
  const source = new URL("../src/broker/server.mjs", import.meta.url).href;
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import fs from "node:fs";
    import { createActivityStripBroker } from ${JSON.stringify(source)};
    const options = ${JSON.stringify(options)};
    const original = Object.assign(new Error("injected chmod failure"), { code: "EACCES" });
    const chmod = fs.chmodSync;
    fs.chmodSync = (target, mode) => {
      if (target === options.socketPath) throw original;
      return chmod(target, mode);
    };
    try {
      await createActivityStripBroker(options);
      throw new Error("startup unexpectedly succeeded");
    } catch (error) {
      if (error !== original) throw error;
      console.log("caught:EACCES");
    }
    // No process.exit(), server.unref(), or manual close: a leaked listener hangs.
  `,
    ],
    { encoding: "utf8", timeout: 2000 },
  );

  assert.equal(child.stdout.trim(), "caught:EACCES", child.stderr);
  assert.equal(child.error, undefined, "rejected factory must not keep the caller alive");
  assert.equal(child.status, 0, child.stderr);
  assert.equal(fs.existsSync(options.socketPath), false);
});

test("Given startup and cleanup both fail, when start rejects, then the original permission error survives", async (t) => {
  const options = fixture(t);
  const broker = new ActivityStripBroker(options);
  const original = new Error("original chmod failure");
  let bound = false;
  const chmod = fs.chmodSync;
  const unlink = fs.unlinkSync;
  t.mock.method(fs, "chmodSync", (target, mode) => {
    if (target === options.socketPath) {
      bound = broker.server.listening;
      throw original;
    }
    return chmod(target, mode);
  });
  t.mock.method(fs, "unlinkSync", (target) => {
    if (bound && target === options.socketPath) throw new Error("secondary cleanup failure");
    return unlink(target);
  });
  t.after(() => close(broker.server));

  await assert.rejects(broker.start(), (error) => error === original);

  assert.equal(bound, true);
  assert.equal(broker.server.listening, false);
  assert.equal(broker.tick, null);
});

test("Given a bound broker, when its initial snapshot throws, then startup closes it and stops its tick", async (t) => {
  const options = fixture(t);
  const broker = new ActivityStripBroker(options);
  const snapshotError = new Error("injected initial snapshot failure");
  broker.once("snapshot", () => {
    assert.equal(broker.server.listening, true);
    assert.notEqual(broker.tick, null);
    throw snapshotError;
  });
  t.after(async () => {
    if (broker.tick) clearInterval(broker.tick);
    await close(broker.server);
  });

  await assert.rejects(broker.start(), (error) => error === snapshotError);

  assert.equal(broker.server.listening, false);
  assert.equal(broker.tick, null);
  assert.equal(fs.existsSync(options.socketPath), false);
});

for (const unicode of [false, true]) {
  test(`Given an overlong ${unicode ? "UTF-8" : "ASCII"} Unix address, when startup is requested, then it rejects before filesystem changes`, async (t) => {
    const { socketDir: root } = fixture(t);
    const socketDir = path.join(root, "state");
    fs.mkdirSync(socketDir, { mode: 0o755 });
    fs.chmodSync(socketDir, 0o755);
    const remainingBytes = 107 - Buffer.byteLength(socketDir) - 1;
    const name = unicode ? "é".repeat(Math.floor(remainingBytes / 2) + 1) : "x".repeat(108);
    const socketPath = path.join(socketDir, name);
    fs.writeFileSync(socketPath, "must not unlink");
    const broker = new ActivityStripBroker({ socketDir, socketPath });
    t.after(() => close(broker.server));
    assert.ok(Buffer.byteLength(socketPath, "utf8") > 107);
    if (unicode) assert.ok(socketPath.length <= 107, "byte limit must not count characters");

    await assert.rejects(broker.start(), /socket.*107.*bytes/i);

    assert.equal(fs.readFileSync(socketPath, "utf8"), "must not unlink");
    assert.equal(fs.statSync(socketDir).mode & 0o777, 0o755);
    assert.equal(broker.server.listening, false);
    assert.equal(broker.tick, null);
    // Linux/Node previously bound a truncated path, then failed chmod on the full path.
    const truncated = Buffer.from(socketPath).subarray(0, 107).toString();
    assert.equal(fs.existsSync(truncated), false);
  });
}

test("Given an overlong address and absent socket directory, when starting, then no directory is created", async (t) => {
  const { socketDir: root } = fixture(t);
  const socketDir = path.join(root, "absent");
  const broker = new ActivityStripBroker({
    socketDir,
    socketPath: path.join(socketDir, "s".repeat(108)),
  });
  t.after(() => close(broker.server));

  await assert.rejects(broker.start(), /socket.*107.*bytes/i);

  assert.equal(fs.existsSync(socketDir), false);
});

test("Given another listener wins the bind, when startup fails, then rollback leaves that listener intact", async (t) => {
  const options = fixture(t);
  const broker = new ActivityStripBroker(options);
  const other = net.createServer((socket) => socket.end());
  t.after(() => close(other));
  t.after(() => close(broker.server));
  const listen = broker.server.listen;
  t.mock.method(broker.server, "listen", function (...args) {
    // Bind the rival after stale-path removal, immediately before the production bind.
    other.listen(options.socketPath);
    return listen.apply(this, args);
  });

  await assert.rejects(broker.start(), { code: "EADDRINUSE" });

  assert.equal(broker.server.listening, false);
  assert.equal(broker.tick, null);
  assert.equal(other.listening, true);
  assert.equal(fs.statSync(options.socketPath).isSocket(), true);
  const client = net.createConnection(options.socketPath);
  t.after(() => client.destroy());
  await once(client, "connect");
  client.destroy();
});

test("Given a 107-byte Linux socket path, when startup succeeds, then permissions and ping remain unchanged", async (t) => {
  const { socketDir: root } = fixture(t);
  const socketPath = path.join(root, "s".repeat(107 - Buffer.byteLength(root) - 1));
  const broker = new ActivityStripBroker({ socketDir: root, socketPath });
  t.after(() => broker.stop());
  assert.equal(Buffer.byteLength(socketPath), 107);

  await broker.start();

  assert.equal(broker.server.listening, true);
  assert.notEqual(broker.tick, null);
  assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
  const client = net.createConnection(socketPath);
  t.after(() => client.destroy());
  client.setEncoding("utf8");
  await once(client, "connect");
  const response = once(client, "data");
  client.write('{"type":"ping"}\n');
  const [data] = await response;
  assert.equal(JSON.parse(data).type, "pong");
  assert.equal(JSON.parse(data).ok, true);
  client.destroy();
});
