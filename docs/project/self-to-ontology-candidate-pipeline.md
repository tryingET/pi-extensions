---
summary: "Design for a tight, controlled self-to-ontology candidate pipeline in pi-extensions: self notices semantic gaps, candidate staging records them, ontology-workflows evaluates them, and explicit review promotes them."
read_when:
  - "Deciding whether the self tool should participate in ontology extension without directly mutating ontology."
  - "Designing a controlled pipeline from self/KES-like crystallization into ontology proposal and later promotion."
system4d:
  container: "Root-level cross-package design note spanning ASC self, candidate staging, ontology-workflows, and repo-local ontology governance."
  compass: "Let ontology evolve from repeated real semantic pressure without turning self memory into ontology authority or turning ontology into a shadow diary."
  engine: "Name the control problem -> define candidate-only staging -> define proposal runtime -> define promotion gate -> define rejection feedback."
  fog: "The main risks are direct self-to-ontology mutation, uncontrolled concept proliferation, duplicate semantic drift, and cross-package ownership confusion around KES-like artifacts."
---

# Design — self to ontology candidate pipeline

## Executive summary

Yes, we should expose something that `self` can consume so ontology can evolve in a **tight, controlled, evidence-backed** way.

But the correct architecture is **not**:

```text
self -> ontology_change apply
```

The correct architecture is:

```text
self crystallization/protection
  -> semantic candidate memory
  -> candidate-only artifact staging
  -> ontology proposal runtime (gap check, scope check, collision check, suggested ids)
  -> ontology_change plan
  -> explicit review / AK-backed promotion
  -> ontology_change apply
```

That lets the system evolve its semantics from repeated real pressure while preserving ontology as a governed authority surface.

---

## A) Problem

Right now we have three useful but disconnected things:

### 1. `self` in ASC
`self` can already:

- crystallize patterns
- mark traps
- persist scoped memory across sessions

But it cannot distinguish:

- a reusable working pattern
- from a repeated semantic gap that deserves ontology treatment

### 2. KES-like candidate-only staging
We already have a proven shape for bounded, candidate-only knowledge staging:

- raw capture
- candidate artifact
- no auto-promotion

That is exactly the kind of staging discipline ontology growth needs.

### 3. `pi-ontology-workflows`
This package can:

- inspect ontology
- route by scope
- plan/apply changes
- bootstrap and manage repo-local ontology manifests

But it still starts from the assumption that a human/agent has already decided:

- yes, this is a real semantic gap
- yes, it belongs in ontology
- yes, here is the right id/scope/shape

So the missing seam is:

> a candidate-only, reviewable path between self-observed repeated semantic pressure and governed ontology mutation

---

## B) First-principles constraints

Any design must respect these constraints.

## 1. `self` is a mirror, not an authority

`self` should notice patterns and preserve candidate semantic pressure.
It should not directly change shared semantic truth.

## 2. Ontology is shared authority

Ontology should remain:

- deduplicated
- stable
- scope-aware
- explicitly promoted

not a direct sink for session-local insights.

## 3. Candidate staging must be separate from accepted ontology

The system needs an explicit pre-authority surface where ideas can be:

- proposed
- rejected
- merged
- promoted later

without contaminating `ontology/src/` immediately.

## 4. Scope must be conservative first

Default promotion target should be the **smallest truthful scope**:

- repo first
- company later
- core only when proven

## 5. Rejections should improve the system

If a semantic candidate is rejected, the system should remember why, so it does not rediscover the same bad ontology proposal repeatedly.

---

## C) Decision

## Decision in one sentence

Expose a **proposal/check runtime** from `pi-ontology-workflows`, extend `self` with **candidate-only semantic memory**, stage accepted candidates in **KES-shaped repo-local candidate artifacts**, and require **explicit review + plan/apply promotion** before any ontology mutation happens.

---

## D) Ownership split

## 1. ASC `self` owns

- semantic-gap noticing
- candidate memory
- rejection/trap feedback memory
- repeated-pattern detection across sessions

It does **not** own ontology mutation.

## 2. Candidate staging owns

- attributable candidate-only artifact creation
- evidence packet shape
- candidate status lifecycle

This should be repo-local and package-neutral in effect, even if first implemented in a narrow helper.

## 3. `pi-ontology-workflows` owns

- ontology gap checking
- nearest-match / collision analysis
- scope recommendation
- candidate-to-plan rendering
- final plan/apply ontology mutation semantics

## 4. AK / operator review owns

- promotion approval
- sequencing
- rejection / supersession / defer decisions

---

## E) Proposed pipeline

## Phase 1 — Self notices semantic pressure

Trigger examples:

- the same missing noun is repeatedly described in sessions
- the same concept is repeatedly approximated with awkward wording
- repeated ontology proposals are attempted with near-duplicate meanings
- repeated repo-local learnings suggest a stable new concept/relation

