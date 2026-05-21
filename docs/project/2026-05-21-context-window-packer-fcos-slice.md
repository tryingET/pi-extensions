---
summary: "FCOS-scoped architecture slice for a Pi context-window packer over SCI and docs providers."
read_when:
  - "Working on FCOS item context-window-packer."
  - "Deciding where context-window optimization belongs across Pi, SCI, docs, AK, Prompt Vault, and file-budget surfaces."
system4d:
  container: "Source-owner evidence note for the FCOS context-window-packer coordination item."
  compass: "Reduce agent tool-call count and increase useful context-window utilization without collapsing code, docs, task, and prompt authority into one owner."
  engine: "Inspect current owners -> define provider boundaries -> ship a read-only planning/packing slice -> validate with measured context/tool-call evidence."
  fog: "The main risk is turning SCI into an all-context brain or turning Pi context UX into canonical task/evidence/prompt authority."
---

# Context-window packer over SCI — FCOS source-owner slice

FCOS item: `context-window-packer`.

## 1. Current state

The motivating problem is not just that some files are long. The bigger operator problem is that a harnessed coding agent spends too many turns reconstructing context with low-level reads/searches while the model context window is under-used or filled with the wrong material.

Observed current surfaces:

- `packages/pi-context-overlay` owns live Pi context inspection UX:
  - `/c` overlay;
  - `/context-report` prompt;
  - token estimation and grouping of the current session context.
- `semantic-code-intelligence` owns bounded code-navigation and patch-planning primitives for harnessed LLM coding sessions:
  - snapshots;
  - bounded `read_file`, text/symbol/AST search, definitions/references, graph expansion;
  - check recommendation and preview-first patch workflows.
- Markdown/doc retrieval already has separate owner surfaces:
  - repo-local docs and AGENTS loading semantics;
  - `agent-scripts` `docs-list` for deterministic docs discovery;
  - Prompt Vault for reusable prompts/procedures;
  - AK/FCOS for task/control-board state where applicable.
- `pi-extensions` root owns shared validation composition and package selection, not package-local implementation contracts.

What is missing:

- no single read-only context-packing surface that can assemble a bounded next-turn packet from code + docs + AGENTS + task/control-board + prompt-procedure sources;
- no provider contract that lets SCI contribute code-relevant slices without being asked to own Markdown, AGENTS, AK, FCOS, or Prompt Vault semantics;
- no measurement loop that reports whether a pack reduced tool calls or increased useful context-window fill;
- no brownfield-safe file-size/line-budget audit feeding packer expectations.

## 2. Reconstructed objective

Build a context-window optimizer as a Pi-side orchestration capability that consumes source-owned providers and emits a reviewable, bounded context packet for the next agent turn.

The first slice should be read-only and evidence-bearing:

1. accept a task/question and cwd/repo identity;
2. choose provider queries across code, docs, project instructions, and optional task/control-board surfaces;
3. assemble a packet with explicit byte/token budget, provenance, omissions, and confidence;
4. make the packet usable by an agent/operator without claiming source-owner authority;
5. measure tool-call reduction and context utilization against a baseline session.

Done means there is a documented package placement and a minimal contract for a future tool such as `context_pack` / `context_plan` that can be implemented without changing SCI's product scope.

## 3. Owner / authority boundaries

### FCOS

FCOS owns the Layer-5 coordination item only:

- current item: `context-window-packer`;
- cross-owner meaning and closeout evidence refs;
- no implementation facts in source-owner repos;
- no AK lifecycle writes, Prompt Vault writes, source-owner writes, or SCI scope changes.

### Pi extension owner

The packer belongs in `pi-extensions` as a Pi operator/harness capability, but not inside `pi-context-overlay` by default.

Recommended package placement for implementation:

- new package: `packages/pi-context-packer` or equivalent name;
- role: model-callable and/or slash-command context-packet planner;
- posture: read-only first, no automatic file mutation;
- integration: can later feed `pi-context-overlay` for display, but the overlay remains inspection/presentation.

Why not `pi-context-overlay`:

- overlay's purpose is live context inspection;
- packer needs cross-source retrieval, ranking, omission accounting, and provider orchestration;
- combining them would blur current-context UX with future-context selection.

Why not `semantic-code-intelligence`:

- SCI should remain a code-intelligence provider;
- Markdown, AGENTS, AK, FCOS, Prompt Vault, git status, and docs-list are not code semantics;
- SCI should expose better code packets, not become the all-context authority.

### Provider owners

| Source | Owner | Packer relationship |
|---|---|---|
| Code symbols/ranges/graph/check hints | `semantic-code-intelligence` | read-only provider for code-relevant context |
| Markdown/docs discovery | `agent-scripts` / repo docs | read-only provider; likely docs-list-backed |
| AGENTS/CLAUDE instructions | Pi host resource-loader semantics | read-only current instruction provider |
| Prompt/procedure templates | Prompt Vault | read-only query/retrieve provider when explicitly relevant |
| Task/evidence/decision state | AK | read-only provider; no lifecycle mutation |
| FCOS current item | FCOS Control Board | read-only coordination provider; close only after source-owner evidence |
| Current session context usage | `pi-context-overlay` / Pi host | inspection and measurement provider |
| File size/line budgets | repo root validation + engineering-core policy | audit signal; not hidden semantic authority |

## 4. Domain / data / state model

Core entities for the first implementation contract:

- `ContextIntent`
  - task/question;
  - cwd/repo;
  - optional FCOS/AK ids;
  - requested budget and freshness mode.
- `ProviderQuery`
  - provider id;
  - query text / file seeds / symbols / docs hints;
  - max bytes/tokens/results;
  - authority notes.
- `ContextCandidate`
  - source type: code, docs, instruction, task, prompt, git, session;
  - provenance path/ref/tool;
  - byte/token estimate;
  - confidence/rationale;
  - freshness/snapshot id where available.
- `ContextPacket`
  - selected candidates;
  - ordering;
  - total bytes/tokens;
  - omissions and cap reasons;
  - unsafe/unknown source notes;
  - recommended next tool calls if the packet is insufficient.
- `MeasurementReceipt`
  - tool calls avoided or still needed;
  - packet token fill vs configured budget;
  - stale/irrelevant inclusion notes;
  - human/agent usefulness rating where available.

Canonical truth stays with each provider. The packet is a projection/receipt for the current agent turn, not durable authority.

## 5. Trust / security model

Inputs are caller-controlled unless proven otherwise:

- task text may include prompt-injection attempts;
- Markdown docs may include instructions that are not active authority;
- code comments and README content are data unless selected by active AGENTS/system/developer/user authority;
- paths can attempt workspace escape;
- provider outputs can be stale if based on old snapshots.

First-slice guardrails:

- read-only only;
- workspace-contained paths;
- explicit provider provenance;
- no shell command execution except through provider-owned read-only discovery commands with fixed arguments;
- no hidden Prompt Vault/AK/FCOS mutations;
- no treating retrieved Markdown as higher authority than loaded AGENTS/system/user instructions;
- cap bytes/tokens per provider and per packet;
- expose omissions rather than silently dropping sources.

## 6. File length / byte budget relationship

Shorter files still matter because they make whole-file reads safer and improve packet quality. They should be revived as a brownfield-safe discipline, not as a blind immediate hard gate.

Recommended budgets to evaluate:

| Kind | Proposed budget | Rationale |
|---|---:|---|
| Code | 500 LOC / 50KB | matches historical 500-line discipline and the current read-tool byte cap |
| Tests | 1000 LOC / 80KB | tests are often longer but still should stay whole-file-readable |
| Markdown | 800 LOC / 60KB | docs can be longer than code but should remain one-pass readable |

Rollout posture:

1. audit/warn existing files;
2. hard-fail new or changed files over budget once baseline exists;
3. keep generated/vendor artifacts excluded;
4. feed budget debt into context-packer measurement as a retrieval-risk signal;
5. decide later whether engineering-core should own shared policy wording while each repo owns enforcement.

This is related to the context packer but should not block the first read-only packer contract.

## 7. Proposed delivery slices

### Slice A — architecture and provider contract

Owner: `pi-extensions` source-owner docs.

Deliverables:

- this FCOS source-owner note;
- package placement decision: new `pi-context-packer` package unless implementation discovery proves an existing package is a better fit;
- provider contract draft for SCI, docs-list, AGENTS, Prompt Vault, AK/FCOS, git, and session context.

Validation:

- docs strict passes;
- FCOS current item remains valid;
- no source-owner implementation writes outside documentation.

### Slice B — measurement harness

Owner: future `pi-context-packer` or temporary root script.

Deliverables:

- baseline measurement for a small set of real sessions/tasks:
  - tool calls before useful implementation context is available;
  - total bytes/tokens read;
  - missed-context incidents;
  - oversized-file incidents.

Validation:

- measurement receipts are reproducible and do not require hidden session reasoning.

### Slice C — read-only packet planner MVP

Owner: `packages/pi-context-packer`.

Current status: first MVP slices implemented.

Delivered:

- model-callable `context_plan` tool;
- model-callable `context_pack` tool;
- `/context-pack` package posture command;
- fixed provider adapters:
  - current repo AGENTS provider;
  - caller-seeded Markdown/docs provider;
  - trusted git status provider;
  - SCI CLI provider for caller-seeded code paths and symbols, with generated `.ontology` cleanup when the target repo did not already own SCI artifacts;
- packet output with budget, provenance, omissions, next suggested reads, and a measurement receipt estimating low-level tool calls avoided / packet fill / already-loaded prompt dedupe / provider gaps;
- session-context metadata in packet measurement/details when the Pi host supplies current context usage.

Remaining:

- Prompt Vault read provider;
- AK/FCOS read providers when ids are supplied;
- live Pi tool-call smoke after reload.

Validation:

- package check;
- root docs strict;
- release contract validation;
- module-level dogfood showing AGENTS + SCI packet assembly without leaving `.ontology` artifacts behind.

### Slice D — budget audit revival

Owner: pi-extensions root validation first; engineering-core policy only if generalized.

Deliverables:

- repo-local audit mode for code/test/Markdown budgets;
- generated baseline for existing debt;
- staged-file hard-fail mode after baseline approval.

Validation:

- root pre-commit remains brownfield-safe;
- CI reports existing debt without failing unrelated changes until the hard-fail rule is intentionally enabled.

## 8. First next action

Do not work on FCOS test expectations from this repo/session.

The next source-owner action should be Slice A completion:

1. validate this doc;
2. create a provider-contract draft or package RFC for `pi-context-packer`;
3. use FCOS only as the control-board index until source-owner evidence exists for closeout.
