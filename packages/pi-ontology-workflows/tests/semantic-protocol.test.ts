import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { jcsBytes, parseStrictIJson } from "../src/semantic/prepared-runtime.ts";
import {
  callerRequestDigest,
  type DiscoveryRequestValue,
  domainDigest,
  mapRocsFailure,
  validateBoundPack,
  validateCapabilities,
  validateDiscoveryResult,
} from "../src/semantic/protocol.ts";

const d = (char: string) => `sha256:${char.repeat(64)}`;
const ROCS_FIXTURES = path.resolve(
  import.meta.dirname,
  "../../../../../..",
  "core/rocs-cli/docs/project/semantic-discovery-v0",
);
const limits = {
  query_bytes: 16384,
  corpus_files: 5000,
  corpus_bytes: 33554432,
  file_bytes: 1048576,
  parser_depth: 32,
  collection_items: 10000,
  candidates: 12,
  result_bytes: 65536,
};

function validResult() {
  const tool: Record<string, unknown> = {
    kind: "development_runtime",
    manifest_digest: d("4"),
    python_version: "3.12.10",
    unicode_data: "15.0.0",
  };
  tool.digest = domainDigest("rocs.tool-identity.v0", tool);
  const result: Record<string, unknown> = {
    schema: "semantic-discovery-result.v0",
    caller_request_digest: d("1"),
    corpus_snapshot_digest: d("2"),
    tool_identity: tool,
    effective_execution_digest: d("3"),
    algorithm: { id: "rocs-lexical-v0", unicode_data: "15.0.0" },
    retrieval: "unique_candidate",
    candidates: [
      {
        rank: 1,
        ont_id: "core.Agent",
        kind: "concept",
        layer: "core",
        score: 400,
        matched_query_tokens: ["agent"],
        evidence: [{ field: "label", rule: "token_exact", query_term: "agent" }],
        document_digest: d("5"),
      },
    ],
    effective_limits: limits,
    truncated: false,
  };
  result.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: result.caller_request_digest,
    corpus_snapshot_digest: result.corpus_snapshot_digest,
    tool_identity: result.tool_identity,
    algorithm: result.algorithm,
    effective_limits: result.effective_limits,
  });
  result.result_digest = domainDigest("rocs.discovery-result.v0", result);
  return result;
}

test("capability, discovery, tamper, and closed error mappings", () => {
  validateCapabilities({
    schema: "semantic-discovery-capabilities.v0",
    request_schemas: ["semantic-discovery-request.v0"],
    result_schemas: ["semantic-discovery-result.v0"],
    pack_schemas: ["semantic-pack-result.v0"],
    error_schemas: ["rocs-error.v0"],
    algorithms: ["rocs-lexical-v0"],
    unicode_data: ["15.0.0"],
    platforms: ["linux"],
  });
  const result = validResult();
  assert.equal(
    validateDiscoveryResult(result, { manifestDigest: d("4") }).candidates[0]?.ont_id,
    "core.Agent",
  );
  const tampered = structuredClone(result);
  const candidate = (tampered.candidates as Array<Record<string, unknown>>)[0];
  assert.ok(candidate);
  candidate.score = 101;
  assert.throws(() => validateDiscoveryResult(tampered), /score\/evidence|digest mismatch/);
  for (const [kind, expected] of [
    ["resource_exhausted", "resource_exhausted"],
    ["invalid_request", "incompatible"],
    ["unsupported_identity", "incompatible"],
    ["incompatible", "incompatible"],
    ["invalid_ontology", "unavailable"],
    ["snapshot_changed", "unavailable"],
    ["internal", "unavailable"],
  ] as const) {
    assert.equal(
      mapRocsFailure({
        ok: false,
        error: { schema: "rocs-error.v0", kind, message: "safe", caller_request_digest: null },
      }),
      expected,
    );
  }
  assert.equal(mapRocsFailure({ nope: true }), "incompatible");
});

test("strict I-JSON rejects duplicate keys and invalid scalar/number values", () => {
  for (const raw of [
    Buffer.from('{"x":1,"x":2}'),
    Buffer.from('{"x":1,"\\u0078":2}'),
    Buffer.from('{"n":1.5}'),
    Buffer.from('{"n":-1}'),
    Buffer.from('{"n":9007199254740992}'),
    Buffer.from('{"s":"\\ud800"}'),
  ])
    assert.throws(() => parseStrictIJson(raw), /JSON|duplicate|integer|Unicode/);
});

