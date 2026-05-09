---
summary: "Adapter contract for consuming pi-autoresearch empirical packets in external task, evidence, and knowledge systems."
read_when:
  - "You want to persist pi-autoresearch results into AK, Beads, KES, a KMS, notes, issues, or another external system."
  - "You are writing a Pi extension that consumes pi-autoresearch packets without making pi-autoresearch own your system."
  - "You need the boundary between empirical packet generation and external persistence/promotion."
type: "contract"
system4d:
  container: "Package-local packet contract for downstream adapters; not an external persistence implementation."
  compass: "Make pi-autoresearch portable by producing stable empirical packets while adapters own their target systems."
  engine:
    invariants:
      - "pi-autoresearch generates packets; adapters persist or promote them."
      - "Packets are non-mutating until an adapter or controller explicitly writes to its owner system."
      - "Target systems such as AK, Beads, KES, KMS, notes, issues, and databases retain their own authority rules."
  fog:
    risks:
      - "A packet is mistaken for canonical task/evidence truth before an adapter records it."
      - "pi-autoresearch grows bespoke integrations for every downstream system."
      - "Adapters silently infer task identity or promotion authority from local receipts."
---

# pi-autoresearch adapter contracts

`pi-autoresearch` should be portable across societies, teams, and personal workflows.

The package owns **bounded empirical packet generation**:

```text
run receipts -> segment closeout -> evidence/oracle/learning packets
```

Adapters own **external persistence and promotion**:

```text
packet -> AK / Beads / KES / KMS / notes / issue tracker / DSPx Oracle preflight / custom DB
```

This contract lets downstream Pi extensions add their own task, evidence, or knowledge management systems without bloating `pi-autoresearch` or making it the owner of those systems.

## Boundary rule

`pi-autoresearch` may produce adapter-ready packets, but it must not silently write to external authority systems.

| Concern | Owner |
|---|---|
| Empirical run receipts, measurement interpretation, closeout packets | `pi-autoresearch` |
| Visible candidate worktree creation | `candidate_peer_spawn` / peer tooling |
| Canonical task state and task evidence | AK, Beads, or the selected task-system adapter |
| Durable human learning | KES, KMS, notes, or the selected knowledge adapter |
| Shared empirical memory | DSPx Oracle publication/preflight surfaces; dedicated Oracle Postgres/pgvector where explicitly published |
| Ontology / semantic meaning | ROCS / ontology owner |
| Prompt procedures | Prompt Vault |

## Contract discovery

Adapters can inspect the current package contract catalog without running a benchmark or writing to any external system:

```ts
autoresearch_runtime_status({ action: "adapter_contracts", cwd })
```

The returned catalog has packet kind `autoresearch.adapter_contracts.v1` and lists each current packet kind, producer action, target kinds, required fields, optional fields, summary, and boundary. It is descriptive only; adapters must still validate the actual packet they receive.

Adapters can also request structural validation of a packet before planning a target write:

```ts
autoresearch_runtime_status({ action: "validate_packet", packet })
```

The validation result has packet kind `autoresearch.adapter_validation.v1`, reports the validated packet kind/version, and lists structural issues. This is intentionally not a target-authority check: adapters still own exact task ids, vault paths, endpoints, dry-run/apply posture, permissions, and persistence receipts.

## Current packet kinds

### `autoresearch.oracle_evidence.v1`

Produced by:

```ts
autoresearch_runtime_status({ action: "oracle_evidence", cwd })
autoresearch_runtime_status({ action: "oracle_evidence_export", cwd, outPath })
```

Purpose:

- emit run-level Oracle-readable empirical records from the current campaign closeout
- provide a DSPx-owner preflight handoff for later curated publication
- preserve the boundary that pi-autoresearch does not write Oracle Postgres, migrate local `coordinates.db`, write AK/KES, choose winners, or promote

Current fields include:

```ts
interface AutoresearchOracleEvidencePacketV1 {
  packetKind: "autoresearch.oracle_evidence.v1";
  adapterContractVersion: 1;
  targetKinds: Array<"dspx_oracle" | "empirical_memory" | "evidence" | "adapter_source" | string>;
  cwd: string;
  campaign: string | null;
  sourceArtifacts: {
    closeoutPacketKind: "autoresearch.closeout.v1";
    receiptPath: string;
  };
  records: AutoresearchOracleEvidenceRecord[];
  publicationPreflight: {
    status: "ready_for_dspx_owner_review" | "blocked_no_campaign_evidence";
    target: "dspx_oracle_postgres_pgvector";
    sharedOracleMutated: false;
    localCoordinatesDbMigrated: false;
    canonicalAuthorityMutated: false;
    blockedReasons: string[];
    suggestedDspxOwnerAction: string;
    suggestedDspxPreflightCommandTemplate: string;
  };
  adapterBoundary: string;
  evidenceBoundary: string;
  authorityBoundary: string;
}
```

