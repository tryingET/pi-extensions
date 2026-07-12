// summary: "Checks broker handling of expected disconnects and reporting of unexpected socket write failures."
// read_when:
//   - "Changing activity-strip broker connection error or reply-write handling."

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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
