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

- maturity: `internal dogfood / bounded-SCI-sandbox safety-and-accounting hardened MVP with redacted receipt export, local receipt evaluation, and non-persistent aggregate receipt summaries`
- current strategic line: keep `context_plan` cheap and always available, keep `context_pack` activatable, preserve Markdown-primary output, dogfood the newly sandboxed SCI seam under explicit live-host opt-in, and use redacted live dogfood receipts plus packet-local evaluations/summaries to prove ranking/utility before adding AK/FCOS/Prompt Vault adapters
- proof posture: package quality gate passes with adversarial tests for unsafe caller paths, C0/C1/DEL control-character path intake, dot-prefixed/internal path intake, docs-list path intake including raw docs-list control/whitespace handling, symbol-seed control/size intake, docs-list fallback after unsafe seed omission, Markdown fence injection, Markdown structural-label injection, owner-surface false positives, unreadable files, symlink escapes, missing workspace-root degradation, SCI workflow refusal until read-only safety is confirmed, live extension SCI safety-env propagation, SCI artifact-bypass flag refusal, existing/new `.ontology` SCI artifact fail-closed behavior, repoRoot `.ontology` detection from package cwd, dangling `.ontology` symlink detection, SCI path-seed symlink escape refusal, temporary-sandbox SCI execution, compact details, global and cumulative provider-local budgets, fresh-vs-duplicate tool-call estimates, session dedupe, budget-accurate session visibility, compact session metadata without raw context-usage echoing, redacted dogfood observation templates and local evaluation, aggregate dogfood summary redaction/mixed-invalid handling, aggregate fail-closed intake for non-object and over-limit input, prototype-shaped aggregate labels, aggregate omission follow-up rendering/truncation preservation, dogfood evaluator contradiction truth tables, non-negative integer receipt counts, closed evaluator/summarizer input schemas and oversized-input rejection, owner-extension registration smoke coverage for all context-packer tools, public omission/error detail redaction across Markdown/details/next suggestions, raw omission-detail suppression, and wired-vs-planned-unwired provider gap classification; docs list passes; package is installed locally after the latest pass
- release posture: package checks pass; package is installed locally into Pi; live activation is via toolbox `context-packer` bundle

## Current landed capability baseline

The package currently owns:

- `/context-pack` planning posture command;
- always-active `context_plan` when toolbox baseline is current;
- toolbox-activatable `context_pack` for bounded packet assembly;
- AGENTS provider with loader-style root-to-leaf ordering;
- caller-seeded Markdown docs provider;
- docs-list-ranked Markdown discovery when no explicit safe Markdown seed was supplied, including after unrelated unsafe seeds were omitted;
- shared intake-safety membrane for caller and provider-discovered paths, default-deny dot-prefixed path segments, C0/C1/DEL control-character rejection, monorepo ancestor repoRoot acceptance only with a `.git` marker, boundary-aware provider/owner-surface matching, adaptive Markdown fences, and bounded one-line Markdown structural labels;
- trusted-system-git status provider;
- read-only SCI provider seam that refuses workflow execution unless SCI read-only safety is explicitly confirmed, lets live Pi hosts opt in through `PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE=true`, blocks existing source `.ontology` state, copies safe code path seeds through a temporary sandbox before SCI execution, screens symbol seed controls/size, and limits symbol searches to that bounded sandbox;
- session/system-prompt-aware measurement and already-loaded dedupe;
- primary Markdown packet output;
- advisory owner-surface routing for authority-sensitive work without invoking those surfaces;
- compact structured `details` that omit raw item content by default;
- measurement receipt fields for estimated tool calls avoided, packet fill, selected/omitted counts, already-loaded dedupe, cumulative provider-local budget accounting, compact session awareness that omits raw context-usage objects and reports visibility from actual selected sections, planned-unwired provider omissions, packet-local utility recommendations, post-use dogfood follow-up scaffolds, public provider-failure omission details that omit raw subprocess error text, and redacted copy-ready observation templates that omit raw packet content, selected item paths, and raw omission details;
- packet-local dogfood observation evaluation for filled redacted templates, classifying matched/overestimated/underestimated/needs-review/incomplete outcomes with integer-only count intake, without reading files, calling providers, persisting evidence, updating AK/FCOS, or writing session memory;
- non-persistent aggregate dogfood summaries across multiple redacted observations/evaluations, reporting status counts, provider omission counts, omission follow-up counts/truncation totals, invalid receipts, and cautious next actions without reading receipt files or promoting evidence;
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

