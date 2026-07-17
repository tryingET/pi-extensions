import { createHash } from "node:crypto";
import { jcsBytes } from "./prepared-runtime.ts";
import { unicode15Casefold } from "./unicode-casefold-15.ts";
import {
  isUnicode15Assigned,
  isUnicode15LetterOrNumber,
  isUnicode15Whitespace,
} from "./unicode-properties-15.ts";

const D = /^sha256:[0-9a-f]{64}$/;
const NAME = /^[A-Za-z0-9_-]{1,256}$/;
const ID = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const KINDS = new Set(["concept", "relation"]);
const RETRIEVAL = new Set([
  "no_candidates",
  "unique_candidate",
  "multiple_candidates",
  "ambiguous_equivalence",
  "low_confidence",
]);
const ERROR_KINDS = new Set([
  "incompatible",
  "invalid_request",
  "invalid_ontology",
  "resource_exhausted",
  "snapshot_changed",
  "unsupported_identity",
  "internal",
]);
const FIELDS = new Set([
  "id",
  "label",
  "synonym",
  "description",
  "relation",
  "example",
  "anti_example",
]);
const RULES = new Set(["phrase_exact", "token_exact", "anti_phrase", "anti_token"]);
const LIMIT_KEYS = [
  "query_bytes",
  "corpus_files",
  "corpus_bytes",
  "file_bytes",
  "parser_depth",
  "collection_items",
  "candidates",
  "result_bytes",
] as const;
const DIGEST_DOMAINS = {
  tool: "rocs.tool-identity.v0",
  result: "rocs.discovery-result.v0",
  pack: "rocs.pack.v0",
} as const;

type Obj = Record<string, unknown>;
export type DiscoveryInvocation =
  | "ok"
  | "unavailable"
  | "timeout"
  | "incompatible"
  | "resource_exhausted";
export interface DiscoveryCandidate {
  rank: number;
  ont_id: string;
  kind: "concept" | "relation";
  layer: string;
  score: number;
  matched_query_tokens: string[];
  evidence: Array<{ field: string; rule: string; query_term: string }>;
  document_digest: string;
}
export interface DiscoveryRequestValue {
  schema: "semantic-discovery-request.v0";
  query: string;
  identity_selector: { kind: "development_snapshot" };
  profile: string;
  algorithm: "rocs-lexical-v0";
  limits: Record<(typeof LIMIT_KEYS)[number], number>;
}
export interface DiscoveryResult {
  schema: "semantic-discovery-result.v0";
  caller_request_digest: string;
  corpus_snapshot_digest: string;
  tool_identity: Obj;
  effective_execution_digest: string;
  algorithm: Obj;
  retrieval: string;
  candidates: DiscoveryCandidate[];
  effective_limits: Obj;
  truncated: boolean;
  result_digest: string;
}
export interface BoundPackResult {
  schema: "semantic-pack-result.v0";
  corpus_snapshot_digest: string;
  root_id: string;
  root_document_digest: string;
  config: Obj;
  documents: Array<{
    ont_id: string;
    kind: string;
    logical_path: string;
    document_digest: string;
    text: string;
  }>;
  pack_digest: string;
}
export interface RocsErrorEnvelope {
  ok: false;
  error: {
    schema: "rocs-error.v0";
    kind: string;
    message: string;
    caller_request_digest: string | null;
  };
}

