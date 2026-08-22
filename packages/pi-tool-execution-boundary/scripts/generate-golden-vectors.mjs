import { writeFile } from "node:fs/promises";
import { encodeDeterministicCbor, domainSeparatedDigest } from "../src/canonical-cbor.js";
import { normalizePolicy, policySemanticBody } from "../src/policy.js";
import { normalizeRequestedOperation, operationSemanticBody, requestedCallSemanticBody } from "../src/operations.js";
import { compileSemanticPlan, planSemanticBody } from "../src/plan.js";

function vector(name, domain, body) {
  return {
    name,
    domainTextWithoutTerminator: domain,
    domainUtf8Hex: Buffer.from(`${domain}\0`, "utf8").toString("hex"),
    semanticBody: toJson(body),
    deterministicCborHex: encodeDeterministicCbor(body).toString("hex"),
    sha256: domainSeparatedDigest(domain, body),
  };
}

function toJson(value) {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value?.constructor?.name === "ByteString") {
    const bytes = Buffer.isBuffer(value) ? value : value.toBuffer();
    return { $bytesHex: bytes.toString("hex") };
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJson(entry)]));
  }
  return value;
}

const policy = normalizePolicy();
const plan = compileSemanticPlan(policy);
const readOperation = normalizeRequestedOperation({ kind: "read", path: "src/main.ts", offset: 0, limit: 200 });
const writeX = normalizeRequestedOperation({ kind: "write", path: "a.txt", content: "x" });
const writeY = normalizeRequestedOperation({ kind: "write", path: "a.txt", content: "y" });
const common = {
  callId: "018f0000-0000-7000-8000-000000000001",
  clientSessionId: "session-1",
  clientEpoch: "epoch-1",
  leaseId: "lease-1",
  requestedTimeoutMs: 1_000,
  expectedWorkspaceGeneration: 1,
};

const vectors = {
  schema: "pi-tool-boundary-cbor-vectors/v2",
  vectors: [
    vector("effective-policy-default", "pi-tool-boundary/effective-policy/v1", policySemanticBody(policy)),
    vector("requested-read-operation", "pi-tool-boundary/requested-operation/v1", operationSemanticBody(readOperation)),
    vector("requested-write-call-x", "pi-tool-boundary/requested-call/v1", requestedCallSemanticBody({ ...common, operation: writeX })),
    vector("requested-write-call-y", "pi-tool-boundary/requested-call/v1", requestedCallSemanticBody({ ...common, operation: writeY })),
    vector("semantic-plan-default", "pi-tool-boundary/semantic-plan/v1", planSemanticBody(plan)),
  ],
};

await writeFile(new URL("../canonicalization/golden-vectors.json", import.meta.url), `${JSON.stringify(vectors, null, 2)}\n`);
console.log(JSON.stringify({ vectors: vectors.vectors.length, status: "ok" }));