This packet is deliberately one seam below DSPx publication. `action: "oracle_evidence_export"` writes the packet JSON locally under `cwd/.autoresearch/` (default `.autoresearch/oracle_evidence.json`) so the DSPx owner surface can run `dspx oracle autoresearch-evidence publish-preflight --packet <exported-packet> ...`. The export action is a local write, is not available in read profile, rejects absolute/path-escape destinations, and requires `overwrite: true` when replacing an existing file. `pi-autoresearch` itself does not call DSPx publication commands, write Oracle Postgres, or mutate shared Oracle memory.

### `autoresearch.candidate_result.v1`

Produced by:

```ts
autoresearch_runtime_status({ action: "candidate_result", cwd })
autoresearch_runtime_status({ action: "candidate_result_export", cwd, outPath })
```

Purpose:

- summarize the latest visible-candidate measurement without owning candidate lifecycle
- give review/task/issue/evidence adapters a compact result object
- preserve the closeout and candidate binding for downstream traceability

Current fields include:

```ts
interface AutoresearchCandidateResultPacketV1 {
  packetKind: "autoresearch.candidate_result.v1";
  adapterContractVersion: 1;
  targetKinds: Array<"candidate_review" | "task_system" | "evidence" | "issue_tracker" | string>;
  cwd: string;
  campaign: string | null;
  candidate: AutoresearchCandidateBinding | null;
  candidateRun: AutoresearchSegmentCloseoutRun | null;
  empiricalDecisionClass: string;
  recommendedAction: string;
  resultSummary: string;
  closeout: AutoresearchSegmentCloseout;
  adapterBoundary: string;
}
```

This packet is useful for adapters that want to comment on a Beads item, issue, candidate review, or task record. `action: "candidate_result_export"` writes the packet JSON locally under `cwd/.autoresearch/` (default `.autoresearch/candidate-result.json`) for owner-visible candidate-wave review; the export action is an explicit local write, is not available in read profile, rejects absolute/path-escape destinations, and requires `overwrite: true` when replacing an existing file. It does not merge, promote, assign review authority, mutate candidate lifecycle/worktrees, write AK/KES/evidence, or treat candidate-peer messages as canonical evidence.

### `autoresearch.learning.v1`

Produced by:

```ts
autoresearch_runtime_status({ action: "learning", cwd })
autoresearch_runtime_status({ action: "learning_export", cwd, outPath })
```

Purpose:

- hand a segment learning summary to KES, Beads, notes, or another KMS
- provide Markdown plus structured closeout details
- remain non-mutating until an adapter writes it

Shape:

```ts
interface AutoresearchLearningPacketV1 {
  packetKind: "autoresearch.learning.v1";
  adapterContractVersion: 1;
  targetKinds: Array<"kes" | "kms" | "knowledge_base" | "notes" | string>;
  suggestedPath: string;
  title: string;
  markdown: string;
  closeout: AutoresearchSegmentCloseout;
  adapterBoundary: string;
}
```

Adapter examples:

- `pi-society-orchestrator` `autoresearch_learning_kes_adapter`: consume an exported packet path through the KES owner seam and materialize candidate-only diary/learning artifacts under that package.
- `pi-autoresearch-kes-adapter`: write `markdown` to repo-local `docs/learnings/` after checking local repo policy.
- `pi-autoresearch-beads-adapter`: create or annotate a Beads item with `title`, `markdown`, and receipt references.
- `pi-autoresearch-obsidian-adapter`: write a note to an operator-selected vault path.
- `pi-autoresearch-kms-http-adapter`: POST the packet to a company-owned KMS endpoint after explicit operator approval.

First non-AK consumer proof:

```bash
node examples/learning-notes-adapter-consumer.mjs --packet /path/to/autoresearch.learning.v1.json
```

This example consumes `autoresearch.learning.v1`, validates the notes target shape, confines the planned destination to `docs/learnings/`, and emits an `autoresearch.notes_adapter_dry_run.v1` receipt. It is deliberately dry-run only: it does not write files, promote learning, or make `pi-autoresearch` the notes/KES owner.

`action: "learning_export"` writes the packet JSON locally under `cwd/.autoresearch/` (default `.autoresearch/learning.json`) and returns an exact suggested owner-routed KES adapter call. The export action is a local write, is not available in read profile, rejects absolute/path-escape destinations, and requires `overwrite: true` when replacing an existing file. `pi-autoresearch` itself does not write KES, mutate AK, call notes/KMS systems, or change promotion state.

### `autoresearch.ak_evidence.v1` / `autoresearch:segment_closeout`

Produced by:

```ts
autoresearch_runtime_status({ action: "ak_evidence", cwd, akTaskId })
```

Current implementation returns an AK-shaped evidence packet with the same adapter contract header as other packets:

