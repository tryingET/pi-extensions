import test from "node:test";
import assert from "node:assert/strict";
import { encodeDeterministicCbor, domainSeparatedDigest } from "../src/canonical-cbor.js";

const vectors = [
  [{ 1: "microvm-offline", 2: ["read", "ls"], 3: 1, 4: true }, "a4016f6d6963726f766d2d6f66666c696e6502826472656164626c73030104f5"],
  [{ 1: "read", 2: ["src", "main.ts"], 3: 0, 4: 200 }, "a4016472656164028263737263676d61696e2e747303000418c8"],
];
for (const [body, expected] of vectors) {
  test(`canonical CBOR ${expected.slice(0, 12)}`, () => {
    assert.equal(encodeDeterministicCbor(body).toString("hex"), expected);
  });
}

test("supports signed and uint64 bigint values", () => {
  assert.equal(encodeDeterministicCbor(-1).toString("hex"), "20");
  assert.equal(encodeDeterministicCbor(0xffff_ffff_ffff_ffffn).toString("hex"), "1bffffffffffffffff");
});

test("rejects floats, arbitrary map keys, cycles, and oversized integers", () => {
  assert.throws(() => encodeDeterministicCbor(1.5), /safe integers/);
  assert.throws(() => encodeDeterministicCbor({ name: "x" }), /unsigned-integer/);
  const cycle = [];
  cycle.push(cycle);
  assert.throws(() => encodeDeterministicCbor(cycle), /cycle/);
  assert.throws(() => encodeDeterministicCbor(0x1_0000_0000_0000_0000n), /uint64/);
});

test("domain separation changes identity", () => {
  const body = { 1: "same" };
  assert.notEqual(domainSeparatedDigest("a/v1", body), domainSeparatedDigest("b/v1", body));
});
