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

Yes, `self` should participate in ontology evolution, but only in a **tight, controlled, evidence-backed** way.

The bounded first slice is now landed.
But the safe architecture is still **not**:

```text
self -> ontology_change apply
```

The current truthful architecture is:

```text
self crystallization/protection
  -> ontology-candidate memory
  -> optional repo-local ontology-candidate artifact staging
  -> `ontology_proposal` assessment (gap check, scope check, collision check, suggested ids)
  -> `ontology_change mode=plan`
  -> explicit review / AK-backed promotion
  -> `ontology_change mode=apply`
```

Today the repo supports candidate-only ontology memory in `self`, plan-only ontology assessment, and a narrow repo-root ontology-candidate artifact contract.
It still does **not** support automatic file emission from `self` or automatic promotion into ontology truth.

---

## A) Problem

At this point the repo has three connected but still intentionally bounded surfaces:

### 1. `self` in ASC now has candidate-only ontology memory
`self` can now:

- crystallize ontology candidates
- recall them across sessions
- reject them with reasons
- forget them when they are no longer useful

That closes the earlier gap where ontology pressure could only live as a vague pattern.
But `self` still does **not** own file emission, ontology planning, or ontology apply.

### 2. Repo-root ontology-candidate staging now has a narrow contract
The repo now has an explicit candidate-staging contract at:

- `governance/ontology-candidates/`

That root is intentionally narrow:

- semantics-specific
- candidate-only
- repo-root
- not a generic monorepo learning bus
- not a replacement for package-owned KES seams

### 3. `pi-ontology-workflows` now exposes plan-only assessment
The package can now assess whether a candidate belongs in ontology before any mutation via:

- `ontology_proposal`

That tool handles:

- collision / nearest-existing checks
- scope recommendation
- id suggestion
- verdict classification
- optional plan-ready `ontology_change` payloads

So the missing seam is no longer “candidate memory exists at all.”
It is now the narrower question of how reviewed promotion should proceed from candidate memory and optional staging into explicit ontology planning without auto-promoting across boundaries.

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

Keep the now-landed bounded split: `self` owns **candidate-only semantic memory**, repo-root `governance/ontology-candidates/` stages only **ontology-specific candidate artifacts** when needed, `ontology_proposal` performs **plan-only assessment**, and **explicit review + AK-backed sequencing** own promotion.
No step in this pipeline should auto-write broad monorepo learning truth or `ontology_change mode=apply`.

---

## D) Ownership split

## 1. ASC `self` owns

- semantic-gap noticing
- candidate memory
- rejection/trap feedback memory
- repeated-pattern detection across sessions

It does **not** own ontology mutation or cross-package learning promotion.

## 2. Repo-root ontology-candidate staging owns

- attributable candidate-only artifact creation
- evidence packet shape
- candidate status lifecycle

This is a **narrow repo-root semantic staging surface**.
It is not a general monorepo learning sink and not a package-KES spillover surface.

## 3. `pi-ontology-workflows` owns

- ontology gap checking
- nearest-match / collision analysis
- scope recommendation
- candidate-to-plan rendering via `ontology_proposal`
- final plan/apply ontology mutation semantics after review

## 4. AK / operator review owns

- promotion approval
- sequencing
- rejection / supersession / defer decisions
- any later promotion from repo-local candidate staging into broader governed surfaces

---

## E) Bounded pipeline

## Phase 1 — `self` notices semantic pressure

Trigger examples:

- the same missing noun is repeatedly described in sessions
- the same concept is repeatedly approximated with awkward wording
- repeated ontology proposals are attempted with near-duplicate meanings
- repeated repo-local learnings suggest a stable new concept/relation

At this phase, nothing touches ontology.

Output:
- semantic candidate memory entry inside `self`

## Phase 2 — Candidate memory may become an explicit candidate artifact

When durable repo-local staging is warranted, create a candidate artifact under the repo contract.

