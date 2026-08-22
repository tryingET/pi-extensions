import test from "node:test";
import assert from "node:assert/strict";
import { encodeLengthPrefixedFrame, LengthPrefixedFrameDecoder } from "../src/framing.js";

test("decodes fragmented and coalesced frames", () => {
  const first = encodeLengthPrefixedFrame(Buffer.from("hello"));
  const second = encodeLengthPrefixedFrame(Buffer.from("world"));
  const decoder = new LengthPrefixedFrameDecoder({ maxFrameBytes: 64, maxBufferedBytes: 132 });
  assert.deepEqual(decoder.push(first.subarray(0, 2)), []);
  const frames = decoder.push(Buffer.concat([first.subarray(2), second]));
  assert.deepEqual(frames.map((x) => x.toString()), ["hello", "world"]);
  decoder.end();
});

test("rejects zero, oversized, buffer overflow, and truncated frames", () => {
  const zero = Buffer.alloc(4);
  assert.throws(() => new LengthPrefixedFrameDecoder({ maxFrameBytes: 8, maxBufferedBytes: 12 }).push(zero), /outside/);
  const huge = Buffer.alloc(4); huge.writeUInt32BE(9);
  assert.throws(() => new LengthPrefixedFrameDecoder({ maxFrameBytes: 8, maxBufferedBytes: 12 }).push(huge), /outside/);
  const decoder = new LengthPrefixedFrameDecoder({ maxFrameBytes: 8, maxBufferedBytes: 12 });
  decoder.push(Buffer.from([0, 0, 0, 8, 1]));
  assert.throws(() => decoder.end(), /trailing/);
  assert.throws(() => encodeLengthPrefixedFrame(Buffer.alloc(0)), /within/);
});
