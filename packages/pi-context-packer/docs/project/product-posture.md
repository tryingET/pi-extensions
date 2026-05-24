---
summary: "Product posture for @tryinget/pi-context-packer: promise, maturity, trust gates, boundaries, and next bets."
read_when:
  - "Before choosing the next pi-context-packer product or implementation slice."
  - "When deciding whether context selection belongs in pi-context-packer, SCI, docs-list, AK, FCOS, Prompt Vault, ASC/self, peer tooling, or Pi runtime."
  - "When reviewing context packet authority, output shape, or provider scope."
type: "reference"
system4d:
  container: "Package-local product posture for the Pi context-window packet planner."
  compass: "Make large context windows useful without turning packet assembly into hidden authority, session orchestration, or JSON bloat."
  engine:
    invariants:
      - "Plans and packets stay read-only and source-owned."
      - "Primary packet output is curated Markdown; structured details stay compact."
      - "Provider omissions, budgets, and already-loaded dedupe are visible."
      - "Execution, peer launch, messaging, workflow supervision, and authority movement stay with their owning surfaces."
  fog:
    risks:
      - "Context packing becomes another ad-hoc search loop."
      - "Retrieved content is mistaken for stronger authority than its source owner grants."
      - "Tool details or session metadata silently bloat the harnessed model context."
      - "Context advice drifts into controlling self, subagents, peers, or orchestrator workflows."
---

# Product posture — `@tryinget/pi-context-packer`

## Vision relation

The package north star lives in [vision.md](./vision.md). This posture file records current maturity, boundaries, trust gates, and next product bets. It is not a task queue and does not replace AK, FCOS, Prompt Vault, ASC, peer tooling, or runtime authority.

## Product promise

`pi-context-packer` turns a task objective plus a few optional seeds into a bounded, source-owned context plan or packet that reduces low-level `read` / search / status churn.

The healthy loop is:

```text
objective -> provider plan -> bounded retrieval -> Markdown packet -> compact receipt -> agent work with fewer raw probes
```

The package should feel like a context advisory membrane: it helps decide what context is worth loading and what should stay out, while routing execution or authority-sensitive next steps back to the owning surface.

## Primary users

- Pi coding agents that need high-signal context before implementation.
- Operators who want context-window usage to be deliberate rather than accidental.
- Package/repo owners reviewing whether a packet respected source-owner boundaries.
- Controller agents preparing bounded context for another legal surface without giving context-packer control over that surface.

## Current maturity

