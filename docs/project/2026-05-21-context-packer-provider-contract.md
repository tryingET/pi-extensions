---
summary: "Provider contract draft for the FCOS context-window-packer slice."
read_when:
  - "Implementing or reviewing a Pi context-packer/context-plan tool."
  - "Adding SCI, docs, AGENTS, AK/FCOS, Prompt Vault, git, or session-context providers to a context packet."
system4d:
  container: "Draft provider contract for a read-only Pi context-packer package."
  compass: "Assemble high-value next-turn context from source-owned providers while preserving authority boundaries and budget visibility."
  engine: "Intent -> provider plans -> bounded candidate retrieval -> ranked packet -> measurement receipt."
  fog: "Without a provider contract, context packing becomes ad-hoc shell probing or authority-drifting mega-context."
---

# Context packer provider contract draft

Related FCOS item: `context-window-packer`.
Related source-owner note: [Context-window packer over SCI — FCOS source-owner slice](2026-05-21-context-window-packer-fcos-slice.md).

## Purpose

Define the first read-only contract for a Pi context-packer capability that can reduce low-level tool calls and make better use of large context windows.

This began as a draft implementation contract. Current first slices now exist in `packages/pi-context-packer`: `context_plan` plans provider use, and `context_pack` assembles bounded AGENTS/docs-list/git/SCI-seeded-code packets while recording omissions for unwired providers.

## Recommended package seam

Create a new Pi extension package when implementation starts:

```text
packages/pi-context-packer
```

Recommended exposed surfaces:

- model-callable tool: `context_plan` for planning only;
- model-callable tool: `context_pack` for retrieving/assembling a bounded packet;
- slash command: `/context-pack` for operator-visible package posture;
- optional integration later: display generated packet/receipt in `pi-context-overlay`.

The first implementation should expose `context_plan` before `context_pack` if there is uncertainty about provider availability or ranking.

## Non-authority statement

A context packet is a turn-local projection. It is not:

- task authority;
- evidence authority;
- Prompt Vault authority;
- FCOS closeout evidence by itself;
- a replacement for AGENTS/system/developer/user instruction precedence;
- a source-owner fact store.

## Tool inputs

### `context_plan`

```ts
interface ContextPlanInput {
  objective: string;
  cwd?: string;
  repoRoot?: string;
  budget?: ContextBudget;
  seeds?: ContextSeed[];
  providers?: ProviderSelection;
  include?: IncludePolicy;
  output?: OutputPolicy;
}
```

### `context_pack`

```ts
interface ContextPackInput extends ContextPlanInput {
  executePlan?: ContextProviderPlan;
}
```

### Shared input types

```ts
interface ContextBudget {
  maxTokens?: number;        // default: conservative, e.g. 40000
  maxBytes?: number;         // default derived from maxTokens
  perProviderMaxTokens?: Record<string, number>;
  reserveTokens?: number;    // default reserve for agent reasoning/answer
}

interface ContextSeed {
  kind: "path" | "symbol" | "task" | "fcos" | "ak" | "prompt" | "free_text";
  value: string;
  note?: string;
}

interface ProviderSelection {
  sci?: "auto" | "off" | "required";
  docs?: "auto" | "off" | "required";
  agents?: "auto" | "off" | "required";
  git?: "auto" | "off" | "required";
  session?: "auto" | "off" | "required";
  promptVault?: "auto" | "off" | "required";
  ak?: "auto" | "off" | "required";
  fcos?: "auto" | "off" | "required";
}

interface IncludePolicy {
  markdown?: boolean;
  tests?: boolean;
  generated?: boolean;       // default false
  hidden?: boolean;          // default false except active AGENTS/system files
  wholeFiles?: boolean;      // default true only when under byte budget
  snippets?: boolean;        // default true
}

interface OutputPolicy {
  format?: "json" | "markdown" | "both";
  includeOmissions?: boolean;
  includeNextToolSuggestions?: boolean;
  includeMeasurementHints?: boolean;
}
```

## Tool outputs

### `ContextProviderPlan`

