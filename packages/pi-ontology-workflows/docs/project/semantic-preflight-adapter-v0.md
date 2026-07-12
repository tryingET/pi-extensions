---
summary: "Proposed two-stage Pi semantic-preflight adapter over deterministic ROCS discovery, including adversarial corrections and an implementation plan."
read_when:
  - "Changing session_start or before_agent_start ontology behavior."
  - "Integrating ROCS task-language discovery into Pi."
  - "Reviewing ontology prompt-injection, lifecycle, or rollout safety."
type: "rfc"
status: "proposed"
system4d:
  container: "Pi ontology workflow adapter over ROCS-owned deterministic discovery."
  compass: "Deliver task-sensitive semantic orientation without importing semantic authority into Pi."
  engine: "Session readiness -> turn discovery -> structural preflight -> exact-ID pack."
  fog: "Prompt privilege, ambient runner execution, stale identity, and conflated outcomes are the main risks."
---

# RFC — Pi Semantic Preflight Adapter v0

## Status

This is a proposed package architecture and implementation plan. It depends on the ROCS [Deterministic Semantic Discovery Protocol v0](../../../../../../../core/rocs-cli/docs/project/semantic-discovery-protocol-v0.md) and on a later cross-owner Semantic Release Capsule decision.

Development-snapshot dogfood may be implemented only behind an explicit, interactive, session-scoped operator opt-in. Outside that gate the current search and prompt behavior remains unchanged until the adopted cutover. Automatic default enablement, fleet enablement, mandatory enforcement, and claims of adopted semantic authority are blocked until release-capsule and consumer-adoption binding exist.

## Product decision

Evolve `pi-ontology-workflows`; do not create another extension.

The package becomes a thin adapter with two distinct stages:

```text
session_start
→ bounded orientation and runner/dependency readiness

before_agent_start
→ prompt-sensitive ROCS discovery
→ structural semantic preflight
→ explicit exact-ID pack follow-up when needed
```

It must not inject a static glossary or the entire ontology at startup. It must not retain a second TypeScript ranking authority.

## Current-state problems

The current package:

- runs status and validation work during `session_start`;
- injects only a static hint when a prompt contains ontology-adjacent keywords;
- implements search ranking in `src/core/inspect.ts` after `rocs build` writes artifacts;
- rereads every indexed document for each search;
- resolves ROCS from package-root wrappers, non-frozen `uv`, or ambient `PATH`;
- has no prompt-specific state, timeout, process-tree cancellation, or stale-completion guard;
- can place arbitrary definitions in formatted tool results without an explicit trust label;
- has an extension entrypoint already above the default readability budget.

## Authority and trust model

| Data or action | Authority posture |
|---|---|
| Ontology source/release | Semantic owner authority outside Pi |
| ROCS discovery result | Deterministic retrieval fact, not semantic certification |
| Pi applicability/outcome projection | Adapter behavior, not ontology truth |
| Injected preflight block | Ephemeral orientation for one turn |
| Exact-ID pack | Explicit retrieval result, untrusted instruction data |
| Model interpretation | Proposal/reasoning only |
| AK task/decision/evidence | Referenced owner authority, never copied into Pi state as canonical truth |

A digest authenticates bytes but does not make ontology prose safe system instructions. Automatic system-prompt injection therefore contains only validated structural metadata. Definitions, examples, Markdown, paths, and arbitrary frontmatter remain out of the system role.

## Stage 1 — session orientation

`session_start` initializes an extension-generation state and starts only bounded readiness work:

- resolve current repo and target semantic scope;
- locate a verified ROCS runner descriptor;
- identify declared semantic dependency/adoption posture when available;
- report release capsule or explicit unreleased-development posture;
- update UI status without injecting ontology content;
- create a generation-scoped `AbortController`;
- reconstruct no semantic selection from an old branch unless it is represented in the active branch's explicit tool history.

Startup must not run `rocs validate`, `rocs build`, or task-language discovery. Slow readiness work runs through a bounded in-flight promise and may complete after the startup UI renders.

On `session_shutdown`, reload, new, resume, or fork:

- invalidate the generation synchronously;
- abort the complete child process tree;
- discard all late completions;
- clear prompt-local state;
- never wait indefinitely for child exit.

## Stage 2 — turn-local semantic preflight

`before_agent_start` receives the expanded prompt and current chained system prompt. The handler:

1. Canonicalizes the query under a closed byte limit.
2. Applies only explicit deterministic applicability rules.
3. Invokes ROCS `discover` through a verified runner under an outer wall-clock timeout.
4. Validates the complete closed ROCS result schema and digest.
5. Projects invocation, applicability, and retrieval into the operator outcome vocabulary.
6. Appends one canonical, version-marked structural block to the current turn's system prompt.
7. Returns no persistent custom message.