The main remaining product gap is not another provider adapter; it is still a growing body of live usefulness proof under the stricter pre-provider safety and accounting membrane. The latest iteration moved SCI from post-hoc artifact detection toward a bounded source-owner membrane: live hosts must opt in through `PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE=true`, source `.ontology` under `cwd` or `repoRoot` fails closed including dangling symlinks, safe code path seeds are copied through no-symlink/TOCTOU-checked sandbox intake, unsafe symbol seeds are omitted as SCI symbol omissions, and broad symbol-only SCI remains an honest omission until a wider verified sandbox/indexing strategy exists. Packet truth must still come from one selected/omitted accounting path: provider-local budgets are cumulative, docs-list discovery remains available after unrelated unsafe seed omission, and session visibility is receipt truth only when the section actually survives budget selection. The dogfood export boundary remains strict: packet Markdown/details may show source-owned packet content for immediate use, but pasteable observation templates are receipt scaffolds only and must omit raw packet content, selected item paths, raw session/context-usage objects, and raw omission details. The evaluator and summarizer remain non-persistent packet-local calibration tools; they do not turn dogfood notes into AK evidence, FCOS closeout, session memory, provider authority, or task completion proof. Owner-extension registration has package-local smoke coverage, but live Pi sessions still need reload/activation before new tool schemas or host env changes are product behavior. First dogfood receipts show useful packets, no-packet outcomes, and post-reload template checks in [Dogfood measurement receipts — 2026-05-22](2026-05-22-dogfood-measurement-receipts.md); the next frontier is repeated evaluated receipts across implementation, review, and validation tasks that distinguish useful omissions from missing capability before ranking changes, broad SCI indexing, or new owner adapters are justified.

## Next product bets

Near-term bets:

- continue dogfooding `context_plan` / `context_pack` against real implementation, review, and validation tasks, recording whether packets reduced raw `read` / search / status churn under the stricter safety/accounting membrane, treating the redacted observation template as the pasteable receipt, `context_dogfood_evaluate` as single-receipt calibration, and `context_dogfood_summarize` as non-persistent multi-receipt calibration while keeping full packet content local to the active turn;
- before choosing more provider work, review whether accumulated evaluated receipts show ranking failures, provider availability failures, accounting/omission mismatches, live reload/registration gaps, or simply correct omissions; use aggregate summaries as triage only, not as canonical evidence or a substitute for owner-surface promotion; verify the live session has reloaded the latest schema before treating a missing tool as product behavior; wired provider outages should not be treated as planned-unwired adapter gaps;
- dogfood the new bounded SCI temporary-sandbox mode before broadening symbol-only or repository-wide SCI ranking;
- tune docs/docs-list, AGENTS, git, and session-awareness ranking from accumulated receipts before adding new owner adapters;
- preserve `no_packet_needed` as a success state when current prompt/session context is already sufficient;
- add AK/FCOS read-only orientation only after the current output and docs/SCI/session slices stay stable under dogfood;
- add Prompt Vault read-only procedure retrieval only through governed vault read surfaces and only after owner-routing remains non-executing;
- keep file-size discipline so agents can read package source without fragmenting context.

Boundary-safe expansion bets:

- recommend smaller packets for reviewer/scout/subagent/peer prompts without invoking those surfaces;
- keep owner-surface routing advisory-only when a task needs `self`, `dispatch_subagent`, peer launch, `intercom`, orchestrator supervision, AK/FCOS authority, Prompt Vault governance, or ROCS semantics;
- measure whether packets actually reduce low-level probes and duplicate context across live dogfood sessions.
