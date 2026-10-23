import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import test from "node:test";
import { ActivityStripBroker } from "../src/broker/server.mjs";
import { getBrokerStatus } from "../src/client/broker-client.mjs";
import { createSocketFixture } from "./support/socket-fixture.mjs";

test("Scenario: Given startup rejects after a real bind and stop also rejects, When cleanup is retried, Then both errors and live custody survive until stop succeeds", async (t) => {
  const fixture = createSocketFixture(t);
  const start = ActivityStripBroker.prototype.start;
  const stop = ActivityStripBroker.prototype.stop;
  const startError = new Error("injected post-bind startup failure");
  const stopError = new Error("injected rollback failure");
  let broker;
  t.mock.method(ActivityStripBroker.prototype, "start", async function () {
    broker = this;
    await start.call(this);
    throw startError;
  });
  const injection = t.mock.method(ActivityStripBroker.prototype, "stop", async () => {
    throw stopError;
  });
  try {
    await assert.rejects(fixture.startBroker(), (error) => {
      assert.deepEqual(error.errors, [startError, stopError]);
      assert.equal(error.cause, startError);
      return true;
    });
    retained(fixture);
    assert.equal(broker.server.listening, true);
    assert.equal((await getBrokerStatus({ socketPath: fixture.socketPath })).ok, true);
    injection.mock.restore();
    await fixture.cleanup();
    assert.equal(broker.server.listening, false);
    released(fixture, t);
  } finally {
    injection.mock.restore();
    await stop.call(broker);
    await fixture.cleanup();
  }
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const retained = (fixture) => {
  assert.equal(fs.realpathSync(fixture.socketDir), fixture.root);
  assert.equal(fs.statSync(fixture.root).isDirectory(), true);
};
const released = (fixture, t) => {
  assert.equal(fs.existsSync(fixture.root), false);
  assert.equal(fs.existsSync(fixture.socketDir), false);
  t.diagnostic(`cleanup receipt: removed ${fixture.root}; released ${fixture.socketDir}`);
};

for (const afterStop of [false, true]) {
  test(`Scenario: Given a real broker, When stop rejects ${afterStop ? "after" : "before"} listener close, Then cleanup retains custody and retries`, async (t) => {
    const fixture = createSocketFixture(t);
    const broker = await fixture.startBroker();
    const stop = broker.stop.bind(broker);
    const failure = new Error("injected stop rejection");
    let attempts = 0;
    const injection = t.mock.method(broker, "stop", async () => {
      attempts += 1;
      if (attempts === 1) {
        if (afterStop) await stop();
        throw failure;
      }
      return stop();
    });
    try {
      await assert.rejects(fixture.cleanup(), (error) => error === failure);
      retained(fixture);
      assert.equal(broker.server.listening, !afterStop);
      if (!afterStop)
        assert.equal((await getBrokerStatus({ socketPath: fixture.socketPath })).ok, true);
      await assert.rejects(fixture.startBroker(), /closed|closing|already/i);
      await fixture.cleanup();
      assert.equal(attempts, 2);
      assert.equal(broker.server.listening, false);
      released(fixture, t);
      await fixture.cleanup();
      assert.equal(attempts, 2, "successful cleanup is idempotent");
    } finally {
      injection.mock.restore();
      await stop(); // Also closes the leaked inherited-helper listener on RED.
      await fixture.cleanup();
    }
  });
}

for (const rejects of [false, true]) {
  test(`Scenario: Given a pending real broker stop, When concurrent cleanup ${rejects ? "fails" : "succeeds"}, Then callers share completion and retry remains possible`, async (t) => {
    const fixture = createSocketFixture(t);
    const broker = await fixture.startBroker();
    const stop = broker.stop.bind(broker);
    const entered = deferred();
    const release = deferred();
    const failure = new Error("shared stop rejection");
    let attempts = 0;
    const injection = t.mock.method(broker, "stop", async () => {
      attempts += 1;
      entered.resolve();
      await release.promise;
      if (rejects) throw failure;
      await stop();
    });
    const first = fixture.cleanup();
    const observedFirst = first.catch((error) => error);
    await entered.promise;
    const second = fixture.cleanup();
    const observedSecond = second.catch((error) => error);
    try {
      assert.equal(first, second, "concurrent cleanup returns the same pending promise");
      retained(fixture);
      assert.equal(broker.server.listening, true);
      assert.equal(attempts, 1);
      await assert.rejects(fixture.startBroker(), /closed|closing|already/i);
      release.resolve();
      const results = await Promise.all([observedFirst, observedSecond]);
      assert.deepEqual(results, rejects ? [failure, failure] : [undefined, undefined]);
      if (rejects) {
        retained(fixture);
        assert.equal(broker.server.listening, true);
        injection.mock.restore();
        await fixture.cleanup();
      }
      released(fixture, t);
    } finally {
      release.resolve();
      await Promise.all([observedFirst, observedSecond]);
      injection.mock.restore();
      await stop();
      await fixture.cleanup();
    }
  });
}

for (const pending of [false, true]) {
  test(`Scenario: Given a ${pending ? "starting" : "running"} real broker, When a duplicate start is requested, Then it is refused before constructor or endpoint effects`, async (t) => {
    const fixture = createSocketFixture(t);
    const start = ActivityStripBroker.prototype.start;
    const stop = ActivityStripBroker.prototype.stop;
    const release = deferred();
    const bound = deferred();
    const brokers = [];
    t.mock.method(ActivityStripBroker.prototype, "start", async function () {
      brokers.push(this);
      await start.call(this);
      bound.resolve();
      if (pending) await release.promise;
    });
    const createServer = net.createServer;
    let constructors = 0;
    t.mock.method(net, "createServer", (...args) => {
      constructors += 1;
      return createServer(...args);
    });
    const first = fixture.startBroker();
    await bound.promise;
    if (!pending) await first;
    const inode = fs.statSync(fixture.socketPath).ino;
    let duplicateError;
    const duplicate = fixture.startBroker().catch((error) => {
      duplicateError = error;
    });
    // Drain synchronous admission/rejection without releasing the first start.
    await Promise.resolve();
    await Promise.resolve();
    try {
      assert.equal(constructors, 1, "admission must precede broker construction");
      assert.match(duplicateError?.message ?? "", /already|started/i);
      assert.equal(fs.statSync(fixture.socketPath).ino, inode);
      assert.equal((await getBrokerStatus({ socketPath: fixture.socketPath })).ok, true);
      release.resolve();
      await Promise.all([first, duplicate]);
      await fixture.cleanup();
      released(fixture, t);
      await assert.rejects(fixture.startBroker(), /closed|closing|already/i);
      assert.equal(constructors, 1);
    } finally {
      release.resolve();
      await Promise.allSettled([first, duplicate]);
      for (const broker of brokers) await stop.call(broker);
      await fixture.cleanup();
    }
  });
}

test("Scenario: Given an in-flight real start, When cleanup begins, Then it waits for startup settlement before stopping and releasing custody", async (t) => {
  const fixture = createSocketFixture(t);
  const start = ActivityStripBroker.prototype.start;
  const stop = ActivityStripBroker.prototype.stop;
  const release = deferred();
  const bound = deferred();
  let broker;
  t.mock.method(ActivityStripBroker.prototype, "start", async function () {
    broker = this;
    await start.call(this);
    bound.resolve();
    await release.promise;
  });
  let stops = 0;
  t.mock.method(ActivityStripBroker.prototype, "stop", async function () {
    stops += 1;
    await stop.call(this);
  });
  const starting = fixture.startBroker();
  await bound.promise;
  const closing = fixture.cleanup();
  try {
    await Promise.resolve();
    assert.equal(stops, 0, "stop cannot race the unsettled start");
    retained(fixture);
    release.resolve();
    await Promise.all([starting, closing]);
    assert.equal(stops, 1);
    assert.equal(broker.server.listening, false);
    released(fixture, t);
  } finally {
    release.resolve();
    await Promise.allSettled([starting, closing]);
    await stop.call(broker);
    await fixture.cleanup();
  }
});