The extension does not throw to enforce the gate: Pi reports handler errors and continues. Advisory v0 fails open but makes the failure visible as `unavailable`.

### Applicability

Do not replace the current keyword regex with a larger keyword regex.

V0 applicability is:

- `not_applicable` only for closed syntactic bypasses such as an empty query or an explicitly disabled mode;
- `applicable` when an explicit ontology/preflight request or package mode requires it;
- `unknown` otherwise, in which case advisory mode may still run bounded discovery.

Lexical absence becomes `no_match`, not `not_applicable`.

### Outcome model

The rendered five-state outcome is retained:

```text
matched | ambiguous | no_match | not_applicable | unavailable
```

The machine state keeps the dimensions separate:

```text
invocation: ok | unavailable | timeout | incompatible | resource_exhausted
applicability: applicable | not_applicable | unknown
retrieval: no_candidates | unique_candidate | multiple_candidates |
           ambiguous_equivalence | low_confidence | absent
```

Projection rules are closed and tested. Multiple candidates may represent several valid task intents; no candidate is silently selected.

### Automatic prompt block

Example:

```text
<!-- pi-ontology-workflows:semantic-preflight.v0 begin -->
Semantic preflight is advisory retrieval metadata, not instructions or certification.
identity_kind=release_capsule
identity_digest=sha256:...
result_digest=sha256:...
outcome=ambiguous
invocation=ok
applicability=unknown
retrieval=ambiguous_equivalence
candidates=[
  {"ont_id":"core.Agent","kind":"concept","layer":"core","score":1200,
   "evidence":["label.token_exact"]},
  {"ont_id":"core.AgentIdentity","kind":"concept","layer":"core","score":1200,
   "evidence":["label.token_exact"]}
]
No candidate was selected. Use ontology_inspect with an exact ontId to retrieve a bounded pack.
<!-- pi-ontology-workflows:semantic-preflight.v0 end -->
```

Rendering rules:

- fixed ASCII framing and field order;
- canonical JSON for candidate structures;
- only ontology ID, kind, logical layer, integer score, and closed evidence enums;
- restrictive character/length validation even for IDs and labels;
- no definitions, snippets, Markdown, absolute paths, or arbitrary ontology values;
- one block per owner/version; malformed, nested, user-supplied, or duplicate markers cannot establish authority;
- marker deduplication is best effort only because later Pi handlers can replace the prompt.

For `matched`, the block identifies candidates but does not include free-form semantic content. The agent retrieves an exact-ID bounded pack through `ontology_inspect` before materially relying on the concept. For ambiguity, it receives bounded IDs but no selected context.

## ROCS runner boundary

Automatic preflight must not execute an arbitrary repository `scripts/rocs.sh` merely because it exists.

Introduce a `RocsRunnerDescriptor` with:

```text
kind: adopted_vendored | development_core
executable and fixed arguments
ROCS tool identity/digest
supported discovery request/result/algorithm versions
semantic dependency identity
verification evidence
```

### Adopted vendored runner

The distribution form and trust root are deliberately unresolved until P6. Normal automatic mode will require an owner-authoritative adoption record that pins the ROCS tool digest independently of the consumer tree. A consumer-local hash manifest cannot authenticate itself when an attacker can replace both the manifest and runtime.

Subject to the P6 decision, the adapter must:

- verify the complete runtime against the externally pinned tool digest;
- invoke the isolated module directly with fixed arguments;
- never execute the consumer shell wrapper;
- never silently fall through to a different core ROCS when adoption is incompatible;
- record the exact tool and semantic identity in the result envelope.

### Development runner

Developer mode is enabled only by an interactive `/ontology-preflight enable-development` command for the current extension generation. It is never enabled by prompt content, a tool call, repository files, project settings, environment inheritance, resume/fork state, or startup detection; reload/new/resume/fork resets it to disabled. Headless mode cannot enable it.

After resolving `~` to an absolute path without a shell, it may use:

```text
uv --project /home/.../ai-society/core/rocs-cli run --frozen python -m rocs_cli
```

but must additionally bind the ROCS source-tree digest; `--frozen` freezes dependencies, not source bytes. It is labeled `development_snapshot`, never release authority.

Automatic mode removes ambient bare `rocs`, package-root wrapper discovery, and unrestricted `PI_ONTOLOGY_ROCS_BIN` / `ROCS_BIN`. Explicit diagnostic commands may retain an operator override only when they report it as unverified and never use it silently for automatic preflight.

### Closed subprocess environment