test("RFC8785 accepts non-BMP scalars and orders keys by UTF-16 code units", () => {
  assert.equal(jcsBytes({ "\ue000": 1, "\u{10000}": 2 }).toString(), '{"𐀀":2,"":1}');
  assert.equal(jcsBytes({ emoji: "😀" }).toString(), '{"emoji":"😀"}');
  assert.throws(() => jcsBytes({ invalid: "\ud800" }), /Unicode scalar/);
});

test("ROCS golden and differential canonical fixtures execute in the TypeScript verifier", async () => {
  const golden = JSON.parse(
    await readFile(path.join(ROCS_FIXTURES, "golden-fixtures.json"), "utf8"),
  );
  const differential = JSON.parse(
    await readFile(path.join(ROCS_FIXTURES, "differential-fixtures.json"), "utf8"),
  );
  const valid = golden.valid;
  const preimages: Record<string, unknown> = {
    caller_request: valid.request,
    corpus_snapshot: { ...valid.corpus_snapshot, corpus_snapshot_digest: undefined },
    tool_identity: { ...valid.tool_identity, digest: undefined },
    effective_execution: { ...valid.effective_execution, effective_execution_digest: undefined },
    result: { ...valid.result, result_digest: undefined },
    pack: { ...valid.pack, pack_digest: undefined },
  };
  for (const key of ["corpus_snapshot", "tool_identity", "effective_execution", "result", "pack"])
    delete (preimages[key] as Record<string, unknown>)[
      key === "tool_identity"
        ? "digest"
        : key === "effective_execution"
          ? "effective_execution_digest"
          : key === "corpus_snapshot"
            ? "corpus_snapshot_digest"
            : `${key}_digest`
    ];
  for (const [key, fixture] of Object.entries(differential.canonical_preimages)) {
    if (!(key in preimages)) continue;
    const bytes = jcsBytes(preimages[key]);
    assert.equal(bytes.toString("hex"), (fixture as { jcs_utf8_hex: string }).jcs_utf8_hex, key);
    assert.equal(bytes.length, (fixture as { byte_length: number }).byte_length, key);
  }
  assert.equal(
    validateDiscoveryResult(valid.result, {
      request: valid.request as DiscoveryRequestValue,
      requestDigest: golden.digests.caller_request_digest,
      manifestDigest: valid.tool_identity.manifest_digest,
      pythonVersion: valid.tool_identity.python_version,
    }).result_digest,
    golden.digests.result_digest,
  );
  assert.equal(
    validateBoundPack(valid.pack, {
      snapshotDigest: valid.pack.corpus_snapshot_digest,
      rootId: valid.pack.root_id,
      documentDigest: valid.pack.root_document_digest,
      config: valid.pack.config,
    }).pack_digest,
    golden.digests.pack_digest,
  );
  for (const boundary of differential.byte_boundaries)
    assert.equal(
      Buffer.from(boundary.unit_utf8_hex, "hex").length * boundary.repeat,
      boundary.expected_utf8_bytes,
    );
});

