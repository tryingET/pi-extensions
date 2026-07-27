import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ActivityStripBroker } from "../src/broker/server.mjs";

class FakeSocket extends EventEmitter {
  constructor(writeError) {
    super();
    this.destroyed = false;
    this.writable = true;
    this.writeError = writeError;
    this.writes = [];
  }

  setEncoding() {}

  write(value, callback) {
    this.writes.push(value);
    callback?.(this.writeError);
    return !this.writeError;
  }
}

function codedError(code) {
  return Object.assign(new Error(code), { code });
}

test("broker treats client pipe resets during reply as a normal disconnect", () => {
  const broker = new ActivityStripBroker();
  const socket = new FakeSocket(codedError("ECONNRESET"));
  const unexpected = [];
  broker.on("client-error", (error) => unexpected.push(error));

  broker.handleConnection(socket);
  socket.emit("data", `${JSON.stringify({ type: "ping" })}\n`);
  socket.emit("error", codedError("EPIPE"));

  assert.equal(socket.writes.length, 1);
  assert.deepEqual(unexpected, []);
});

test("broker treats synchronous writes to a destroyed client as a normal disconnect", () => {
  const broker = new ActivityStripBroker();
  const socket = new FakeSocket();
  const unexpected = [];
  broker.on("client-error", (error) => unexpected.push(error));
  socket.write = () => {
    throw codedError("ERR_STREAM_DESTROYED");
  };

  broker.handleConnection(socket);
  assert.doesNotThrow(() => socket.emit("data", `${JSON.stringify({ type: "ping" })}\n`));
  assert.deepEqual(unexpected, []);
});

test("broker reports unexpected socket failures without using the fatal error channel", () => {
  const broker = new ActivityStripBroker();
  const socket = new FakeSocket(codedError("EPERM"));
  const unexpected = [];
  broker.on("client-error", (error) => unexpected.push(error));

  broker.handleConnection(socket);
  socket.emit("data", `${JSON.stringify({ type: "ping" })}\n`);

  assert.equal(unexpected.length, 1);
  assert.equal(unexpected[0].code, "EPERM");
});

test("broker delegates exact session focus and returns the bounded result", async () => {
  const broker = new ActivityStripBroker({
    async focusSession(sessionId) {
      assert.equal(sessionId, "019fa4d0-7142-7fb4-8d30-f98e951f0513");
      return { ok: true, windowId: 44 };
    },
  });
  const socket = new FakeSocket();
  broker.handleConnection(socket);
  socket.emit(
    "data",
    `${JSON.stringify({ type: "focus", sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513" })}\n`,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(socket.writes.at(-1)), { type: "focus", ok: true, windowId: 44 });
});

test("broker restricts its control socket to the current user", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-activity-strip-broker-"));
  const socketDir = path.join(root, "state");
  const socketPath = path.join(socketDir, "activity-strip.sock");
  const broker = new ActivityStripBroker({ socketDir, socketPath });
  t.after(async () => {
    await broker.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  await broker.start();
  assert.equal(fs.statSync(socketDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
});