export function domainDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(Buffer.from(`${domain}\0`, "ascii"))
    .update(jcsBytes(value))
    .digest("hex")}`;
}
export function callerRequestDigest(request: unknown): string {
  return domainDigest("rocs.caller-request.v0", request);
}

export function validateCapabilities(value: unknown): void {
  const o = object(value, "capabilities");
  exact(o, [
    "schema",
    "request_schemas",
    "result_schemas",
    "pack_schemas",
    "error_schemas",
    "algorithms",
    "unicode_data",
    "platforms",
  ]);
  eq(o.schema, "semantic-discovery-capabilities.v0");
  const constants: Record<string, string[]> = {
    request_schemas: ["semantic-discovery-request.v0"],
    result_schemas: ["semantic-discovery-result.v0"],
    pack_schemas: ["semantic-pack-result.v0"],
    error_schemas: ["rocs-error.v0"],
    algorithms: ["rocs-lexical-v0"],
    unicode_data: ["15.0.0"],
    platforms: ["linux"],
  };
  for (const [key, expected] of Object.entries(constants))
    if (!same(o[key], expected)) bad(`unsupported capability ${key}`);
}

export function validateDiscoveryResult(
  value: unknown,
  expected?: {
    request?: DiscoveryRequestValue;
    requestDigest?: string;
    manifestDigest?: string;
    pythonVersion?: string;
  },
): DiscoveryResult {
  const o = object(value, "discovery result");
  exact(o, [
    "schema",
    "caller_request_digest",
    "corpus_snapshot_digest",
    "tool_identity",
    "effective_execution_digest",
    "algorithm",
    "retrieval",
    "candidates",
    "effective_limits",
    "truncated",
    "result_digest",
  ]);
  eq(o.schema, "semantic-discovery-result.v0");
  digest(o.caller_request_digest);
  digest(o.corpus_snapshot_digest);
  digest(o.effective_execution_digest);
  digest(o.result_digest);
  if (expected?.requestDigest && o.caller_request_digest !== expected.requestDigest)
    bad("caller request identity mismatch");
  if (expected?.request && o.caller_request_digest !== callerRequestDigest(expected.request))
    bad("caller request digest does not bind supplied request");
  const tool = validateTool(o.tool_identity, expected?.manifestDigest, expected?.pythonVersion);
  const algorithm = object(o.algorithm, "algorithm");
  exact(algorithm, ["id", "unicode_data"]);
  eq(algorithm.id, "rocs-lexical-v0");
  eq(algorithm.unicode_data, "15.0.0");
  if (typeof o.retrieval !== "string" || !RETRIEVAL.has(o.retrieval)) bad("invalid retrieval");
  const limits = validateLimits(o.effective_limits);
  if (expected?.request) {
    validateDiscoveryRequest(expected.request);
    if (!same(limits, expected.request.limits)) bad("effective limits do not match request");
  }
  if (typeof o.truncated !== "boolean") bad("invalid truncated flag");
  if (
    !Array.isArray(o.candidates) ||
    o.candidates.length > 12 ||
    o.candidates.length > limits.candidates
  )
    bad("invalid candidates");
  const candidates = o.candidates.map((candidate, index) =>
    validateCandidate(candidate, index + 1, expected?.request),
  );
  const ids = new Set<string>();
  for (const candidate of candidates) {
    const identity = `${candidate.ont_id}\0${candidate.kind}`;
    if (ids.has(identity)) bad("duplicate candidate identity");
    ids.add(identity);
  }
  const ordered = [...candidates].sort(
    (a, b) => b.score - a.score || utf8(a.ont_id, b.ont_id) || (a.kind === "concept" ? -1 : 1),
  );
  if (!same(candidates, ordered)) bad("candidate order mismatch");
  validateRetrieval(o.retrieval as string, candidates, o.truncated as boolean, limits.candidates);
  if (domainDigest(DIGEST_DOMAINS.tool, omit(tool, "digest")) !== tool.digest)
    bad("tool identity digest mismatch");
  const effectiveExecution = {
    schema: "semantic-effective-execution.v0",
    caller_request_digest: o.caller_request_digest,
    corpus_snapshot_digest: o.corpus_snapshot_digest,
    tool_identity: tool,
    algorithm,
    effective_limits: limits,
  };
  if (
    domainDigest("rocs.effective-execution.v0", effectiveExecution) !== o.effective_execution_digest
  )
    bad("effective execution digest mismatch");
  if (domainDigest(DIGEST_DOMAINS.result, omit(o, "result_digest")) !== o.result_digest)
    bad("result digest mismatch");
  if (jcsBytes(o).byteLength > limits.result_bytes || jcsBytes(o).byteLength > 65_536)
    bad("result byte cap exceeded");
  return o as unknown as DiscoveryResult;
}

export function validateBoundPack(
  value: unknown,
  expected: {
    snapshotDigest: string;
    rootId: string;
    documentDigest: string;
    maxBytes?: number;
    config?: {
      max_depth: number;
      rel_types: string[];
      include_relation_defs: boolean;
      max_docs: number;
      max_bytes: number;
    };
  },
): BoundPackResult {
  const o = object(value, "bound pack");
  exact(o, [
    "schema",
    "corpus_snapshot_digest",
    "root_id",
    "root_document_digest",
    "config",
    "documents",
    "pack_digest",
  ]);
  eq(o.schema, "semantic-pack-result.v0");
  digest(o.corpus_snapshot_digest);
  digest(o.root_document_digest);
  digest(o.pack_digest);
  ontId(o.root_id);
  if (
    o.corpus_snapshot_digest !== expected.snapshotDigest ||
    o.root_id !== expected.rootId ||
    o.root_document_digest !== expected.documentDigest
  )
    bad("bound pack identity mismatch");
  const config = object(o.config, "pack config");
  exact(config, ["max_depth", "rel_types", "include_relation_defs", "max_docs", "max_bytes"]);
  uint(config.max_depth);
  uint(config.max_docs, 1);
  uint(config.max_bytes, 1);
  if (
    typeof config.include_relation_defs !== "boolean" ||
    !Array.isArray(config.rel_types) ||
    !config.rel_types.every((x) => typeof x === "string" && NAME.test(x))
  )
    bad("invalid pack config");
  if (
    new Set(config.rel_types).size !== config.rel_types.length ||
    !same(config.rel_types, [...config.rel_types].sort(utf8))
  )
    bad("relation types not sorted and unique");
  if (expected.config && !same(config, expected.config)) bad("bound pack config mismatch");
  if (
    !Array.isArray(o.documents) ||
    o.documents.length < 1 ||
    o.documents.length > (config.max_docs as number)
  )
    bad("invalid pack documents");
  const docs = o.documents.map((item) => {
    const d = object(item, "pack document");
    exact(d, ["ont_id", "kind", "logical_path", "document_digest", "text"]);
    ontId(d.ont_id);
    if (
      typeof d.kind !== "string" ||
      !KINDS.has(d.kind) ||
      !logicalPath(d.logical_path) ||
      typeof d.text !== "string" ||
      Buffer.byteLength(d.text) < 1 ||
      Buffer.byteLength(d.text) > 1_048_576
    )
      bad("invalid pack document");
    digest(d.document_digest);
    if (domainRawDigest("rocs.document.v0", Buffer.from(d.text)) !== d.document_digest)
      bad("pack document digest mismatch");
    return d as unknown as BoundPackResult["documents"][number];
  });
  if (docs[0]?.ont_id !== o.root_id || docs[0]?.document_digest !== o.root_document_digest)
    bad("root document is not first");
  const remainder = [...docs.slice(1)].sort((a, b) =>
    a.kind === b.kind ? utf8(a.ont_id, b.ont_id) : a.kind === "concept" ? -1 : 1,
  );
  if (!same(docs.slice(1), remainder)) bad("pack document order mismatch");
  if (
    new Set(docs.map((d) => `${d.ont_id}\0${d.kind}`)).size !== docs.length ||
    new Set(docs.map((d) => d.logical_path)).size !== docs.length
  )
    bad("duplicate pack document");
  const textBytes = docs.reduce((sum, d) => sum + Buffer.byteLength(d.text), 0);
  if (textBytes > (config.max_bytes as number) || textBytes > (expected.maxBytes ?? 262_144))
    bad("pack byte cap exceeded");
  if (domainDigest(DIGEST_DOMAINS.pack, omit(o, "pack_digest")) !== o.pack_digest)
    bad("pack digest mismatch");
  return o as unknown as BoundPackResult;
}

export function validateErrorEnvelope(value: unknown): RocsErrorEnvelope {
  const o = object(value, "error envelope");
  exact(o, ["ok", "error"]);
  eq(o.ok, false);
  const e = object(o.error, "error");
  exact(e, ["schema", "kind", "message", "caller_request_digest"]);
  eq(e.schema, "rocs-error.v0");
  if (
    typeof e.kind !== "string" ||
    !ERROR_KINDS.has(e.kind) ||
    typeof e.message !== "string" ||
    Buffer.byteLength(e.message) < 1 ||
    Buffer.byteLength(e.message) > 4096
  )
    bad("invalid ROCS error");
  if (e.caller_request_digest !== null) digest(e.caller_request_digest);
  return o as unknown as RocsErrorEnvelope;
}

export function mapRocsFailure(value: unknown): DiscoveryInvocation {
  try {
    const envelope = validateErrorEnvelope(value);
    if (envelope.error.kind === "resource_exhausted") return "resource_exhausted";
    if (["invalid_request", "unsupported_identity", "incompatible"].includes(envelope.error.kind))
      return "incompatible";
    return "unavailable";
  } catch {
    return "incompatible";
  }
}

export function validateDiscoveryRequest(value: unknown): asserts value is DiscoveryRequestValue {
  const o = object(value, "discovery request");
  exact(o, ["schema", "query", "identity_selector", "profile", "algorithm", "limits"]);
  eq(o.schema, "semantic-discovery-request.v0");
  if (
    typeof o.query !== "string" ||
    Buffer.byteLength(o.query) < 1 ||
    Buffer.byteLength(o.query) > 16_384
  )
    bad("invalid query bytes");
  if (typeof o.profile !== "string" || !NAME.test(o.profile)) bad("invalid request profile");
  eq(o.algorithm, "rocs-lexical-v0");
  const selector = object(o.identity_selector, "identity selector");
  exact(selector, ["kind"]);
  eq(selector.kind, "development_snapshot");
  const limits = validateLimits(o.limits);
  if (Buffer.byteLength(o.query) > limits.query_bytes) bad("query exceeds effective request limit");
}

function validateTool(value: unknown, manifest?: string, pythonVersion?: string): Obj {
  const o = object(value, "tool identity");
  exact(o, ["kind", "manifest_digest", "python_version", "unicode_data", "digest"]);
  eq(o.kind, "development_runtime");
  digest(o.manifest_digest);
  digest(o.digest);
  eq(o.unicode_data, "15.0.0");
  if (typeof o.python_version !== "string" || !/^3\.12\.[0-9]+$/.test(o.python_version))
    bad("invalid Python version");
  if (manifest && o.manifest_digest !== manifest) bad("tool manifest identity mismatch");
  if (pythonVersion && o.python_version !== pythonVersion) bad("tool Python identity mismatch");
  return o;
}
function validateLimits(value: unknown): Record<(typeof LIMIT_KEYS)[number], number> {
  const o = object(value, "limits");
  exact(o, [...LIMIT_KEYS]);
  const max: Record<string, number> = {
    query_bytes: 16384,
    corpus_files: 5000,
    corpus_bytes: 33554432,
    file_bytes: 1048576,
    parser_depth: 32,
    collection_items: 10000,
    candidates: 12,
    result_bytes: 65536,
  };
  for (const key of LIMIT_KEYS) uint(o[key], 1, max[key]);
  return o as unknown as Record<(typeof LIMIT_KEYS)[number], number>;
}
function validateCandidate(
  value: unknown,
  rank: number,
  request?: DiscoveryRequestValue,
): DiscoveryCandidate {
  const o = object(value, "candidate");
  exact(o, [
    "rank",
    "ont_id",
    "kind",
    "layer",
    "score",
    "matched_query_tokens",
    "evidence",
    "document_digest",
  ]);
  if (o.rank !== rank) bad("candidate rank mismatch");
  ontId(o.ont_id);
  if (
    typeof o.kind !== "string" ||
    !KINDS.has(o.kind) ||
    typeof o.layer !== "string" ||
    !NAME.test(o.layer)
  )
    bad("invalid candidate identity");
  uint(o.score, 100);
  digest(o.document_digest);
  if (
    !Array.isArray(o.matched_query_tokens) ||
    o.matched_query_tokens.length < 1 ||
    o.matched_query_tokens.length > 256 ||
    !o.matched_query_tokens.every(token)
  )
    bad("invalid matched tokens");
  if (new Set(o.matched_query_tokens).size !== o.matched_query_tokens.length)
    bad("duplicate matched token");
  if (!Array.isArray(o.evidence) || o.evidence.length < 1 || o.evidence.length > 256)
    bad("invalid evidence");
  const evidence = o.evidence.map((item) => {
    const e = object(item, "evidence");
    exact(e, ["field", "rule", "query_term"]);
    if (
      typeof e.field !== "string" ||
      !FIELDS.has(e.field) ||
      typeof e.rule !== "string" ||
      !RULES.has(e.rule) ||
      typeof e.query_term !== "string" ||
      Buffer.byteLength(e.query_term) > 16384
    )
      bad("invalid evidence value");
    if ((e.field === "anti_example") !== e.rule.startsWith("anti_"))
      bad("invalid evidence field/rule pair");
    return e as { field: string; rule: string; query_term: string };
  });
  const evidenceIdentity = evidence.map((item) => jcsBytes(item).toString("hex"));
  if (new Set(evidenceIdentity).size !== evidence.length) bad("duplicate evidence");
  const query = request ? lexicalQuery(request.query) : undefined;
  if (query) {
    for (const item of evidence) {
      if (item.rule.includes("token") && !query.tokens.includes(item.query_term))
        bad("token evidence is absent from request");
      if (item.rule.includes("phrase") && item.query_term !== query.normalized)
        bad("phrase evidence is absent from request");
    }
  }
  const fieldOrder = [
    "id",
    "label",
    "synonym",
    "description",
    "relation",
    "example",
    "anti_example",
  ];
  const ruleOrder = ["phrase_exact", "token_exact", "anti_phrase", "anti_token"];
  const ordered = [...evidence].sort(
    (a, b) =>
      fieldOrder.indexOf(a.field) - fieldOrder.indexOf(b.field) ||
      ruleOrder.indexOf(a.rule) - ruleOrder.indexOf(b.rule) ||
      (query
        ? queryPosition(a, query) - queryPosition(b, query)
        : utf8(a.query_term, b.query_term)),
  );
  if (!same(evidence, ordered)) bad("evidence order mismatch");
  const positiveSet = new Set(
    evidence.filter((item) => item.rule === "token_exact").map((item) => item.query_term),
  );
  const positive = query ? query.tokens.filter((item) => positiveSet.has(item)) : [...positiveSet];
  if (!same(o.matched_query_tokens, positive)) bad("matched token evidence mismatch");
  if (scoreEvidence(evidence) !== o.score) bad("candidate score/evidence mismatch");
  return { ...(o as unknown as DiscoveryCandidate), evidence };
}
function validateRetrieval(
  retrieval: string,
  candidates: DiscoveryCandidate[],
  truncated: boolean,
  candidateLimit: number,
): void {
  if (truncated && candidates.length !== candidateLimit)
    bad("truncated result is not an exact top-K cardinality");
  if (retrieval === "no_candidates") {
    if (candidates.length !== 0 || truncated) bad("no-candidates retrieval mismatch");
    return;
  }
  if (candidates.length === 0) bad("retrieval cardinality mismatch");
  const top = candidates[0];
  if (!top) bad("retrieval cardinality mismatch");
  if (retrieval === "low_confidence") {
    if (top.score >= 300) bad("low-confidence score mismatch");
    return;
  }
  if (top.score < 300) bad("retrieval ignored low-confidence precedence");
  if (retrieval === "unique_candidate") {
    if (candidates.length !== 1 || truncated) bad("unique retrieval mismatch");
    return;
  }
  const ambiguous =
    candidates.length >= 2 &&
    candidates[1]?.score === top.score &&
    same(candidates[1]?.matched_query_tokens, top.matched_query_tokens);
  if (retrieval === "ambiguous_equivalence") {
    // ROCS classifies over the complete eligible set before top-K truncation. A
    // truncated result may therefore emit only the first member of an ambiguous set.
    if (!ambiguous && !truncated) bad("ambiguous retrieval mismatch");
    return;
  }
  if (retrieval === "multiple_candidates" && ((!truncated && candidates.length < 2) || ambiguous))
    bad("multiple-candidate retrieval mismatch");
}

function scoreEvidence(
  evidence: Array<{ field: string; rule: string; query_term: string }>,
): number {
  const tokenWeights: Record<string, number> = {
    id: 500,
    label: 400,
    synonym: 350,
    description: 100,
    relation: 80,
    example: 50,
    anti_example: -200,
  };
  const phraseWeights: Record<string, number> = {
    id: 1000,
    label: 800,
    synonym: 700,
    description: 200,
    relation: 160,
    example: 100,
    anti_example: -400,
  };
  let score = 0;
  for (const item of evidence)
    score += (item.rule.includes("phrase") ? phraseWeights : tokenWeights)[item.field] ?? 0;
  return Math.max(0, Math.min(4_294_967_295, score));
}

function lexicalQuery(query: string): { normalized: string; tokens: string[] } {
  // Unicode normalization is stable for already-assigned scalars, but a newer
  // host may assign and compatibility-normalize code points that were unassigned
  // in 15.0. Group only Unicode-15-assigned runs before host NFKC, then apply the
  // generated Unicode 15 casefold and category tables.
  let nfkc = "";
  let assignedRun = "";
  const flushAssigned = () => {
    nfkc += assignedRun.normalize("NFKC");
    assignedRun = "";
  };
  for (const scalar of query) {
    if (isUnicode15Assigned(scalar)) assignedRun += scalar;
    else {
      flushAssigned();
      nfkc += scalar;
    }
  }
  flushAssigned();
  const folded = unicode15Casefold(nfkc);
  let normalized = "";
  let pendingSpace = false;
  for (const scalar of folded) {
    if (isUnicode15Whitespace(scalar)) {
      if (normalized.length > 0) pendingSpace = true;
    } else {
      if (pendingSpace) normalized += " ";
      pendingSpace = false;
      normalized += scalar;
    }
  }
  const tokens: string[] = [];
  const seen = new Set<string>();
  let current = "";
  const flushToken = () => {
    if (current && !seen.has(current)) {
      seen.add(current);
      tokens.push(current);
    }
    current = "";
  };
  for (const scalar of normalized) {
    if (isUnicode15LetterOrNumber(scalar)) current += scalar;
    else flushToken();
  }
  flushToken();
  return { normalized, tokens };
}
function queryPosition(
  evidence: { rule: string; query_term: string },
  query: { normalized: string; tokens: string[] },
): number {
  if (evidence.rule.includes("phrase")) return 0;
  const index = query.tokens.indexOf(evidence.query_term);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function domainRawDigest(domain: string, bytes: Uint8Array): string {
  return `sha256:${createHash("sha256")
    .update(Buffer.from(`${domain}\0`, "ascii"))
    .update(bytes)
    .digest("hex")}`;
}
function omit(o: Obj, key: string): Obj {
  const copy = { ...o };
  delete copy[key];
  return copy;
}
function logicalPath(v: unknown): v is string {
  return (
    typeof v === "string" &&
    Buffer.byteLength(v) <= 4096 &&
    /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\\)[^\0]+$/.test(v) &&
    v.normalize("NFC") === v
  );
}
function token(v: unknown): v is string {
  return (
    typeof v === "string" &&
    Buffer.byteLength(v) <= 256 &&
    [...v].every(isUnicode15LetterOrNumber) &&
    lexicalQuery(v).normalized === v
  );
}
function ontId(v: unknown): asserts v is string {
  if (typeof v !== "string" || v.length > 256 || !ID.test(v)) bad("invalid ontology ID");
}
function digest(v: unknown): asserts v is string {
  if (typeof v !== "string" || !D.test(v)) bad("invalid digest");
}
function uint(v: unknown, min = 0, max = 4_294_967_295): asserts v is number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad("invalid integer");
}
function exact(o: Obj, keys: string[]): void {
  const a = Object.keys(o).sort();
  const b = [...keys].sort();
  if (!same(a, b)) bad("unknown or missing fields");
}
function object(v: unknown, label: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) bad(`${label} must be an object`);
  return v as Obj;
}
function eq(a: unknown, b: unknown): void {
  if (!same(a, b)) bad("constant mismatch");
}
function same(a: unknown, b: unknown): boolean {
  try {
    return jcsBytes(a).equals(jcsBytes(b));
  } catch {
    return false;
  }
}
function utf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
function bad(message: string): never {
  throw new Error(`ROCS protocol violation: ${message}`);
}