```ts
interface AutoresearchAkEvidencePacketV1 {
  packetKind: "autoresearch.ak_evidence.v1";
  adapterContractVersion: 1;
  targetKinds: Array<"ak" | "task_system" | "evidence_ledger" | string>;
  taskId: number;
  checkType: "autoresearch:segment_closeout";
  result: string;
  closeout: AutoresearchSegmentCloseout;
  suggestedToolCall: string;
  adapterBoundary: string;
  evidenceBoundary: string;
}
```

This packet is intentionally **non-mutating**. The current package returns a suggested explicit controller call such as:

```ts
evidence_record({
  task_id: 1234,
  check_type: "autoresearch:segment_closeout",
  result: "..."
})
```

A Beads or other task-system adapter should use the same pattern:

1. require an exact task/item id;
2. convert the closeout into the target evidence/comment schema;
3. write only through the target system's own API;
4. return the target receipt/id;
5. never infer task identity from the campaign name alone.

### `autoresearch.closeout.v1`

Produced by:

```ts
autoresearch_runtime_status({ action: "closeout", cwd })
```

Purpose:

- structured empirical segment summary
- source material for evidence and learning adapters

Current fields include the adapter contract header directly so downstream systems can validate closeout packets without wrapping them first:

```ts
interface AutoresearchSegmentCloseout {
  packetKind: "autoresearch.closeout.v1";
  adapterContractVersion: 1;
  targetKinds: Array<"adapter_source" | "evidence" | "learning" | "task_system" | "knowledge_base" | "dspx_oracle" | "empirical_memory" | string>;
  cwd: string;
  receiptPath: string;
  campaign: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: "lower" | "higher" | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  empiricalDecisionClass: string;
  empiricalPosture: {
    classification: string;
    summary: string;
    promotionReady: boolean;
    recommendedNextAction: string;
  };
  timingInterpretation: unknown | null;
  runs: AutoresearchSegmentCloseoutRun[];
  candidateBindings: AutoresearchCandidateBinding[];
  recommendedAction: string;
  oracleReadyEvidence: {
    packetKind: "autoresearch.oracle_evidence.v1";
    recordCount: number;
    preflightStatus: "ready_for_dspx_owner_review" | "blocked_no_campaign_evidence";
    target: "dspx_oracle_postgres_pgvector";
    authorityBoundary: string;
  };
  adapterBoundary: string;
  evidenceBoundary: string;
}
```

Adapters should prefer this structured closeout over scraping formatted Markdown. `empiricalPosture` is the operator-facing interpretation layer; adapters should preserve it when presenting whether a result is promotion-ready.

## Adapter design pattern

A downstream adapter Pi extension should generally expose one narrow tool per target action.

Examples:

```ts
beads_autoresearch_record_evidence({
  packet: AutoresearchAkEvidencePacketV1,
  beadId: "BD-123",
  apply: false
})
```

```ts
kes_autoresearch_write_learning({
  packet: AutoresearchLearningPacketV1,
  destinationPath: "docs/learnings/...",
  apply: false
})
```

```ts
github_autoresearch_open_issue({
  packet: AutoresearchLearningPacketV1,
  repo: "owner/repo",
  labels: ["autoresearch", "evidence"],
  apply: false
})
```

Recommended adapter behavior:

1. **Validate packet kind and version.** Reject unknown major versions.
2. **Validate target identity.** Require exact task id, bead id, repo, vault path, or endpoint.
3. **Plan before apply.** Default to dry-run/plan when the target write has durable or external effects.
4. **Preserve packet references.** Include receipt log path and empirical decision class in target records.
5. **Return target receipt.** Report the external id/path/url written by the adapter.
6. **Do not reinterpret measurement.** Adapters may add target-system metadata but should not rewrite the empirical decision.
7. **Do not promote semantics.** Ontology changes still go through ROCS/ontology flows.

## Why not implement all adapters here?

Because every target system has its own authority and safety rules.

`pi-autoresearch` should remain the empirical membrane. If it starts writing directly to every task/KMS/issue/notes system, it becomes a hidden mega-orchestrator and loses portability.

The intended ecosystem is:

```text
@tryinget/pi-autoresearch
  emits: autoresearch.closeout.v1, autoresearch.oracle_evidence.v1, autoresearch.learning.v1, autoresearch.ak_evidence.v1

third-party / local adapters
  consume packets and write to their own systems
```

This lets an external user add support for Beads, a custom KMS, or a private evidence database as a separate Pi extension without changing the core package.

## Compatibility commitment

For v1 packets:

- add optional fields only;
- do not remove existing required fields;
- do not change `packetKind` semantics in place;
- create a new major packet kind if required fields or meaning change;
- keep formatted text secondary to structured fields.

## Current non-goals

- no direct AK writes from `pi-autoresearch`;
- no Beads implementation in this package;
- no hidden external HTTP writes;
- no automatic KES file writes;
- no inference of task identity from campaign names;
- no ontology updates from empirical packets;
- no direct Oracle Postgres writes or local `coordinates.db` migration from `pi-autoresearch`.