- maturity: `internal dogfood / package-cwd workspace-basis, repo-bounded AGENTS/CLAUDE instruction projection with Pi-style in-repo candidate priority, strict docs-list provider contract, route-invariant provider telemetry, receipt-projection accounting, compact context_plan/context_pack detail membranes, activity/runtime-coverage-gated dogfood calibration with stored-evaluation status recomputation and centralized omission-follow-up class semantics, and JS object-boundary-hardened MVP with bounded-SCI sandboxing, deterministic SCI executable trust, safety/accounting receipts, local receipt evaluation, and validation-observable non-persistent aggregate summaries`
- current strategic line: keep `context_plan` cheap and always available with compact redacted details, keep `context_pack` activatable, preserve Markdown-primary output, dogfood package-cwd, monorepo-root, repo-bounded instruction projection, provider-scoped seed behavior, total/selected/follow-up/unclassified route receipts, rendered-overhead accounting, typed omission-follow-up calibration, stored-evaluation status recomputation, and activity/runtime-gated aggregate summaries after reload, and use redacted live dogfood receipts plus packet-local evaluations/summaries to prove ranking/utility before adding AK/FCOS/Prompt Vault adapters or broadening SCI indexing
- proof posture: package quality gate passes with real TypeScript checking for the extension entrypoint plus adversarial tests for repo-bounded AGENTS/CLAUDE candidate priority, above-repo instruction omission disclosure, extension metadata scope wording, hard objective/seed/schema size caps, compact details redaction for raw objectives, absolute workspace paths, selected item paths, raw query strings, raw seed values, and seed notes, unsafe caller paths, raw path/symbol seed control and surrounding-whitespace intake before normalization, invalid core API seed-kind allowlisting, non-path unsafe seed omission labeling, note truncation within schema caps, dot-prefixed/internal path intake, strict structured docs-list JSON intake with repo-relative ranked item handling, package-root rebasing for JSON `path` fallback to POSIX repo-relative paths, package-scoped ambiguous `repoPath` fail-closed handling with safe `item.path` fallback, hostile `HOME` docs-list executable refusal, caller repoRoot mismatch and invalid-JSON fail-closed behavior, explicit no-results omissions, `ok:false`/schema-drift/item-shape provider omissions, mixed valid/unsupported item handling, raw docs-list control/whitespace handling, and process-level `DOCS_LIST_SCRIPT` / `PI_CONTEXT_PACKER_DOCS_LIST` override refusal unless an explicit trusted-executable opt-in is set, package-subdirectory docs-list root climbing with package-root markers preferred over nested README/docs markers, package roots under fixture/sample container directories broadened to the outer package ancestor, and legitimate nested package ambiguity surfaced while staying nearest-package scoped, including packages merely named sample/fixture, executable package-local dogfood smoke for real docs-list JSON `rankedItems[].repoPath` intake through `context_pack` from package-root and package-subdirectory cwd values plus compact-details redaction and non-persistent receipt evaluation, symbol-seed control/size intake, Markdown-only path seeds routing to docs without selecting SCI, provider-scoped query seeds that keep Markdown paths out of SCI queries even when SCI is selected by code context, redacted dogfood provider-route summaries and aggregate route telemetry that separate selected query counts from optional follow-up query counts, preserve total/unclassified query counts, reject selected/follow-up role contradictions, report seed-kind truncation, redact invalid caller-controlled route keys on failure paths, and tolerate legacy aggregate objects for query-seed mismatch review, selected-content budget accounting with rendered Markdown overhead reported separately in tool details, docs-list fallback after unsafe seed omission, cwd-relative seed rebasing to inferred repoRoot, repo-root seed precedence over package-cwd shadow files, Markdown fence injection, Markdown structural-label injection, owner-surface false positives, unreadable files, symlink escapes, missing workspace-root degradation, trusted nearest-ancestor git-root inference from package cwd, no broad ancestor inference without a valid `.git` marker, arbitrary fake `.git` file refusal, repoRoot-normalized git status, SCI workflow refusal until read-only safety is confirmed, live extension SCI safety-env propagation, SCI artifact-bypass flag refusal, existing/new `.ontology` SCI artifact fail-closed behavior, repoRoot and intermediate-ancestor `.ontology` detection from explicit or inferred package cwd roots, dangling `.ontology` symlink detection, SCI path-seed symlink escape refusal, repo-root-relative and rebased package-cwd SCI path seeds, temporary-sandbox SCI execution, SCI process-level override refusal without raw path leakage, deterministic absolute default SCI executable discovery that does not trust ambient `PATH`, fixed SCI subprocess path/env scrubbing, preservation of refused-override diagnostics across read-only-safety, existing-artifact, and sandbox-setup fail-closed paths, compact details, returned compact-projection clone/mutation resistance for plan and packet details, global and cumulative provider-local budgets, fresh-vs-duplicate tool-call estimates, session dedupe, budget-accurate session visibility, compact session metadata without raw context-usage echoing, redacted dogfood observation templates and local evaluation, validation-command counts tracked separately from low-level context probes, activity-type labels for implementation/review/validation/planning dogfood calibration, observer-supplied runtime-context labels for source-local/installed-artifact/live-reloaded calibration without reload proof, stored-evaluation status recomputation before aggregate counting, centralized omission-follow-up class projections for user-selectable/internal/contrary/next-action semantics, core activity plus live-reloaded runtime coverage gating before stable-positive aggregate signals, immutable/null-prototype aggregate coverage projections, aggregate dogfood summary redaction/mixed-invalid handling, legacy missing-vs-zero validation-count aggregate coverage, aggregate fail-closed intake for non-object and over-limit input, prototype-shaped aggregate labels, aggregate omission follow-up rendering/truncation preservation, dogfood evaluator contradiction truth tables, non-negative integer receipt counts, closed evaluator/summarizer input schemas and oversized-input rejection, owner-extension registration smoke coverage for all context-packer tools, installed-artifact compact-plan projection smoke, isolated installed-artifact execution smoke for `context_plan`, seeded `context_pack`, docs-list-discovered `context_pack`, dogfood evaluation, and aggregate dogfood validation-count observability, public omission/error detail redaction across Markdown/details/next suggestions, raw omission-detail suppression, and wired-vs-planned-unwired provider gap classification; `node --test tests/sci-provider.test.js`, `npm run check`, `npm run dogfood:docs-list-json`, strict docs list, full `npm run release:check`, and `npm audit --omit=dev --audit-level=moderate` pass; live install/reload must be repeated before treating changed tool behavior as active Pi behavior
- release posture: package checks pass; full `npm run release:check` passes and performs an isolated Pi tarball install plus runtime registration smoke for `/context-pack`, `context_plan`, `context_pack`, `context_dogfood_evaluate`, and `context_dogfood_summarize`, then executes installed artifact code for `context_plan`, seeded `context_pack`, docs-list-discovered `context_pack`, dogfood evaluation, and aggregate dogfood validation-count observability against a temporary read-only fixture; install/reload is still required before local code changes become live Pi behavior; live activation is via toolbox `context-packer` bundle

