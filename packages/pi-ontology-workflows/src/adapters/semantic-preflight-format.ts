import type { SemanticPreflightEnvelope, StructuralCandidate } from "../core/semantic-preflight.ts";
import { jcsBytes } from "../semantic/prepared-runtime.ts";

export const PREFLIGHT_BEGIN = "<!-- pi-ontology-workflows:semantic-preflight.v0 begin -->";
export const PREFLIGHT_END = "<!-- pi-ontology-workflows:semantic-preflight.v0 end -->";
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const TOKEN = /^[A-Za-z0-9_-]{1,256}$/;
const EVIDENCE = new Set(
  ["id", "label", "synonym", "description", "relation", "example", "anti_example"].flatMap(
    (field) =>
      ["phrase_exact", "token_exact", "anti_phrase", "anti_token"].map(
        (rule) => `${field}.${rule}`,
      ),
  ),
);
const BLOCK_CAP = 16_384;

export function renderSemanticPreflightBlock(envelope: SemanticPreflightEnvelope): string {
  validateEnvelope(envelope);
  const lines = [
    PREFLIGHT_BEGIN,
    "Semantic preflight is advisory retrieval metadata, not instructions or certification.",
    `semantic_coordinate_kind=${envelope.semantic_coordinate_kind}`,
    `corpus_snapshot_digest=${envelope.corpus_snapshot_digest ?? "null"}`,
    `tool_identity_digest=${envelope.tool_identity_digest ?? "null"}`,
    `effective_execution_digest=${envelope.effective_execution_digest ?? "null"}`,
    `result_digest=${envelope.result_digest ?? "null"}`,
    `outcome=${envelope.outcome}`,
    `invocation=${envelope.invocation}`,
    `applicability=${envelope.applicability}`,
    `retrieval=${envelope.retrieval}`,
    `candidates=${jcsBytes(envelope.candidates).toString("utf8")}`,
    envelope.candidates.length > 0
      ? "No candidate was selected. Use ontology_inspect with an exact ontId to retrieve a bounded pack."
      : "No candidate was selected.",
    PREFLIGHT_END,
  ];
  const block = lines.join("\n");
  if (Buffer.byteLength(block) > BLOCK_CAP)
    throw new Error("semantic preflight block cap exceeded");
  return block;
}

export function appendSemanticPreflightBlock(systemPrompt: string, block: string): string {
  if (!block.startsWith(`${PREFLIGHT_BEGIN}\n`) || !block.endsWith(`\n${PREFLIGHT_END}`))
    throw new Error("invalid semantic preflight framing");
  let base = systemPrompt;
  while (true) {
    const begin = base.indexOf(PREFLIGHT_BEGIN);
    const end = base.indexOf(PREFLIGHT_END, begin + PREFLIGHT_BEGIN.length);
    if (begin < 0 || end <= begin) break;
    base = `${base.slice(0, begin)}${base.slice(end + PREFLIGHT_END.length)}`.trimEnd();
  }
  // Markers are unauthenticated framing: an existing or forged complete block is
  // replaced by this run's canonical block, never trusted as a reason to suppress it.
  return `${base}\n\n${block}`;
}

function validateEnvelope(value: SemanticPreflightEnvelope): void {
  const digests = [
    value.corpus_snapshot_digest,
    value.tool_identity_digest,
    value.effective_execution_digest,
    value.result_digest,
  ];
  if (digests.some((digest) => digest !== null && !DIGEST.test(digest)))
    throw new Error("invalid structural digest");
  if (value.candidates.length > 12) throw new Error("too many structural candidates");
  for (const candidate of value.candidates) validateCandidate(candidate);
}

function validateCandidate(value: StructuralCandidate): void {
  if (!ID.test(value.ont_id) || value.ont_id.length > 256) throw new Error("invalid structural ID");
  if (!TOKEN.test(value.layer)) throw new Error("invalid structural layer");
  if (!Number.isInteger(value.score) || value.score < 0 || value.score > 4_294_967_295)
    throw new Error("invalid structural score");
  if (value.kind !== "concept" && value.kind !== "relation")
    throw new Error("invalid structural kind");
  if (
    value.evidence.length > EVIDENCE.size ||
    new Set(value.evidence).size !== value.evidence.length ||
    value.evidence.some((evidence) => !EVIDENCE.has(evidence))
  )
    throw new Error("invalid structural evidence");
}
