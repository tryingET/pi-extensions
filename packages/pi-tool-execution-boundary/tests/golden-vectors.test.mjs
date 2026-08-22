import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodeDeterministicCbor, domainSeparatedDigest } from "../src/canonical-cbor.js";

const document = JSON.parse(
  await readFile(new URL("../canonicalization/golden-vectors.json", import.meta.url), "utf8"),
);

function fromJson(value) {
  if (Array.isArray(value)) return value.map(fromJson);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && typeof value.$bytesHex === "string") {
      return Buffer.from(value.$bytesHex, "hex");
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fromJson(entry)]));
  }
  return value;
}

for (const vector of document.vectors) {
  test(`committed golden vector: ${vector.name}`, () => {
    const body = fromJson(vector.semanticBody);
    assert.equal(encodeDeterministicCbor(body).toString("hex"), vector.deterministicCborHex);
    assert.equal(domainSeparatedDigest(vector.domainTextWithoutTerminator, body), vector.sha256);
  });
}

test("write payload changes request identity", () => {
  const left = document.vectors.find((vector) => vector.name === "requested-write-call-x");
  const right = document.vectors.find((vector) => vector.name === "requested-write-call-y");
  assert.notEqual(left.sha256, right.sha256);
});