## Current landed capability baseline

The package currently owns:

- `/context-pack` planning posture command;
- always-active `context_plan` when toolbox baseline is current;
- toolbox-activatable `context_pack` for bounded packet assembly;
- repo-bounded AGENTS/CLAUDE instruction provider with Pi loader-style per-directory priority (`AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD`) from accepted `repoRoot` to cwd;
- caller-seeded Markdown docs provider;
- docs-list-ranked Markdown discovery when no explicit safe Markdown seed was supplied, including after unrelated unsafe seeds were omitted;
- shared intake-safety membrane for caller and provider-discovered paths, default-deny dot-prefixed path segments, C0/C1/DEL control-character rejection, trusted nearest-ancestor git-root inference when `repoRoot` is omitted, monorepo ancestor repoRoot acceptance only with a valid `.git` marker, cwd-relative seed rebasing to a single repo-root path basis that preserves existing repo-root-relative seed precedence, boundary-aware provider/owner-surface matching and provider-scoped query seeds where Markdown path seeds route to docs rather than SCI, adaptive Markdown fences, and bounded one-line Markdown structural labels;
- trusted-system-git status provider;
- read-only SCI provider seam that refuses workflow execution unless SCI read-only safety is explicitly confirmed, lets live Pi hosts opt in through `PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE=true`, ignores process-level `PI_CONTEXT_PACKER_SCI_CLI` / `SCI_CLI` executable overrides unless `PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI=1` explicitly marks them trusted, resolves default SCI executables only from fixed absolute system candidates rather than ambient `PATH`, runs SCI subprocesses with a minimal allowlisted environment and fixed tool path rather than raw host env, blocks existing source `.ontology` state, copies safe code path seeds through a temporary sandbox before SCI execution, screens symbol seed controls/size, and limits symbol searches to that bounded sandbox;
- session/system-prompt-aware measurement and already-loaded dedupe;
- primary Markdown packet output;
- advisory owner-surface routing for authority-sensitive work without invoking those surfaces;
- compact structured `details` for both `context_plan` and `context_pack` that omit raw item content, raw selected paths, absolute workspace paths, raw objectives, raw query strings, raw seed values, and seed notes by default, and clone returned projection surfaces so in-process consumers cannot mutate source packet/plan state through details;
- measurement receipt fields for estimated tool calls avoided, packet fill, selected/omitted counts, already-loaded dedupe, cumulative provider-local budget accounting, selected-content packet totals with rendered Markdown overhead reported separately in tool details, compact session awareness that omits raw context-usage objects and reports visibility from actual selected sections, planned-unwired provider omissions, selected-vs-follow-up provider route summaries for query-seed mismatch review, packet-local utility recommendations, post-use dogfood follow-up scaffolds, public provider-failure omission details that omit raw subprocess error text, and redacted copy-ready observation templates that omit raw packet content, selected item paths, raw seed values, and raw omission details;
- packet-local dogfood observation evaluation for filled redacted templates, classifying matched/overestimated/underestimated/needs-review/incomplete outcomes with integer-only count intake, redacted activity-type and runtime-context labels, route-invariant provider-route telemetry, validation-command counts kept separate from context-probe counts, and centralized typed omission-follow-up classes for useful omissions, residual probes, validation activity, legacy missingness, provenance/source-owner follow-ups, true missing capability, internal legacy-unspecified cases, and other review cases, without reading files, calling providers, persisting evidence, updating AK/FCOS, or writing session memory;
- non-persistent aggregate dogfood summaries across multiple redacted observations/evaluations, reporting recomputed status counts, activity-type counts, core implementation/review/validation coverage through immutable/null-prototype projection membranes, runtime-context counts and live-reloaded coverage as observer-supplied calibration metadata, provider omission counts, provider-route total/selected/follow-up/unclassified query counts, role counts, seed-kind counts/truncation totals, omission follow-up counts/class counts/truncation totals, validation-command recorded/missing counts, invalid receipts, and cautious next actions without reading receipt files or promoting evidence;
- explicit omissions for planned-but-unwired provider seams.