```ts
interface ContextProviderPlan {
  ok: boolean;
  objective: string;
  cwd: string;
  repoRoot?: string;
  budget: Required<ContextBudget>;
  providerPlans: ProviderPlan[];
  risks: ContextRisk[];
  nonAuthorizations: string[];
}

interface ProviderPlan {
  provider: ProviderId;
  posture: "selected" | "optional" | "skipped" | "unavailable" | "blocked";
  reason: string;
  proposedQueries: ProviderQuery[];
  maxTokens: number;
  authority: string;
}

type ProviderId =
  | "sci"
  | "docs"
  | "agents"
  | "git"
  | "session"
  | "prompt_vault"
  | "ak"
  | "fcos";

interface ProviderQuery {
  id: string;
  query: string;
  seeds?: ContextSeed[];
  maxResults?: number;
  maxBytes?: number;
  maxTokens?: number;
}

interface ContextRisk {
  kind: "authority" | "staleness" | "budget" | "availability" | "path" | "prompt_injection";
  message: string;
  severity: "info" | "warning" | "blocked";
}
```

### `ContextPacket`

```ts
interface ContextPacket {
  ok: boolean;
  objective: string;
  generatedAt: string;
  cwd: string;
  repoRoot?: string;
  budget: Required<ContextBudget>;
  totals: {
    estimatedTokens: number;
    bytes: number;
    candidatesSelected: number;
    candidatesOmitted: number;
  };
  sections: ContextSection[];
  omissions: ContextOmission[];
  nextToolSuggestions: NextToolSuggestion[];
  measurementHints: MeasurementHint[];
  nonAuthorizations: string[];
}

interface ContextSection {
  id: string;
  title: string;
  provider: ProviderId;
  authority: string;
  estimatedTokens: number;
  bytes: number;
  items: ContextItem[];
}

interface ContextItem {
  id: string;
  kind: "file" | "snippet" | "symbol" | "doc" | "instruction" | "status" | "task" | "prompt";
  provenance: ContextProvenance;
  rationale: string;
  estimatedTokens: number;
  bytes: number;
  content: string;
  contentMode: "whole" | "range" | "summary" | "metadata";
  freshness?: string;
}

interface ContextProvenance {
  provider: ProviderId;
  repo?: string;
  path?: string;
  range?: { startLine?: number; endLine?: number };
  ref?: string;
  command?: string;
  snapshotId?: string;
}

interface ContextOmission {
  provider: ProviderId;
  reason: "budget" | "unavailable" | "blocked" | "low_rank" | "unsafe_path" | "generated";
  detail: string;
}

interface NextToolSuggestion {
  tool: string;
  reason: string;
  suggestedInput?: unknown;
}

interface MeasurementHint {
  metric: "tool_calls_avoided" | "packet_fill" | "oversized_file" | "provider_gap" | "stale_context";
  note: string;
}
```

## Provider requirements

### `sci` provider

Role: code intelligence only.

Current MVP calls:

- bounded `read_file` for caller-seeded code paths;
- `symbol_search` for caller-seeded symbols;
- fallback `text_search` for symbols when `symbol_search` returns no hits.

Planned later calls:

- snapshot identity;
- definitions/references;
- graph expansion;
- check recommendation.

Not permitted:

- treating SCI as Markdown/docs/AGENTS authority;
- source-owner task/evidence mutation;
- applying patches in the packer path;
- leaving generated SCI `.ontology` artifacts behind in target repos that did not already own them.

Selection rule:

- Use SCI for code-heavy objectives, named symbols, file seeds, refactor/change planning, or test-impact questions.
- If SCI is unavailable, fall back to ordinary read/search suggestions rather than pretending semantic coverage exists.

### `docs` provider

Role: deterministic Markdown/doc discovery.