Current boundary:
- `self` does **not** auto-emit that file
- candidate staging is optional and review-preserving
- repo-root staging is reserved for ontology-specific semantic candidates

Output:
- candidate-only artifact under `governance/ontology-candidates/` when warranted

## Phase 3 — `ontology_proposal` evaluates the candidate

`pi-ontology-workflows` runs:

- ontology search
- nearest collision search
- scope recommendation
- id suggestion
- relation fit check
- plan preview generation

Output:
- proposal report
- optionally a plan-ready `ontology_change mode=plan` payload

## Phase 4 — Explicit review / promotion decision

A human or AK-backed review decides:

- reject
- defer
- merge with another candidate
- promote to ontology plan

## Phase 5 — Plan / apply

Only after explicit approval:

- `ontology_change mode=plan`
- later, if approved, `ontology_change mode=apply`

## Phase 6 — Feedback to `self` memory

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
For this repo, use the repo-local candidate root:

- `governance/ontology-candidates/`

This intentionally borrows the **candidate-only** logic of KES without requiring ontology truth to live there.
It is a narrow repo-root semantic staging surface, not a generic monorepo `docs/learnings/` dumping ground and not a replacement for package-owned KES.

### File path
Example:

```text
governance/ontology-candidates/2026-04-16--candidate-concept-benchmark-harness.md
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

## Current landed surface
Do **not** add a direct ontology-writing domain to `self`.

The landed bounded extension lives under crystallization and currently supports queries such as:

- `remember ontology candidate: benchmark harness`
- `what ontology candidates have I crystallized?`
- `mark ontology candidate as rejected: duplicate of benchmark metric`
- `forget ontology candidate`

The corresponding intent family now exists to remember, recall, reject, and forget ontology candidates without widening `self` into ontology authority.

### Why this is better than a new top-level ontology domain
- keeps `self` as mirror/crystallization, not ontology authority
- minimizes conceptual widening
- lets protection memory absorb rejection feedback
- keeps promotion outside `self`, where review and ontology governance still apply

---

## H) Promotion workflow

## Step 1 — candidate created
By `self`, from repeated semantic pressure or explicit operator instruction.

## Step 2 — optional durable staging
If a repo artifact is warranted, stage a candidate-only note under `governance/ontology-candidates/`.
`self` does **not** auto-write this file.

## Step 3 — proposal assessed
`ontology_proposal` evaluates:
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
Generate or refine the `ontology_change mode=plan` payload.

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

But the current package-owned KES seam belongs to orchestrator, and this repo now explicitly treats learning as **federated by owner**.

So the best move is:
- reuse the *discipline*
- keep package-owned KES package-owned
- use repo-root `governance/ontology-candidates/` only for ontology-specific repo-root semantic staging
- do **not** generalize this into a monorepo-wide learning bus

For `pi-extensions` root work, use a repo-local candidate artifact contract inspired by KES semantics without collapsing package and repo ownership boundaries.

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

1. **Foundation pieces now landed**
   - `ontology_proposal` plan-only assessment surface
   - `self` ontology-candidate memory
   - repo-local ontology-candidate artifact contract
2. **Add a controlled writer/helper only if needed**
   - materialize candidate files without auto-promoting
3. **Add explicit review workflow / AK gating**
   - merge, defer, reject, or promote candidates intentionally
4. **Harden the rejection feedback loop**
   - keep bad ontology ideas from being rediscovered repeatedly
5. **Only later consider extra automation**
   - and only if the review-preserving boundary remains truthful

---

## M) Bottom line

Yes, `self` should expose ontology-candidate memory.

But the correct design is now more specific:

> let `self` notice semantic gaps, let narrow repo-root ontology-candidate staging preserve them only when warranted, let `ontology_proposal` evaluate them, and let explicit review decide promotion.

That is the tightest, safest way for ontology to evolve without turning shared semantic truth into an ungoverned reflection of session-local thought or turning repo-root learning surfaces into a shadow monorepo authority.
