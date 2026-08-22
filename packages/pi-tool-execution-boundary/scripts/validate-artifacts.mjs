import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeDeterministicCbor, domainSeparatedDigest } from "../src/canonical-cbor.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relative) => readFile(path.join(root, relative), "utf8");
const readJson = async (relative) => JSON.parse(await readText(relative));
const exists = async (relative) => access(path.join(root, relative)).then(() => true, () => false);

const pkg = await readJson("package.json");
assert.equal(pkg.name, "@tryinget/pi-tool-execution-boundary");
assert.equal(pkg.version, "0.1.0");
assert.equal(pkg.pi.extensions[0], "./extensions/tool-execution-boundary.js");
assert.equal(pkg.files.includes("tests"), false, "tests must not be published");
assert.equal(pkg.files.includes("experiments"), false, "experiments must not be published");
assert.equal(pkg.files.includes("evidence"), false, "local evidence must not be published");

for (const relative of [
  "src/index.js",
  "src/policy.js",
  "src/operations.js",
  "src/plan.js",
  "src/attestation.js",
  "src/controller.js",
  "src/sqlite-d1-authority.js",
  "src/source-snapshot-ir.js",
  "src/change-set-ir.js",
  "src/data-exposure.js",
  "protocol/pi/tool_boundary/v1/boundary.proto",
  "rust/Cargo.toml",
  "rust/crates/boundary-core/Cargo.toml",
  "rust/crates/boundary-core/src/lib.rs",
  "formal/PiToolBoundaryV03.tla",
  "formal/PiToolBoundaryV03.cfg",
  "canonicalization/golden-vectors.json",
]) {
  assert.equal(await exists(relative), true, `missing ${relative}`);
}

const runtimeIndex = await readText("src/index.js");
assert.doesNotMatch(runtimeIndex, /fake|scripted|tests\/support/i);
const runtimeFiles = await readdir(path.join(root, "src"));
assert.equal(runtimeFiles.includes("fake-backend.js"), false);
for (const filename of runtimeFiles) {
  const content = await readText(path.join("src", filename));
  assert.doesNotMatch(content, /tests\/support|ScriptedBackendPeer|ReferenceCallModel/);
}

const protocol = await readText("protocol/pi/tool_boundary/v1/boundary.proto");
assert.match(protocol, /package pi\.tool_boundary\.v1;/u);
assert.match(protocol, /message RequestedCallV1[\s\S]*oneof operation/u);
assert.doesNotMatch(protocol, /effect_class|durability_class|backend_id|host_path/iu);
assert.equal(await exists("protocol/boundary-v1.proto"), false, "obsolete protocol source must be removed");

if (process.env.REQUIRE_GENERATED_PROTO === "1") {
  assert.equal(
    await exists("protocol/generated/pi/tool_boundary/v1/boundary_pb.js"),
    true,
    "generated protocol JavaScript is required",
  );
  assert.equal(
    await exists("protocol/generated/pi/tool_boundary/v1/boundary_pb.d.ts"),
    true,
    "generated protocol declarations are required",
  );
}

const vectors = await readJson("canonicalization/golden-vectors.json");
assert.equal(vectors.schema, "pi-tool-boundary-cbor-vectors/v2");
assert.ok(vectors.vectors.length >= 5);
for (const vector of vectors.vectors) {
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
  const body = fromJson(vector.semanticBody);
  assert.equal(encodeDeterministicCbor(body).toString("hex"), vector.deterministicCborHex);
  assert.equal(domainSeparatedDigest(vector.domainTextWithoutTerminator, body), vector.sha256);
  assert.equal(Buffer.from(`${vector.domainTextWithoutTerminator}\0`).toString("hex"), vector.domainUtf8Hex);
}
assert.notEqual(vectors.vectors[2].sha256, vectors.vectors[3].sha256, "different write bytes must differ");

const requirements = await readJson("requirements/requirements-v0.3.json");
assert.equal(requirements.schema, "pi-tool-boundary-requirements-index/v1");
assert.equal(requirements.total_requirements, 143);
const ids = new Set();
let requirementCount = 0;
for (const part of requirements.parts) {
  const fragment = await readJson(path.join("requirements", part.path));
  assert.equal(fragment.domain, part.domain);
  assert.equal(fragment.specification_version, "0.3");
  assert.equal(fragment.requirements.length, part.count);
  for (const requirement of fragment.requirements) {
    assert.match(requirement.requirement_id, /^[A-Z]+-[0-9]{3}$/u);
    assert.equal(ids.has(requirement.requirement_id), false, `duplicate ${requirement.requirement_id}`);
    ids.add(requirement.requirement_id);
    requirementCount += 1;
  }
}
assert.equal(requirementCount, requirements.total_requirements);

const schema = await readJson("schemas/policy-source-v1.schema.json");
for (const field of ["cpuPsiSomeAvg10Max", "memoryPsiSomeAvg10Max", "ioPsiSomeAvg10Max"]) {
  assert.equal(schema.$defs.admission.properties[field].type, "integer");
}

const formal = await readText("formal/PiToolBoundaryV03.tla");
assert.match(formal, /DurabilityOf\(op\)/u);
assert.match(formal, /D1ExecutionDurable/u);
assert.match(formal, /D1AtMostOnce/u);
assert.match(formal, /UnknownQuarantines/u);
assert.doesNotMatch(formal, /Validate\(k,\s*c,\s*d\)/u, "caller must not choose durability");

const extension = await readText("extensions/tool-execution-boundary.js");
assert.match(extension, /realExecutionEnabled:\s*false/u);
assert.match(extension, /hostFallback:\s*false/u);
assert.doesNotMatch(extension, /registerTool\(/u, "diagnostics-only extension must not override tools");

console.log(JSON.stringify({
  package: pkg.name,
  runtimeModules: runtimeFiles.length,
  requirements: requirementCount,
  vectors: vectors.vectors.length,
  generatedProtoRequired: process.env.REQUIRE_GENERATED_PROTO === "1",
  runtimeTestDoubles: false,
  realExecutionEnabled: false,
  status: "ok",
}));