At this phase, nothing touches ontology.

Output:
- semantic candidate memory entry inside `self`

## Phase 2 — Candidate memory becomes explicit candidate artifact

When semantic pressure crosses a threshold, create a repo-local candidate artifact.

Output:
- candidate-only artifact under a repo-local staging root

## Phase 3 — Ontology proposal runtime evaluates candidate

`pi-ontology-workflows` runs:

- ontology search
- nearest collision search
- scope recommendation
- id suggestion
- relation fit check
- plan preview generation

Output:
- proposal report
- optionally `ontology_change mode=plan` payload

## Phase 4 — Explicit review / promotion decision

A human or AK-backed review decides:

- reject
- defer
- merge with another candidate
- promote to ontology plan

## Phase 5 — Apply

Only after explicit approval:

- `ontology_change mode=apply`

## Phase 6 — Feedback to self memory

- promoted candidate -> remember successful ontology promotion pattern
- rejected candidate -> mark reason as trap/protection memory

---

## F) Exact artifact schema

## 1. Self memory schema extension

### Recommendation
Introduce a new memory type in ASC self:

- `ontology_candidate`

This is better than overloading plain `pattern` because the lifecycle and downstream consumer are different.

### Proposed in-memory shape

```ts
interface OntologyCandidateMemory {
  id: string;
  type: "ontology_candidate";
  candidateKind: "concept" | "relation";
  proposedScopeHint: "repo" | "company" | "core" | "unknown";
  titleHint?: string;
  labelHints: string[];
  description: string;
  evidence: {
    files?: string[];
    commands?: string[];
    diaryRefs?: string[];
    sessionIds?: string[];
    repeatedPhrases?: string[];
  };
  confidence: number; // 0-1
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  source: "crystallized" | "inferred" | "session";
  metadata: {
    proposedIdHint?: string;
    duplicateRisk?: "low" | "medium" | "high";
    rejectionReason?: string;
    promotedTo?: string;
  };
}
```

### Persistence rule
This type should be included in the same scoped self-memory persistence family as crystallization/protection domains, but still remain candidate-only.

---

## 2. Candidate artifact schema

### Root
For this repo, use a repo-local candidate root such as:

- `docs/learnings/ontology-candidates/`

This intentionally borrows the **candidate-only** logic of KES without requiring ontology truth to live there.

### File path
Example:

```text
docs/learnings/ontology-candidates/2026-04-16--candidate-concept-benchmark-harness.md
```

### Frontmatter schema

```yaml
---
summary: "Ontology candidate: benchmark harness"
read_when:
  - "Reviewing semantic candidates before ontology promotion."
  - "Checking why a proposed ontology addition was staged instead of directly applied."
type: "reference"
ontology_candidate:
  contract_version: 1
  state: candidate
  candidate_kind: concept
  proposed_scope: repo
  proposed_id_hint: pi.extensions.BenchmarkHarness
  title: Benchmark harness
  labels:
    - Benchmark harness
  synonyms:
    - benchmark script
    - benchmark wrapper
  confidence: 0.82
  source:
    tool: self
    memory_id: ontcand-123
    session_ids:
      - session-abc
  evidence_refs:
    files:
      - docs/project/pi-autoresearch-rfc.md
      - docs/project/pi-autoresearch-ontology-concept-set.md
    diary:
      - diary/2026-04-16--analysis-pi-autoresearch.md
  duplicate_risk: medium
  nearest_existing:
    - ont_id: pi.extensions.BenchmarkMetric
      reason: adjacent but not same concept
  promotion_status: not_reviewed
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---
```

### Body sections

```markdown
# Ontology Candidate — Benchmark harness

## Why this candidate exists
<short reason>

## Evidence
- repeated semantic need in pi-autoresearch design work
- currently approximated by filename-oriented language only

## Proposed meaning
<definition>

## Why existing ontology is insufficient
<collision / non-fit explanation>

## Suggested next step
- reject | merge | plan | apply later
```

---

## 3. Proposal runtime result schema

Expose a plan-only runtime from `pi-ontology-workflows`.

### Proposed package seam

```ts
import { createOntologyProposalRuntime } from "@tryinget/pi-ontology-workflows/proposal";
```

### Proposed runtime API

```ts
interface OntologyProposalCandidate {
  candidateKind: "concept" | "relation";
  scopeHint?: "repo" | "company" | "core";
  title?: string;
  labels?: string[];
  synonyms?: string[];
  description: string;
  domain?: string;
  range?: string;
  rationale?: string;
  evidenceRefs?: string[];
}

interface OntologyProposalAssessment {
  ok: boolean;
  recommendedScope: "repo" | "company" | "core";
  recommendedTargetId?: string;
  nearestExisting: Array<{
    ontId: string;
    score: number;
    reason: string;
  }>;
  duplicateRisk: "low" | "medium" | "high";
  verdict:
    | "new_concept_candidate"
    | "new_relation_candidate"
    | "likely_duplicate"
    | "better_as_description"
    | "better_as_system4d"
    | "insufficient_evidence";
  reasoning: string;
  ontologyChangePlan?: {
    mode: "plan";
    artifactKind: "concept" | "relation";
    operation: "create" | "upsert";
    scope: "repo" | "company" | "core";
    targetId: string;
    payload: Record<string, unknown>;
  };
}

interface OntologyProposalRuntime {
  assess(
    candidate: OntologyProposalCandidate,
    ctx: { cwd: string },
  ): Promise<OntologyProposalAssessment>;
}
```