test("forged execution, Python, retrieval, evidence, request, and pack config fail closed", () => {
  const request: DiscoveryRequestValue = {
    schema: "semantic-discovery-request.v0",
    query: "agent",
    identity_selector: { kind: "development_snapshot" },
    profile: "review",
    algorithm: "rocs-lexical-v0",
    limits,
  };
  const base = validResult();
  base.caller_request_digest = callerRequestDigest(request);
  base.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: base.caller_request_digest,
    corpus_snapshot_digest: base.corpus_snapshot_digest,
    tool_identity: base.tool_identity,
    algorithm: base.algorithm,
    effective_limits: base.effective_limits,
  });
  const refresh = (result: Record<string, unknown>) => {
    delete result.result_digest;
    result.result_digest = domainDigest("rocs.discovery-result.v0", result);
    return result;
  };
  refresh(base);
  const forgedExecution = structuredClone(base);
  forgedExecution.effective_execution_digest = d("9");
  assert.throws(
    () => validateDiscoveryResult(refresh(forgedExecution), { request }),
    /effective execution/,
  );
  assert.throws(
    () => validateDiscoveryResult(base, { pythonVersion: "3.12.99" }),
    /Python identity/,
  );
  const badRetrieval = structuredClone(base);
  badRetrieval.retrieval = "no_candidates";
  assert.throws(() => validateDiscoveryResult(refresh(badRetrieval)), /retrieval/);
  const badEvidence = structuredClone(base);
  const firstCandidate = (badEvidence.candidates as Array<Record<string, unknown>>)[0];
  assert.ok(firstCandidate);
  firstCandidate.score = 401;
  assert.throws(() => validateDiscoveryResult(refresh(badEvidence)), /score\/evidence/);
  const wrongLimits = structuredClone(base);
  wrongLimits.effective_limits = { ...limits, candidates: 1 };
  wrongLimits.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: wrongLimits.caller_request_digest,
    corpus_snapshot_digest: wrongLimits.corpus_snapshot_digest,
    tool_identity: wrongLimits.tool_identity,
    algorithm: wrongLimits.algorithm,
    effective_limits: wrongLimits.effective_limits,
  });
  assert.throws(
    () => validateDiscoveryResult(refresh(wrongLimits), { request }),
    /effective limits/,
  );

  const text = "x";
  const documentDigest = `sha256:${createHash("sha256").update(Buffer.from("rocs.document.v0\0", "ascii")).update(text).digest("hex")}`;
  const pack: Record<string, unknown> = {
    schema: "semantic-pack-result.v0",
    corpus_snapshot_digest: d("2"),
    root_id: "core.Agent",
    root_document_digest: documentDigest,
    config: {
      max_depth: 0,
      rel_types: [],
      include_relation_defs: false,
      max_docs: 1,
      max_bytes: 262144,
    },
    documents: [
      {
        ont_id: "core.Agent",
        kind: "concept",
        logical_path: "x",
        document_digest: documentDigest,
        text,
      },
    ],
  };
  pack.pack_digest = domainDigest("rocs.pack.v0", pack);
  assert.throws(
    () =>
      validateBoundPack(pack, {
        snapshotDigest: d("2"),
        rootId: "core.Agent",
        documentDigest,
        config: {
          max_depth: 1,
          rel_types: [],
          include_relation_defs: false,
          max_docs: 1,
          max_bytes: 262144,
        },
      }),
    /config mismatch/,
  );

  const emptyPack = structuredClone(pack);
  const emptyDocument = (emptyPack.documents as Array<Record<string, unknown>>)[0];
  assert.ok(emptyDocument);
  emptyDocument.text = "";
  emptyDocument.document_digest = `sha256:${createHash("sha256").update(Buffer.from("rocs.document.v0\0", "ascii")).digest("hex")}`;
  emptyPack.root_document_digest = emptyDocument.document_digest;
  delete emptyPack.pack_digest;
  emptyPack.pack_digest = domainDigest("rocs.pack.v0", emptyPack);
  assert.throws(
    () =>
      validateBoundPack(emptyPack, {
        snapshotDigest: d("2"),
        rootId: "core.Agent",
        documentDigest: String(emptyDocument.document_digest),
      }),
    /invalid pack document/,
  );

  const truncatedAmbiguous = structuredClone(base);
  truncatedAmbiguous.retrieval = "ambiguous_equivalence";
  truncatedAmbiguous.truncated = true;
  truncatedAmbiguous.effective_limits = { ...limits, candidates: 1 };
  truncatedAmbiguous.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: truncatedAmbiguous.caller_request_digest,
    corpus_snapshot_digest: truncatedAmbiguous.corpus_snapshot_digest,
    tool_identity: truncatedAmbiguous.tool_identity,
    algorithm: truncatedAmbiguous.algorithm,
    effective_limits: truncatedAmbiguous.effective_limits,
  });
  assert.doesNotThrow(() => validateDiscoveryResult(refresh(truncatedAmbiguous)));

  const greekRequest = structuredClone(request);
  greekRequest.query = "ΟΣ";
  const greek = validResult();
  const greekCandidate = (greek.candidates as Array<Record<string, unknown>>)[0];
  assert.ok(greekCandidate);
  greekCandidate.matched_query_tokens = ["οσ"];
  greekCandidate.evidence = [{ field: "label", rule: "token_exact", query_term: "οσ" }];
  greek.caller_request_digest = callerRequestDigest(greekRequest);
  greek.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: greek.caller_request_digest,
    corpus_snapshot_digest: greek.corpus_snapshot_digest,
    tool_identity: greek.tool_identity,
    algorithm: greek.algorithm,
    effective_limits: greek.effective_limits,
  });
  assert.doesNotThrow(() => validateDiscoveryResult(refresh(greek), { request: greekRequest }));

  const postUnicode15Request = structuredClone(request);
  postUnicode15Request.query = "\uA7F1";
  const postUnicode15 = validResult();
  const postUnicode15Candidate = (postUnicode15.candidates as Array<Record<string, unknown>>)[0];
  assert.ok(postUnicode15Candidate);
  postUnicode15Candidate.matched_query_tokens = ["s"];
  postUnicode15Candidate.evidence = [{ field: "label", rule: "token_exact", query_term: "s" }];
  postUnicode15.caller_request_digest = callerRequestDigest(postUnicode15Request);
  postUnicode15.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: postUnicode15.caller_request_digest,
    corpus_snapshot_digest: postUnicode15.corpus_snapshot_digest,
    tool_identity: postUnicode15.tool_identity,
    algorithm: postUnicode15.algorithm,
    effective_limits: postUnicode15.effective_limits,
  });
  assert.throws(
    () => validateDiscoveryResult(refresh(postUnicode15), { request: postUnicode15Request }),
    /absent from request/,
  );

  const post15LetterRequest = structuredClone(request);
  post15LetterRequest.query = "\u1C89";
  const post15Letter = validResult();
  const post15LetterCandidate = (post15Letter.candidates as Array<Record<string, unknown>>)[0];
  assert.ok(post15LetterCandidate);
  post15LetterCandidate.matched_query_tokens = ["\u1C89"];
  post15LetterCandidate.evidence = [{ field: "label", rule: "token_exact", query_term: "\u1C89" }];
  post15Letter.caller_request_digest = callerRequestDigest(post15LetterRequest);
  post15Letter.effective_execution_digest = domainDigest("rocs.effective-execution.v0", {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: post15Letter.caller_request_digest,
    corpus_snapshot_digest: post15Letter.corpus_snapshot_digest,
    tool_identity: post15Letter.tool_identity,
    algorithm: post15Letter.algorithm,
    effective_limits: post15Letter.effective_limits,
  });
  assert.throws(
    () => validateDiscoveryResult(refresh(post15Letter), { request: post15LetterRequest }),
    /token|evidence/i,
  );
});