## Product non-goals

`pi-context-packer` must not become:

- a canonical task/evidence/decision/direction authority;
- a replacement for AGENTS/system/developer/user instruction precedence;
- an SCI ownership layer or code semantics authority;
- a docs authority or docs migration engine;
- an AK, FCOS, Prompt Vault, ROCS, KES, Oracle, or git mutator;
- an ASC/`self` operational mirror or persistent self-memory owner;
- a `dispatch_subagent` execution surface or execution-runtime wrapper;
- an `intercom` peer-messaging supervisor;
- a visible peer launcher, candidate-worktree manager, or peer cleanup owner;
- an above-seam workflow coordinator or fan-in gate;
- a hidden session-memory store;
- a raw JSON mega-packet generator.

## Owner-seam reminders

| Concern | Owning surface |
|---|---|
| Operational introspection, mirror-only handoff/closeout summaries, `dispatch_subagent` execution | `packages/pi-autonomous-session-control` / ASC `self` |
| Same-machine peer communication | `packages/pi-peer-messaging` / `intercom` |
| Visible peer launch, candidate worktrees, peer cleanup | `packages/pi-little-helpers` peer tooling |
| Above-seam coordination, workflow supervision, fan-in gates, evidence projection explanation | `packages/pi-society-orchestrator` |
| Code semantics and code-context navigation | SCI / semantic-code-intelligence |
| Durable task/evidence/direction/decision truth | AK / accepted society authority surfaces |
| FCOS Layer-5 coordination meaning | `holdingco/fcos-control-board` |
| Governed reusable prompts/procedures | Prompt Vault |
| Ontology / controlled semantics | ROCS / ontology owner repos |
| Documentation narratives | owning repo docs surfaces |
| Context planning and bounded read-only packet assembly | `packages/pi-context-packer` |

## Trust gates

A context packet is product-healthy only when:

1. **Read-only source boundary** — every provider remains a projection of its owning source.
2. **Budget visibility** — selected and omitted content are visible with token/byte estimates.
3. **Output discipline** — primary output is useful Markdown; structured details do not duplicate raw content by default.
4. **Provider honesty** — unwired or unavailable providers are explicit omissions, not implied coverage.
5. **Already-loaded awareness** — content already in the active prompt/session is represented without wasteful duplication where detectable.
6. **No mutation drift** — packet assembly never mutates files, git, AK, FCOS, Prompt Vault, SCI, ASC, peer tooling, or source-owner repos.
7. **No orchestration drift** — advice may name an owning surface, but context-packer does not call, spawn, supervise, fan in, persist, or authorize that surface.
8. **Shared intake discipline** — caller seeds, provider-discovered paths, owner-routing signals, and rendered packet content pass through common safety rules rather than provider-local ad hoc filters.

## Current main gap

The main remaining product gap is not another provider adapter; it is repeated live usefulness proof under the now-stricter package-cwd workspace-basis, strict docs-list provider contract, route-invariant provider telemetry, pre-provider safety, compact projection membrane, accounting membrane, activity/runtime-coverage-aware dogfood aggregate membrane with stored-evaluation status recomputation, and centralized omission-follow-up class registry. Recent implementation clarified that docs-list output is provider data but docs-list scripts are trusted executable code: `--json` output is fail-closed, invalid JSON must not fall back to path-looking text, process-level docs-list script overrides require explicit trusted-executable opt-in, ambient `HOME` does not choose docs-list executable identity, and package-local JSON `path` fallbacks rebase to POSIX repo-relative packet paths. The same trusted-executable rule applies to process-level SCI CLI overrides, default SCI discovery no longer resolves bare command names through ambient `PATH`, SCI subprocesses no longer inherit raw host env by default, and refused executable diagnostics must survive every fail-closed path rather than disappearing behind the final blocking condition. It also clarified that package-cwd packets need one repo-root path basis across AGENTS/CLAUDE instruction projections, docs, git, and SCI: inferred roots require valid `.git` markers, git status runs at repoRoot, cwd-relative safe seeds rebase only when they do not shadow an existing repo-root-relative target, SCI path seeds are copied from the normalized repoRoot source, and `.ontology` under cwd, repoRoot, or intermediate ancestors fails closed. Provider selection and provider query seeds must stay aligned with source-owner meaning: Markdown path seeds are docs context, not SCI context, optional providers must be reported as follow-up affordances rather than selected query coverage, overflow/invalid/unsafe caller seeds must keep source-owner-meaningful omission labels, and route telemetry must keep total, selected, follow-up, and unclassified query counts distinct so aggregate dogfood cannot imply coverage from follow-up or unknown routes. The authority boundary is sharper: context-packer may normalize and project source-owned paths and safe metadata for packet assembly and may emit redacted route/accounting/classification receipts, but executable identity remains part of the provider trust membrane rather than an ambient shell concern; it still does not own git truth, docs-list executable trust, SCI indexing state, docs authority, AK/FCOS evidence, live reload, task completion proof, or the caller-controlled labels that enter core APIs. Packet truth must still come from one selected/omitted accounting path: provider-local budgets are cumulative, selected-content packet totals are distinct from rendered Markdown scaffolding overhead, docs-list discovery remains available after unrelated unsafe seed omission, and session visibility is receipt truth only when the section actually survives budget selection. The dogfood export boundary remains strict: packet Markdown/details may show source-owned packet content for immediate use, but pasteable observation templates are receipt scaffolds only and must omit raw packet content, selected item paths, raw seed values, raw session/context-usage objects, raw omission details, and raw caller-controlled diagnostic keys on failure paths; activity labels, runtime-context labels, validation-command counts, provider-route counts, and follow-up classes are calibration metadata, not completion proof, and aggregate summaries preserve missing-vs-zero validation-count posture, recompute stored evaluation status before counting, and retain legacy route-object compatibility. The evaluator and summarizer remain non-persistent packet-local calibration tools; they do not turn dogfood notes, route telemetry, or typed follow-up classes into AK evidence, FCOS closeout, session memory, provider authority, or task completion proof. Owner-extension registration, installed-artifact compact projection smoke, and extension metadata wording have package-local coverage, but live Pi sessions still need reload/activation before new tool schemas, installed package changes, or host env changes are product behavior. Dogfood receipts now cover useful packets, no-packet outcomes, post-reload template checks, provider-route split receipts, route aggregate telemetry, selected-content-vs-rendered-overhead accounting, strict docs-list contract hardening, trusted override and hostile-`HOME` executable refusal, validation-count observability, activity-type calibration labels, typed omission-follow-up classes, stored-evaluation status recomputation, core activity and live-reloaded runtime coverage gating, immutable aggregate coverage hardening, release-check smoke with installed-artifact runtime labeling, audit pass, atomic-completion residual review, route diagnostic hardening, raw seed/projection hardening, package-scoped `repoPath` ambiguity hardening, compact `context_plan` details, returned-projection clone hardening, SCI executable-trust residual review, and repo-bounded AGENTS/CLAUDE scope hardening; the next frontier is repeated evaluated live-reloaded receipts across real implementation, review, and validation tasks that actually use those classes and route summaries to distinguish useful omissions, residual context probes, validation activity, legacy missingness, provenance/source-owner follow-ups, true missing capability, and query-routing mismatches before ranking changes, broad SCI indexing, or new owner adapters are justified. Future instruction-context work should treat global or above-repo Pi-loaded context as a Pi runtime/session boundary, not as context-packer-owned filesystem crawling, unless Pi supplies a trustworthy loaded-context surface.