Initial backing:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict
```

Implementation should prefer JSON-capable docs-list output where available, with fixed arguments and bounded path sets.

Not permitted:

- treating retrieved Markdown as instruction hierarchy above active AGENTS/system/user instructions;
- scanning personal indexes unless explicitly requested;
- unbounded workspace traversal.

Selection rule:

- Use docs provider when objective includes architecture, policy, package selection, ADRs/RFCs, validation posture, or owner boundaries.

### `agents` provider

Role: explain currently active repo/operator instructions and authority hints.

Initial backing:

- Pi host resource-loader semantics;
- already-loaded AGENTS/CLAUDE content where available;
- fallback direct reads of discovered AGENTS files only when inside workspace and relevant.

Not permitted:

- inventing precedence beyond Pi loader semantics;
- overriding system/developer/user instructions.

Selection rule:

- Always include a small authority summary for multi-owner work or mutation planning.

### `git` provider

Role: current workspace posture.

Initial backing:

- `git status --short`;
- `git diff --name-only`;
- optional diff stats with byte/line caps.

Not permitted:

- commits, resets, stashes, branch changes, or checkout operations.

Selection rule:

- Include for any implementation, validation, or closeout objective.

### `session` provider

Role: current Pi context usage and recent tool-call pressure.

Initial backing:

- Pi context usage where host exposes it;
- `pi-context-overlay` token estimation/grouping where reusable;
- no raw historical JSONL parsing unless the user asks for session-log analysis.

Not permitted:

- claiming session JSONL as canonical AK/KES/FCOS evidence;
- reading hidden thought as policy.

Selection rule:

- Include for context-window optimization, compaction decisions, or measurement tasks.

### `prompt_vault` provider

Role: reusable prompt/procedure discovery when a named method or procedure may help.

Initial backing:

- read-only `vault_query`, `vault_retrieve`, `vault_vocabulary`, `vault_dispatch_check` surfaces.

Not permitted:

- Prompt Vault mutation;
- running non-`text_ok` templates without required orchestrator posture;
- replacing task/runtime authority with reusable prompt text.

Selection rule:

- Include only when prompt/procedure selection is part of the objective.

### `ak` provider

Role: task/decision/evidence orientation where the repo is AK-registered or a task id is supplied.

Initial backing:

- read-only AK commands with timeouts;
- no DB writes;
- no task lifecycle changes.

Not permitted:

- claim/create/close/update tasks;
- evidence writes;
- decision lifecycle mutations.

Selection rule:

- Include when the objective names AK, a task id, evidence, decisions, or repo direction.

### `fcos` provider

Role: Layer-5 control-board orientation for FCOS items.

Initial backing:

- read-only `fcos status --json` and current item inspection;
- no `fcos new`/`fcos close` from the packer path.

Not permitted:

- closing FCOS items;
- writing `data/fcos.board.json`;
- treating FCOS coordination as source-owner implementation truth.

Selection rule:

- Include when the objective names an FCOS item or cross-repo coordination.

## Ranking rules

Default ranking should prefer:

1. active authority/context constraints needed to avoid wrong work;
2. directly named seeds and exact files;
3. source-owner docs explaining package placement and boundaries;
4. SCI code neighborhoods and related tests;
5. validation commands and git posture;
6. background docs/prompts only if budget remains.

Whole-file inclusion should be preferred when a file is below budget and high relevance. Otherwise include bounded ranges plus omission notes.

## Budget defaults

Initial defaults for dogfood:

```text
packet max: 40k estimated tokens
reserve:    12k estimated tokens for reasoning/answer/tool results
provider cap: 12k estimated tokens each unless required
```

These are intentionally below a 200k model window because provider output, tool schemas, system prompts, and follow-up reasoning also consume context.

## Measurement receipt

Every dogfood packet should report:

- estimated packet tokens and bytes;
- selected vs omitted candidate count;
- providers used/unavailable;
- number of low-level reads/searches avoided if known;
- whether follow-up tool calls were still needed for missing context;
- oversized-file incidents encountered.

A successful MVP should prove at least one real task where the agent reaches implementation-ready context with fewer raw `read`/`bash rg` calls than the baseline.

## First-slice path-seed membrane

The first `context_plan` implementation screens caller-controlled path seeds before provider query construction. URI/drive-letter paths, absolute paths, home-relative paths, current-directory seeds, parent traversal, backslash-separated paths, hidden/internal paths such as `.git` or `.pi-subagent-sessions`, and generated/vendor paths such as `node_modules`, `dist`, `build`, or `coverage` are omitted from provider query seeds and surfaced as blocked `path` risks. Caller-controlled `cwd` and `repoRoot` values are also screened before they are echoed as workspace posture. The first `context_pack` retrieval slice repeats workspace containment and descriptor/TOCTOU checks before reading AGENTS or Markdown files, and resolves git through trusted system paths instead of caller-controlled `PATH`. Future retrieval-capable providers must preserve the same lexical, realpath, symlink, descriptor, size, and TOCTOU checks before reading content.

## First implementation guardrail tests

Before a live package is installed, package tests should cover:

- path containment for file seeds;
- provider unavailable fallbacks;
- Markdown prompt-injection treated as data;
- budget truncation with explicit omissions;
- no mutation-capable commands in provider adapters;
- stable JSON shape for `context_plan` and `context_pack`.

## Open decisions

1. Final package name: `pi-context-packer`, `pi-context-window`, or `pi-context-planner`.
2. Whether `context_plan` and `context_pack` should be one tool with `mode`, or two tools.
3. Exact SCI invocation path in Pi: MCP/HTTP/CLI/provider extension.
4. Whether file-budget audit lives in this package as a signal or only in root validation.
5. How much current-session context can be accessed through stable Pi host APIs without coupling to internals.