test("bound pack verifies snapshot, root document bytes, structure, and pack digest", () => {
  const text = "---\nont:\n  id: core.Agent\n---\n";
  const documentDigest = `sha256:${createHash("sha256").update(Buffer.from("rocs.document.v0\0", "ascii")).update(text).digest("hex")}`;
  const pack: Record<string, unknown> = {
    schema: "semantic-pack-result.v0",
    corpus_snapshot_digest: d("2"),
    root_id: "core.Agent",
    root_document_digest: documentDigest,
    config: {
      max_depth: 0,
      rel_types: [],
      include_relation_defs: false,
      max_docs: 1,
      max_bytes: 262144,
    },
    documents: [
      {
        ont_id: "core.Agent",
        kind: "concept",
        logical_path: "reference/concepts/core.Agent.md",
        document_digest: documentDigest,
        text,
      },
    ],
  };
  pack.pack_digest = domainDigest("rocs.pack.v0", pack);
  assert.equal(
    validateBoundPack(pack, { snapshotDigest: d("2"), rootId: "core.Agent", documentDigest })
      .documents[0]?.text,
    text,
  );
  assert.throws(
    () => validateBoundPack(pack, { snapshotDigest: d("9"), rootId: "core.Agent", documentDigest }),
    /identity mismatch/,
  );
  const tampered = structuredClone(pack);
  const document = (tampered.documents as Array<Record<string, unknown>>)[0];
  assert.ok(document);
  document.text = `${text}x`;
  assert.throws(
    () =>
      validateBoundPack(tampered, { snapshotDigest: d("2"), rootId: "core.Agent", documentDigest }),
    /document digest mismatch/,
  );
});
