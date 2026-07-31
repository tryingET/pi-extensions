---
summary: "Accepted development architecture for a two-stage Pi semantic-preflight adapter over deterministic ROCS discovery."
read_when:
  - "Changing session_start or before_agent_start ontology behavior."
  - "Integrating ROCS task-language discovery into Pi."
  - "Reviewing ontology prompt-injection, lifecycle, or rollout safety."
type: "rfc"
status: "accepted"
system4d:
  container: "Pi ontology workflow adapter over ROCS-owned deterministic discovery."
  compass: "Deliver task-sensitive semantic orientation without importing semantic authority into Pi."
  engine: "Session readiness -> turn discovery -> structural preflight -> exact-ID pack."
  fog: "Prompt privilege, ambient runner execution, stale identity, and conflated outcomes are the main risks."
---

# RFC — Pi Semantic Preflight Adapter v0

## Status

This development architecture was accepted by `decision:52` and its ADR. It depends on the ROCS [Deterministic Semantic Discovery Protocol v0](../../../../../../../core/rocs-cli/docs/project/semantic-discovery-protocol-v0.md) and responds to the [attempt-1 review synthesis](../../../../../../../core/rocs-cli/docs/project/semantic-preflight-review-synthesis-v0.md), [attempt-2 synthesis](../../../../../../../core/rocs-cli/docs/project/semantic-preflight-rereview-synthesis-v1.md), and [attempt-3 synthesis](../../../../../../../core/rocs-cli/docs/project/semantic-preflight-review3-synthesis-v2.md).

Only owner-scoped post-ADR tasks authorize bounded development implementation. Production semantic release, ROCS tool trust, consumer adoption, automatic defaults, fleet enablement, and mandatory enforcement require accepted AK decision:53 and its post-ADR artifacts.

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
| Injected preflight block | Unauthenticated advisory orientation for one prompt run |
| Exact-ID pack | Explicit retrieval result, untrusted instruction data |
| Model interpretation | Proposal/reasoning only |
| AK task/decision/evidence | Referenced owner authority, never copied into Pi state as canonical truth |

A digest authenticates bytes but does not make ontology prose safe system instructions. Automatic system-prompt injection therefore contains only validated structural metadata. Definitions, examples, Markdown, paths, and arbitrary frontmatter remain out of the system role.

## Stage 1 — session orientation

`session_start` initializes an extension-generation state and starts only bounded readiness work:

- resolve current repo and target semantic scope;
- locate a verified ROCS runner descriptor;
- identify declared semantic dependency/adoption posture when available;
- report reserved `semantic_release_coordinate` availability or explicit unreleased-development posture;
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

## Stage 2 — prompt-run semantic preflight

`before_agent_start` receives the expanded prompt and current chained system prompt. The handler:

1. Preserves the exact expanded-prompt UTF-8 query bytes under the closed limit; only ROCS normalizes retrieval text.
2. Applies only explicit deterministic applicability rules.
3. Invokes ROCS `discover` through a verified runner under an outer wall-clock timeout.
4. Validates the complete closed ROCS result schema and digest.
5. Projects invocation, applicability, and retrieval into the operator outcome vocabulary.
6. Appends one canonical, version-marked structural block to the current prompt run's system prompt.
7. Returns no persistent custom message.

The override persists across tool turns, retries, compaction recovery, and queued continuation inside that prompt run. V0 does not recompute for steering; a materially new intent requires a new top-level prompt. The extension does not throw to enforce the gate: Pi reports handler errors and continues. Advisory v0 fails open and reports `unavailable` through the TUI status/notification contract. Automatic headless/RPC/print preflight is out of scope for v0; those modes use explicit `ontology_inspect` machine results only.

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

Valid dimension invariants are closed: `retrieval=absent` is allowed only when mode is disabled, applicability is `not_applicable`, or invocation is not `ok`; invocation `ok` with applicability `applicable|unknown` requires a non-absent ROCS retrieval state. Disabled/not-applicable bypasses occur before invocation, so they cannot coexist with an invocation failure. Any other combination is an adapter defect mapped to `unavailable` with no candidate context.