## Next product bets

Near-term bets:

- continue dogfooding `context_plan` / `context_pack` against real implementation, review, and validation tasks from both package cwd and monorepo-root contexts, using `npm run dogfood:docs-list-json` as the repeatable package-local smoke for real structured docs-list JSON intake while still recording whether broader packets reduced raw `read` / search / status churn under the stricter safety/accounting membrane, filling `validationCommandsRun` separately from context probes, filling `activityType` and observer-supplied `runtimeContext` truthfully, classifying `omissionFollowupsUsed` with the centralized registry when follow-ups occur, treating runtime labels, recomputed aggregate status, core activity coverage, and follow-up classes as calibration only, treating the redacted observation template as the pasteable receipt, `context_dogfood_evaluate` as single-receipt calibration, and `context_dogfood_summarize` as non-persistent multi-receipt calibration while keeping full packet content local to the active turn;
- before choosing more provider work, review whether accumulated evaluated receipts show ranking failures, provider availability failures, accounting/omission mismatches, rendered-overhead pressure, path-basis mismatches, docs-list contract failures, trusted-executable override needs, executable identity/path drift, provider-route/query-seed mismatches, selected/follow-up/unclassified route imbalances, validation-count missingness, compact-projection/detail leakage, live reload/registration gaps, stored-evaluation recomputation mismatches, runtime-coverage gaps, or simply correct omissions; use aggregate summaries as triage only, not as canonical evidence or a substitute for owner-surface promotion; verify the live session has reloaded the latest schema before treating a missing tool as product behavior; wired provider outages should not be treated as planned-unwired adapter gaps;
- dogfood the new bounded SCI temporary-sandbox mode before broadening symbol-only or repository-wide SCI ranking;
- tune docs/docs-list, repo-bounded AGENTS/CLAUDE instruction projection, git, and session-awareness ranking from accumulated receipts before adding new owner adapters;
- preserve `no_packet_needed` as a success state when current prompt/session context is already sufficient;
- add AK/FCOS read-only orientation only after the current output and docs/SCI/session slices stay stable under dogfood;
- add Prompt Vault read-only procedure retrieval only through governed vault read surfaces and only after owner-routing remains non-executing;
- keep file-size discipline so agents can read package source without fragmenting context.

Boundary-safe expansion bets:

- recommend smaller packets for reviewer/scout/subagent/peer prompts without invoking those surfaces;
- keep owner-surface routing advisory-only when a task needs `self`, `dispatch_subagent`, peer launch, `intercom`, orchestrator supervision, AK/FCOS authority, Prompt Vault governance, or ROCS semantics;
- measure whether packets actually reduce low-level probes and duplicate context across live dogfood sessions.
