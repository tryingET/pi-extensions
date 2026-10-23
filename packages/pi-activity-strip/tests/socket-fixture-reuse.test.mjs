import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getBrokerStatus } from "../src/client/broker-client.mjs";
import { createSocketFixture } from "./support/socket-fixture.mjs";

test("Scenario: Given successful stop but failed storage removal, When cleanup retries after descriptor reuse, Then the new real endpoint stays reachable", async (t) => {
  const first = createSocketFixture(t);
  const firstBroker = await first.startBroker();
  const rm = fs.rmSync;
  const failure = new Error("injected storage removal failure after successful stop");
  const injection = t.mock.method(fs, "rmSync", (target, ...args) => {
    if (target === first.root) throw failure;
    return rm(target, ...args);
  });
  let second;
  let secondBroker;
  try {
    await assert.rejects(first.cleanup(), (error) => error === failure);
    injection.mock.restore();
    assert.equal(firstBroker.server.listening, false);
    assert.equal(fs.existsSync(first.root), true);
    assert.equal(fs.existsSync(first.socketDir), false);
    second = createSocketFixture(t);
    assert.equal(second.socketDir, first.socketDir, "exercise real descriptor reuse");
    secondBroker = await second.startBroker();
    const inode = fs.statSync(second.socketPath).ino;
    await first.cleanup();
    assert.equal(fs.existsSync(second.socketPath), true, "retry must not unlink the new endpoint");
    assert.equal(fs.statSync(second.socketPath).ino, inode);
    assert.equal((await getBrokerStatus({ socketPath: second.socketPath })).ok, true);
  } finally {
    injection.mock.restore();
    if (second) await second.cleanup();
    await first.cleanup();
    assert.equal(firstBroker.server.listening, false);
    if (secondBroker) assert.equal(secondBroker.server.listening, false);
    assert.equal(fs.existsSync(first.root), false);
    if (second) assert.equal(fs.existsSync(second.root), false);
    t.diagnostic("cleanup receipt: both real listeners stopped and both roots removed");
  }
});

for (const code of ["EIO", "EINTR"]) {
  test(`Scenario: Given Linux close releases a descriptor then reports ${code}, When storage cleanup retries, Then another fixture's reused descriptor is never closed`, async (t) => {
    const first = createSocketFixture(t);
    const firstBroker = await first.startBroker();
    const fd = Number(first.socketDir.split("/").at(-1));
    const close = fs.closeSync;
    const failure = Object.assign(new Error("injected Linux close error after release"), { code });
    const injection = t.mock.method(fs, "closeSync", (candidate) => {
      close(candidate);
      if (candidate === fd) throw failure;
    });
    let second;
    let secondBroker;
    try {
      await assert.rejects(first.cleanup(), (error) => error === failure);
      injection.mock.restore();
      assert.equal(firstBroker.server.listening, false);
      assert.equal(fs.existsSync(first.socketDir), false);
      second = createSocketFixture(t);
      assert.equal(second.socketDir, first.socketDir, "exercise real descriptor reuse");
      secondBroker = await second.startBroker();
      await first.cleanup();
      assert.equal(
        fs.existsSync(second.socketDir),
        true,
        "close errors must never cause a numeric FD retry",
      );
      assert.equal((await getBrokerStatus({ socketPath: second.socketPath })).ok, true);
    } finally {
      injection.mock.restore();
      // On RED the first helper may have closed the second alias. Its listener
      // must still be closed before removing physical storage.
      if (secondBroker) await secondBroker.stop();
      if (second) {
        try {
          await second.cleanup();
        } catch (error) {
          assert.equal(error.code, "EBADF", "only the RED lost-descriptor cleanup is tolerated");
        }
        fs.rmSync(second.root, { recursive: true, force: true });
      }
      await first.cleanup();
      assert.equal(firstBroker.server.listening, false);
      if (secondBroker) assert.equal(secondBroker.server.listening, false);
      assert.equal(fs.existsSync(first.root), false);
      if (second) assert.equal(fs.existsSync(second.root), false);
      t.diagnostic("cleanup receipt: all real listeners stopped and physical storage removed");
    }
  });
}