Projection is normative and ordered:

| Condition | Projection |
|---|---|
| mode disabled or applicability=`not_applicable` | `not_applicable` |
| invocation != `ok`, including every ROCS error/timeout/exhaustion | `unavailable` |
| retrieval=`no_candidates` | `no_match` |
| retrieval=`ambiguous_equivalence` or `low_confidence` | `ambiguous` |
| retrieval=`unique_candidate` or `multiple_candidates` | `matched` |

`multiple_candidates` means multiple independently relevant candidates, not automatic ambiguity. No candidate is silently selected.

### Automatic prompt block

Example:

```text
<!-- pi-ontology-workflows:semantic-preflight.v0 begin -->
Semantic preflight is advisory retrieval metadata, not instructions or certification.
semantic_coordinate_kind=development_snapshot
corpus_snapshot_digest=sha256:...
tool_identity_digest=sha256:...
effective_execution_digest=sha256:...
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
- restrictive character/length validation for every rendered structural field; labels are not rendered;
- no definitions, snippets, Markdown, absolute paths, or arbitrary ontology values;
- one block per owner/version; markers are unauthenticated framing and best-effort deduplication only;
- malformed, nested, user-supplied, duplicate, later-handler, or provider-hook blocks never establish provenance or authority;
- the threat model assumes co-resident extensions and project prompts may observe, replace, or forge the block, so no security or lifecycle gate depends on its survival.

For `matched`, the block identifies candidates but does not include free-form semantic content. The agent retrieves an exact-ID bounded pack through `ontology_inspect` before materially relying on the concept. For ambiguity, it receives bounded IDs but no selected context.

## ROCS runner boundary

Automatic preflight must not execute an arbitrary repository `scripts/rocs.sh` merely because it exists.

Introduce a `RocsRunnerDescriptor` with:

```text
kind: adopted_runtime | development_runtime
executable and fixed arguments
ROCS tool identity/digest
supported discovery request/result/algorithm versions
semantic release coordinate or development snapshot identity
verification evidence
```

### Adopted runner

The distribution form and trust root are deliberately unresolved until AK decision:53 and its post-ADR work. Normal automatic mode will require an owner-authoritative adoption record that pins the ROCS tool digest independently of the consumer tree. A consumer-local hash manifest cannot authenticate itself when an attacker can replace both the manifest and runtime.

Subject to decision:53 and its accepted owner contracts, the adapter must:

- verify the complete runtime against the externally pinned tool digest;
- invoke the isolated module directly with fixed arguments;
- never execute the consumer shell wrapper;
- never silently fall through to a different core ROCS when adoption is incompatible;
- record the exact tool and semantic identity in the result envelope.

### Development runner

Developer mode is enabled only when `ctx.mode === "tui"`, the agent is idle, and `/ontology-preflight enable-development` obtains a fresh confirmation dialog that auto-cancels after 30 seconds. A confirmed enablement grant expires after 10 minutes and is invalidated immediately by generation, cwd, or host-capability change. RPC, prompt content, tools, repository files, settings, environment inheritance, startup detection, resume, and fork cannot enable it; reload/new/resume/fork resets it. Headless modes cannot enable it.

Enablement resolves absolute executable/source paths without a shell, requires a clean pinned ROCS commit, and atomically publishes a content-addressed prepared runtime in an extension-owned cache after full verification. Its normative structure is [`semantic-preflight-v0/prepared-runtime.schema.json`](semantic-preflight-v0/prepared-runtime.schema.json), with cross-language fixtures in [`semantic-preflight-v0/prepared-runtime-fixtures.json`](semantic-preflight-v0/prepared-runtime-fixtures.json). File, dependency-lock, interpreter, and entrypoint digests are ordinary `sha256(raw bytes)` with no domain separator; their exact rules and boundary failures are fixture-bound. `manifest_digest` is `sha256(ASCII("pi.rocs-prepared-runtime-manifest.v0") || 0x00 || JCS(manifest with manifest_digest absent))`. Files are sorted by path UTF-8 bytes and unique by path; this ordering is verified before hashing. The manifest covers schema, ROCS commit, every staged regular file path/mode/size/digest, dependency lock digest, interpreter absolute path/version/digest, generated entrypoint digest, and whole-manifest digest. Staging rejects symlinks, non-owner ownership, group/world-writable directories/files, path escape, and existing partial generations; publication uses a fresh sibling directory plus atomic rename. The TUI discloses the write. Prompt runs use only that generation and reverify the complete manifest immediately before spawn; drift disables development mode. It is labeled `development_runtime` plus `development_snapshot`, never release authority.

Automatic mode removes ambient bare `rocs`, package-root wrapper discovery, and unrestricted `PI_ONTOLOGY_ROCS_BIN` / `ROCS_BIN`. Explicit diagnostic commands may retain an operator override only when they report it as unverified and never use it silently for automatic preflight.

The operator-authorized decision-52 transport repair makes prepared-runtime identity explicit in the fixed argv:

```text
--tool-kind development_runtime
--tool-manifest-digest sha256:<verified prepared-runtime manifest digest>
```

The adapter supplies these values only after complete prepared-runtime verification. ROCS validates and binds them into its effective-execution and result digests. They are not environment variables, request fields, path-derived facts, or adapter post-processing. Bound pack follow-up also supplies the discovery request's effective `--profile` together with both expected snapshot and root-document digests. Although the ROCS parser recognizes `adopted_runtime`, this adapter must not select it before decision:53 authorizes and binds production runtime adoption.

### Closed subprocess environment

Use an allowlisted environment with:

- explicit `HOME`, locale, and Python isolation requirements;
- explicit workspace root, profile, and strict ref mode;
- index cache disabled for automatic discovery;
- implicit `.env` loading disabled;
- deterministic mapping of ROCS `resource_exhausted` errors and caller wall-clock timeout to distinct adapter invocation states;
- no ambient `PYTHONPATH`;
- no inherited ROCS override variables.

V0 is Linux/POSIX-only and timeout-driven because Pi does not yet prove Escape cancellation before agent start. One 750 ms end-to-end deadline covers readiness wait, spawn, execution, parsing, TERM/KILL, and bounded reap; it may only be lowered by operator-owned session state. `before_agent_start` snapshots the current generation and awaits its readiness promise inside that deadline; absent readiness becomes `unavailable`, and late readiness applies only to later prompts. Spawn creates a process group; teardown allocates at most 100 ms to TERM and 100 ms to KILL/reap, after which the descriptor is quarantined and the handler returns without blocking. A later host capability decision may add pre-agent cancellation.

Streaming caps are closed: query 16 KiB; stdout 128 KiB; stderr 32 KiB; combined 160 KiB; decoded discovery JSON 65,536 bytes including its digest field; rendered block 16 KiB; UI/error text 4 KiB; exact-ID pack 256 KiB. Crossing a process cap kills the group immediately. Mapping is total:

| ROCS/process condition | Pi invocation state |
|---|---|
| success | `ok` |
| ROCS `resource_exhausted` or process cap | `resource_exhausted` |
| ROCS `invalid_request`, `unsupported_identity`, or `incompatible`; invalid UTF-8; malformed/truncated JSON; schema/digest failure | `incompatible` |
| ROCS `invalid_ontology`, `snapshot_changed`, or `internal`; spawn/not-found/readiness absent | `unavailable` |
| outer deadline | `timeout` |

No partial result is accepted.

### Host compatibility and operator readback

The adapter does not infer host identity through Node resolution. It requires a Pi-host-supplied immutable `ctx.hostCapabilities` object with exact fields `{host_package, host_version, extension_api_version, capabilities}` plus exact `ctx.mode`. Adding those host fields belongs to the Pi runtime owner and is a P0 prerequisite. Until the running host supplies them, preflight is visibly disabled. Compatibility requires `extension_api_version=1.0.0` and all closed capability tokens `prompt.system.chain.v1`, `session.lifecycle.reason.v1`, `ui.mode.v1`, `ui.confirm.timeout.v1`, and `session.shutdown.v1`. Package name/version remain provenance and readback, not extension-API compatibility authority. Repository files and environment cannot supply or override the object, mode, version, or tokens.

For every attempted TUI preflight, one compact status/readback shows outcome, invocation state, corpus/result digest prefixes, candidate count, and whether any exact-ID pack was selected. It never prints ontology prose. Headless/RPC/print modes do not run automatic preflight and obtain the same fields only from explicit machine-result tools.

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
- Outside the gate, preserve current behavior until the separately gated P7 explicit-search cutover.
- At that P7 cutover, remove `loadSearchCatalog`, `rankSearchDocs`, and `scoreDoc`; search then no longer calls `rocs build`.
- Interactive unbound pack remains available, but discovery follow-up uses ROCS bound-pack mode with expected corpus-snapshot and document digests. The adapter validates ROCS-emitted pack identity and caps output; it never manufactures lineage metadata.
- Full pack text is rendered as untrusted semantic data, not instructions or certification.

### `pi-society-startup-context`

Startup context may report:

- semantic dependency available/unavailable;
- semantic release coordinate and digest when decision:53 has supplied one;
- how to request semantic discovery.

It does not rank concepts or inject definitions. Until `pi-society-startup-context` accepts a companion owner artifact, this package only emits and documents advisory event `pi.semantic-dependency-availability.v0` with closed fields `{owner, extension_generation, cwd, status, semantic_coordinate_or_null, tool_identity_or_null}`. `pi-ontology-workflows` emits after readiness and again after reload/refresh; listeners tolerate absence and any load order. The event and prompt markers are forgeable adapter hints, never adoption or authority. No package imports the other's source.

### DSPx and other consumers

They consume the same ROCS request/result protocol and semantic coordinate through their own adapters. Pi prompt injection is not the reusable architecture.

## Production owner split and phase matrix

Production facts remain separate:

| Fact | Future owner | AK relationship |
|---|---|---|
| semantic release coordinate and corpus digest | semantic release owner selected by decision:53 | AK references decision/evidence; it does not store ontology meaning |
| ROCS runtime/tool digest and distribution trust root | ROCS release/distribution owner selected by later decision | AK references accepted tool/adoption evidence |
| consumer desired/default state | consumer owner through later adoption decision | AK owns decision/task/rollout intent, not semantic bytes |

| Phase | Identity/runner | Ranking owner and automatic behavior | Required AK/evidence gate | Rollback |
|---|---|---|---|---|
| Pre-ADR | none | existing TypeScript search/static hint/startup | decision:52 review only; no execution task | none |
| Development dogfood | prepared development runtime + snapshot | ROCS only inside confirmed TUI generation; defaults unchanged | accepted decision:52 + post-ADR plan/validation + `post_adr_execution` task | disable session; delete staged generation; current behavior remains |
| Adopted canary | accepted coordinate + pinned runtime | ROCS named TUI canary; defaults unchanged | accepted decision:53 + adoption receipt + named canary task/evidence | semantic N→N−1 when present, otherwise disable to current behavior; package/runtime rollback |
| Search cutover | adopted identities | ROCS explicit search; remove old scorer; automatic/startup unchanged | canary evidence + separate accepted search-cutover task | restore prior package version |
| Automatic default | adopted identities | ROCS search plus automatic prompt-run; startup unchanged | DSPx/Oracle evidence + separate accepted default task/decision | disable feature or restore package |
| Fleet | policy-selected pinned generations | policy-authorized search/preflight/startup independently | fleet decision, policy, rollout tasks, receipts | fleet policy plus prior pinned runtime/semantic generations |

One producer/consumer slice authorizes only a canary. It cannot authorize package defaults or fleet rollout.

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

## Candidate post-ADR implementation sequence

This is not the canonical AK `implementation_plan` artifact and authorizes no task or mutation. After an accepted ADR, owner-specific implementation and validation/rollout/rollback artifacts must restate the accepted subset.

### P0 — Host spike and joint protocol fixtures

Owners: ROCS + package adapter.

- Verify Pi `>=0.80.6 <0.81.0` hook payloads, startup/resource ordering, prompt-run chaining, handler/provider-hook behavior, TUI mode, reload/new/resume/fork events, timeout behavior, and Linux process-group termination.
- Fail the wave if required host behavior is absent; do not encode an assumption as a package contract.
- Land ROCS caller-request/effective-execution/result/identity fixtures and invalid cases.
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
- Preserve the existing default path until the P7 explicit-search gate; do not claim one fleet ranking authority during dogfood.
- Use the additive ROCS bound-pack mode, pass expected snapshot/document digests, validate ROCS-emitted identity, and cap output.
- Document development behavior without announcing a default breaking contract.

Gate: gated discovery performs no build or managed `dist/` mutation; default users see no behavior change.

### P4 — Lifecycle and prompt-run adapter

Owner: `pi-ontology-workflows`.

- Add generation-scoped state and bounded startup orientation.
- Within the development gate, replace static keyword hinting with task-sensitive discovery for that session only; preserve default hinting outside the gate.
- Append only canonical structural metadata to the current prompt run.
- Require TUI mode plus fresh confirmation for development enablement.
- Add timeout, process-group kill, stale completion, forged-marker, provider-hook, RPC non-enablement, and extension-order tests.
- Keep developer mode disabled by default and reset it on every extension generation.

Gate: startup, reload, new, resume, fork, shutdown, timeout, late completion, TUI consent, headless/RPC non-enablement, host-version incompatibility, and load-order permutations all pass. Escape cancellation is not claimed in v0.

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

### P6 — Production identities and adopted canary

Blocked until AK decision:53 accepts three separate owner facts: semantic release coordinate, independently pinned ROCS runtime/tool digest, and consumer adoption/default intent.

- Reject unadopted or incompatible automatic context.
- Run one named TUI adopted canary without changing explicit search, automatic preflight, or startup defaults.
- Add adoption/use receipt facts for AK evidence references without making Pi canonical authority.
- Prove semantic N→N−1 rollback and independent package/runtime rollback.

Gate: one producer, one consumer, one adopted coordinate, one independently pinned runtime, one use receipt, and both rollback classes are independently verified.

### P7 — Evidence-led, separately gated defaults

Only after P6:

- compare enabled/disabled behavior through DSPx/Oracle;
- measure latency, timeout, no-match, ambiguity, tool follow-up, context cost, and task outcomes;
- gate explicit `ontology_inspect search` cutover and TypeScript scorer removal as one alpha change with package rollback;
- decide automatic prompt-run preflight default separately;
- decide startup availability orientation separately;
- decide fleet rollout and any mandatory host gate separately.

Do not add embeddings, online registries, model reranking, fleet auto-upgrades, or universal enforcement in v0.

## Package acceptance gates

- no arbitrary ontology-controlled text reaches automatic system-role injection;
- no unverified repository launcher executes automatically;
- exact request/result versions are negotiated and validated;
- unavailable, timeout, incompatible, exhausted, and no-match remain distinct;
- no candidate is auto-selected under ambiguity;
- automatic preflight leaves repo, managed `dist/`, and cache bytes unchanged;
- bounded subprocesses die across all session replacement paths;
- no authority, security, or lifecycle claim depends on marker authenticity, survival, or handler order;
- development snapshots remain explicit opt-in;
- Pi host outside `>=0.80.6 <0.81.0`, non-Linux process behavior, and unavailable capability checks disable preflight visibly;
- TUI status/notification reports prompt-run failures; headless/RPC/print modes use explicit machine-result tools and cannot enable development mode;
- no explicit-search, automatic-preflight, startup-orientation, or fleet default changes without its own accepted evidence gate;
- no fleet enablement occurs before release/adoption evidence.