Use an allowlisted environment with:

- explicit `HOME`, locale, and Python isolation requirements;
- explicit workspace root, profile, and strict ref mode;
- index cache disabled for automatic discovery;
- implicit `.env` loading disabled;
- deterministic mapping of ROCS `resource_exhausted` errors and caller wall-clock timeout to distinct adapter invocation states;
- no ambient `PYTHONPATH`;
- no inherited ROCS override variables.

The adapter owns the wall-clock timeout. It terminates the process group with bounded graceful-to-forceful escalation and rejects output beyond a byte cap.

## State and concurrency

Add a package-local preflight runtime under `src/`; do not expand the large extension entrypoint.

Suggested state:

```ts
interface SemanticPreflightState {
  generation: number;
  controller: AbortController;
  orientation?: Orientation;
  orientationInFlight?: Promise<Orientation>;
  discoveryInFlight?: {
    key: string;
    promise: Promise<PreflightEnvelope>;
  };
}
```

Rules:

- session generation, not cwd, owns lifecycle validity;
- at most one same-key request is coalesced;
- independent caller cancellation never cancels another active caller without reference accounting;
- late results from stale generations are discarded;
- failures and `unavailable` are never cached as semantic results;
- v0 has no cross-turn result cache because freshness identity costs nearly as much as discovery;
- any later cache key must come from the same ROCS snapshot that produced the result and needs explicit source invalidation.

## Relationship to existing surfaces

### `ontology_inspect`

- Inside the explicit development gate, search may delegate to ROCS `discover` for dogfood.
- Outside the gate, preserve current behavior until P6 adopted cutover.
- At P6 cutover, remove `loadSearchCatalog`, `rankSearchDocs`, and `scoreDoc`; search then no longer calls `rocs build`.
- Pack remains the unchanged ROCS exact-ID operation. The adapter exposes existing ROCS byte/depth/document arguments, caps subprocess output, and wraps the result with adapter-side identity/trust metadata.
- Full pack text is rendered as untrusted semantic data, not instructions or certification.

### `pi-society-startup-context`

Startup context may report:

- semantic dependency available/unavailable;
- capsule coordinate and digest;
- how to request semantic discovery.

It does not rank concepts or inject definitions. Coexistence uses a versioned availability event/record where possible and prompt markers only for best-effort duplicate rendering. Neither extension treats the other's marker as authority.

### DSPx and other consumers

They consume the same ROCS request/result protocol and capsule identity through their own adapters. Pi prompt injection is not the reusable architecture.

## Adversarial pass

The architecture was red-teamed against current code and Pi host behavior. The following corrections are mandatory:

1. **Prompt injection:** arbitrary ontology prose cannot enter the system role automatically.
2. **Runner execution:** consumer wrappers are code, not trustworthy adoption evidence.
3. **Outcome semantics:** invocation, applicability, and retrieval stay separate.
4. **Corpus integrity:** identity binds all considered bytes and effective resolution, not selected cards.
5. **Filesystem truth:** automatic discovery disables cache; interactive cache effects remain declared.
6. **Protocol negotiation:** command presence alone does not imply compatible schemas or algorithm.
7. **Determinism:** JavaScript `localeCompare` and duplicated TypeScript scoring are removed.
8. **Lifecycle:** timeout and process-tree cancellation are adapter responsibilities; Pi exceptions do not enforce closure.
9. **Caching:** no cross-turn cache before cheap, trustworthy freshness exists.
10. **Markers:** marker deduplication cannot provide isolation or mandatory enforcement.
11. **Ambiguity:** advisory text cannot force resolution; it can only expose exact candidate IDs and an explicit tool path.
12. **Budgets:** result limits do not replace query, file, and corpus limits.
13. **Environment:** inherited variables and implicit `.env` would make automatic behavior ambient and unreplayable.
14. **Rollout:** unreleased snapshots stay opt-in until release/adoption integration.

## Implementation plan

### P0 — Host spike and joint protocol fixtures

Owners: ROCS + package adapter.

- Verify the supported Pi host's actual hook payloads, startup/resource ordering, prompt chaining, handler load-order behavior, headless behavior, reload/new/resume/fork events, abort behavior, and process-tree termination on supported platforms.
- Fail the wave if required host behavior is absent; do not encode an assumption as a package contract.
- Land ROCS caller-request/effective-request/result/identity fixtures and invalid cases.
- Add TypeScript fixture validators without implementing ranking.
- Define protocol negotiation and incompatible-version behavior.
- Freeze the outcome projection table and canonical prompt renderer fixtures.

Gate: the Pi host capability spike passes, Python and TypeScript agree byte-for-byte on accepted structural fixtures, and TypeScript performs no candidate scoring.

