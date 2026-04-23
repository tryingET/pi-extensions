import assert from "node:assert/strict";
import test from "node:test";

import { createFramedMessageReader, writeFramedMessage } from "../src/framing.ts";

test("writeFramedMessage prefixes JSON payloads with a 4-byte length header", () => {
  let written: Buffer | null = null;
  const socket = {
    write(buffer: Buffer) {
      written = buffer;
      return true;
    },
  };

  writeFramedMessage(socket as never, { type: "ping", value: 7 });

  if (!written) {
    throw new Error("expected the socket write to be captured");
  }

  const captured = written as Buffer;
  const payloadLength = captured.readUInt32BE(0);
  const payload = captured.subarray(4).toString("utf8");
  assert.equal(payloadLength, Buffer.byteLength(payload));
  assert.deepEqual(JSON.parse(payload), { type: "ping", value: 7 });
});

test("createFramedMessageReader reassembles fragmented messages", () => {
  const received: unknown[] = [];
  const errors: Error[] = [];
  const reader = createFramedMessageReader(
    (message) => {
      received.push(message);
    },
    (error) => {
      errors.push(error);
    },
  );

  const payload = Buffer.from(JSON.stringify({ type: "hello", value: 1 }), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  const framed = Buffer.concat([header, payload]);

  reader(framed.subarray(0, 2));
  reader(framed.subarray(2, 6));
  reader(framed.subarray(6));

  assert.deepEqual(received, [{ type: "hello", value: 1 }]);
  assert.deepEqual(errors, []);
});

test("createFramedMessageReader reports JSON parse failures", () => {
  const errors: Error[] = [];
  const reader = createFramedMessageReader(
    () => {
      throw new Error("should not receive a parsed message");
    },
    (error) => {
      errors.push(error);
    },
  );

  const payload = Buffer.from("{not-json}", "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  reader(Buffer.concat([header, payload]));

  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message ?? "", /Failed to parse peer-messaging frame/);
});