### Key rule
This runtime should **never apply** changes.
It only evaluates and, when appropriate, emits a plan-ready payload.

---

## G) Exact `self` extension shape

## Recommendation
Do **not** add a direct ontology-writing domain to `self`.

Instead, add a bounded candidate-oriented subdomain under crystallization, for example:

### Query examples
- `remember ontology candidate: benchmark harness`
- `what ontology candidates have I crystallized?`
- `is this an ontology gap?`
- `mark ontology candidate as rejected: duplicate of benchmark metric`

### Internal intent additions
Add a new intent family such as:

```ts
type CrystallizationIntent =
  | "remember_pattern"
  | "recall_patterns"
  | "query_learning"
  | "forget_pattern"
  | "remember_ontology_candidate"
  | "recall_ontology_candidates"
  | "forget_ontology_candidate"
  | "reject_ontology_candidate";
```

### Why this is better than a new top-level ontology domain
- keeps `self` as mirror/crystallization, not ontology authority
- minimizes conceptual widening
- lets protection memory absorb rejection feedback

---

## H) Promotion workflow

## Step 1 — candidate created
By `self`, from repeated semantic pressure.

## Step 2 — candidate staged
Candidate-only artifact written under repo-local candidate root.

## Step 3 — proposal assessed
`pi-ontology-workflows` proposal runtime evaluates:
- scope
- collision risk
- suggested id
- whether ontology is even the right tool

## Step 4 — review
Explicit review decides:
- reject
- merge
- defer
- promote to ontology plan

This can be:
- direct operator review
- AK-backed task review
- later a bounded orchestrator loop

## Step 5 — plan
Generate `ontology_change mode=plan` payload.

## Step 6 — apply
Only on explicit approval.

## Step 7 — feedback memory
- promoted -> record success pattern
- rejected -> protection/trap memory with reason

---

## I) Tight-control rules

### Rule 1 — no direct apply from self
Absolute.

### Rule 2 — evidence threshold before candidate staging
Require at least one:
- repeated across sessions
- repeated across files/tasks
- repeated failed attempts to express the same missing semantic slot
- explicit operator phrasing that this is a missing ontology concept/relation

### Rule 3 — collision check before plan
Always search nearest existing ontology first.

### Rule 4 — conservative scope recommendation
Default toward repo.
Move outward only with evidence.

### Rule 5 — rejection must feed protection memory
A rejected candidate should not be forgotten silently.
The system should remember why it was rejected.

### Rule 6 — candidate artifacts remain non-authoritative
They are a staging surface, not ontology truth.

---

## J) Why KES-like staging is right, but direct KES ownership is not

The **shape** of KES is right:
- raw capture
- candidate-only durable staging
- no auto-promotion

But the current package-owned KES seam belongs to orchestrator.

So the best move is:
- reuse the *discipline*
- not necessarily the exact orchestrator-owned implementation

For `pi-extensions` root work, use a repo-local candidate artifact contract inspired by KES semantics.

---

## K) Multi-order effects

## If we do this
Good effects:
- ontology evolves from repeated real usage pressure
- self becomes better at noticing semantic gaps
- rejected ontology ideas reduce future false proposals
- repo-local -> company/core promotion becomes evidence-backed

## If we skip the candidate layer
Bad effects:
- ontology becomes a session-memory sink
- duplicates rise fast
- unstable semantics get promoted too early
- the system learns churn instead of governance

---

## L) Recommended implementation order

1. **Design freeze**
   - accept this pipeline contract
2. **Proposal runtime in `pi-ontology-workflows`**
   - plan-only assessment surface
3. **Candidate artifact schema**
   - repo-local candidate staging files
4. **`self` ontology-candidate memory**
   - candidate-only crystallization extension
5. **promotion flow**
   - explicit review -> plan -> apply
6. **rejection feedback loop**
   - protection memory for bad ontology proposals

---

## M) Bottom line

Yes, we should expose something that `self` can consume.

But the correct design is:

> let `self` notice semantic gaps, let candidate staging preserve them, let `pi-ontology-workflows` evaluate them, and let explicit review decide promotion.

That is the tightest, safest way for ontology to "extend itself" without turning shared semantic truth into an ungoverned reflection of session-local thought.