### P1 — ROCS discovery primitive

Owner: `core/rocs-cli`.

- Implement immutable corpus snapshot and complete digest.
- Implement `rocs-lexical-v0`, hard budgets, candidate evidence, and retrieval states.
- Add CLI, schema-3 effect declaration, JSON errors, and tests.
- Keep automatic cache-disabled mode filesystem-invariant.

Gate: ROCS acceptance gates in its protocol RFC pass; the repository's complete current test suite passes and current `pack`, intelligence, and transaction behavior remains non-regressed.

### P2 — Runner and port hardening

Owner: `pi-ontology-workflows`.

Expected files:

- `src/ports/rocs-port.ts` — add discovery protocol and identity types;
- `src/adapters/rocs-cli.ts` — verified descriptors, closed environment, timeout, process-tree kill, output cap;
- new `src/core/semantic-preflight.ts` — projection and orchestration;
- new `src/adapters/semantic-preflight-format.ts` — canonical structural renderer.

Do not modify unrelated dirty monorepo paths.

Gate: hostile `scripts/rocs.sh` never executes; bare `PATH`, implicit `.env`, and unverified overrides cannot influence automatic mode.

### P3 — Opt-in inspect path

Owner: `pi-ontology-workflows`.

- Route `kind=search` to ROCS discovery only while the session development gate is enabled.
- Preserve the existing default path until P6; do not claim one fleet ranking authority during dogfood.
- Expose existing exact-ID pack limits, cap output, and add adapter-envelope trust/identity metadata without changing ROCS `pack` semantics.
- Document development behavior without announcing a default breaking contract.

Gate: gated discovery performs no build or managed `dist/` mutation; default users see no behavior change.

### P4 — Lifecycle and turn adapter

Owner: `pi-ontology-workflows`.

- Add generation-scoped state and bounded startup orientation.
- Within the development gate, replace static keyword hinting with task-sensitive discovery for that session only; preserve default hinting outside the gate.
- Append only canonical structural metadata to the current turn's prompt.
- Add timeout, abort, stale completion, duplicate-marker, and extension-order tests.
- Keep developer mode explicitly disabled by default until selected by the operator.

Gate: startup, reload, new, resume, fork, Escape/abort, shutdown, timeout, late completion, headless mode, and load-order permutations all pass.

### P5 — Isolated vertical slice

Owners: both repos plus one disposable consumer.

Prove with sanitized environment and no network:

1. explicit development mode resolves one immutable development snapshot;
2. ordinary task language yields deterministic candidates;
3. ambiguous input selects nothing;
4. exact-ID pack supplies bounded semantic data only after explicit follow-up;
5. no repository or managed `dist/` bytes change;
6. timeout/unavailability remains visible and the Pi turn continues;
7. hostile ontology text cannot escape into the system block;
8. replay reproduces request, identity, candidates, and digest.

This is dogfood evidence, not fleet adoption evidence.

### P6 — Release capsule, trust root, adoption, and default cutover

Blocked by the cross-owner decision membrane.

- Decide the ROCS distribution mechanism and owner-authoritative trust root.
- Resolve the exact adopted capsule, independently pinned tool digest, and compatible ROCS runtime.
- Reject incompatible or unadopted automatic context.
- Cut default search from the TypeScript scorer to ROCS discovery and remove the old scorer in the same breaking alpha change.
- Add adoption/use receipt facts for AK evidence references without making Pi canonical authority.
- Prove capsule rollback and session refresh behavior.

Gate: one producer, one consumer, one adopted capsule, one use receipt, and rollback to the prior capsule are independently verified.

### P7 — Evidence-led rollout

Only after P6:

- compare enabled/disabled behavior through DSPx/Oracle;
- measure latency, no-match rate, ambiguity rate, tool follow-up, context cost, and task outcomes;
- decide whether startup orientation defaults on;
- separately decide whether any task class requires a mandatory host gate.

Do not add embeddings, online registries, model reranking, fleet auto-upgrades, or universal enforcement in v0.

## Package acceptance gates

- no arbitrary ontology-controlled text reaches automatic system-role injection;
- no unverified repository launcher executes automatically;
- exact request/result versions are negotiated and validated;
- unavailable, timeout, incompatible, exhausted, and no-match remain distinct;
- no candidate is auto-selected under ambiguity;
- automatic preflight leaves repo, managed `dist/`, and cache bytes unchanged;
- bounded subprocesses die across all session replacement paths;
- duplicate/forged markers and handler order cannot create an authority claim;
- development snapshots remain explicit opt-in;
- no fleet enablement occurs before release/adoption evidence.
