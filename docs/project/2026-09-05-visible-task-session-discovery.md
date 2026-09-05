---
summary: "Discovery for a consolidated visible task-session launcher: existing lane script, Pi transport, fleet overlap, discovery failure and decision boundary."
read_when:
  - "Designing or reviewing a fresh task-specific Pi session in a Ghostty window."
  - "Considering a new Ghostty launcher script or agent-facing launch skill."
type: "discovery_packet"
task_id: 5434
status: "assessment_for_design_not_runtime_acceptance"
---

# Visible task-session launch — discovery

## Scope and provenance

Task **5434** owns this discovery and its [design packet](2026-09-05-visible-task-session-design.md). The operator requested a reusable launch capability, a many-of-the-greats comparison, then a design packet followed by the existing state machine. No implementation, live launch experiment, package activation or external-repo write occurs in this task.

Observation date: 2026-09-05. Pi-extensions HEAD at inspection: `176e64c6967d3039e3f5cbc3649136797bd50ff3`; owned-lane HEAD: `5f02859fbd079d80000161bdaca441065d9fc2ee`. Both worktree and committed identity matter: the lane capability map and several package files were already dirty. File hashes below bind inspected bytes, not a clean build or installed runtime.

## Problem and stakeholder evidence

The operator asked how task-specific Astra windows were opened and whether a skill/CLI/script plus capability-map entry should make this discoverable to harnessed LLMs. A temporary launch script had been composed despite a checked-in task launcher already existing. This is a concrete discovery/selection failure, not proof that the old script meets the requested contract.

The preceding conversation described three launch attempts, but their full process/readiness evidence was not re-established by this discovery. Those reports are motivation only. This packet neither certifies those workers nor relaunches them.

## Inspected surfaces and dispositions

Relative file references below resolve from this document; owner identities remain explicit. Proposed paths are labelled as proposals rather than linked as existing files.

| Surface | Observed fact | Disposition and design implication |
|---|---|---|
| [Lane task script](../../../scripts/launch-pi-ak-task-ghostty.sh) | Resolves AK tasks via `scripts/ak.sh`; hard-codes `next_session_prompt.md`; single task defaults interactive, multiple tasks print; direct background Ghostty; no newer private command-admission handshake or explicit provider/model flags. `cd` is not checked in the child shell. `--dry-run` still creates the log directory. | **Enhance / integrate, then retire duplicate transport.** Preserve the task-centric entrypoint only as an adapter after owner-approved migration. Do not advertise current script as the new safe contract. |
| [Lane launcher contract](../../../docs/project/ghostty-ak-task-launcher.md) and lane README | Existing documented launcher; includes a `/tmp` log example and old wrapper assumptions. | **Enhance** through a separate lane-owner task. Documentation existence did not ensure retrieval. No lane edit here. |
| [Lane capability map](../../../docs/project/repo-capability-map.md) | Lane-root row already contains `Ghostty AK launcher`; pi-extensions row names peer tools, but the launcher cue does not directly point to the launcher contract. | **Enhance** the routing chain after supported-entrypoint proof; not a capability-truth store. Preserve existing dirty changes. |
| [Little-helpers launch contract](../../packages/pi-little-helpers/docs/project/2026-04-16-sidequest-ghostty-launch-contract.md) | Specifies exact Ghostty targeting, explicit child cwd, detached window transport, private command-admission handshake, indeterminate-effect refusal and launch-versus-readiness limits. | **Reuse** transport safety rules and owner implementation. Share implementation, not copied shell recipes. |
| [Capability manifest](../../packages/pi-little-helpers/src/capabilityManifest.ts) and [README](../../packages/pi-little-helpers/README.md) | Existing fork, clean scout, isolated candidate and clean continuation families. No explicit fresh independent task-worker tool with provider/model selection in the inspected manifest. | **Enhance**, subject to decision. Do not relabel scout/fork/handoff as this missing operation. |
| [Agent registry](../../packages/pi-agent-registry/README.md) | Phase-2 standing-agent dispatch is exact-task, read-only and ASC-backed; documents claimant-authentication and concurrent-attempt limitations. | **Reuse owner boundary**, not its known limitations as a launch safety guarantee. Standing-agent identity is optional composition, not required for an ordinary fresh task worker. |
| AK tasks 5133 / 5134 | Both pending at readback. 5133 owns clean visible standing-agent launch; depends on 5128/5129/5132. 5134 owns standing-agent candidate permit/revision/measurement/fan-in binding and depends on 5133. | **Coordinate**, not duplicate or reassign. Propose shared transport consumption while preserving their existing scope/dependencies. Neither is claimed by this task. |
| AK task 5432 and existing ASC dirty files | Claimed editor-prefill repair exists; dirty `self` delivery/prefill files belong to that work. | **Reference only.** New launch must avoid editor delivery; do not duplicate the repair. |
| AK decisions 59 / 63 | Passports report accepted candidate lifecycle-v2 and admission activation decisions; they do not authorize a fresh-task bypass. | **Preserve** candidate admission, cleanup quarantine, exact resource authority and separate task legality. |
| Installed Pi [skills guide](/home/tryinget/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md) and [packages guide](/home/tryinget/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md) | Skills can be package-distributed via `pi.skills`; descriptions are startup discovery metadata; disabled skills, filtering and collisions can make a resource unavailable. Package-local existence does not imply global discovery. | **Reuse** package distribution with installed-artifact and fresh-context discovery tests. Other harnesses need explicit skill discovery configuration and can use a CLI without a Pi parent. |

## Exact inspected-byte anchors

| Source (document-relative link) | SHA-256 |
|---|---|
| [Lane task script](../../../scripts/launch-pi-ak-task-ghostty.sh) | `9a2eccea7c7f5d78c5065bc71cb8073d02890219bcb442247edbe63f08e9e552` |
| [Lane launcher contract](../../../docs/project/ghostty-ak-task-launcher.md) | `76658f12eb75a7277b074728542c82cc42f8d4eb8431b79ecac5cd5b2a266bff` |
| [Lane capability map](../../../docs/project/repo-capability-map.md) | `29df86d859ae3e18491c960bcc62c9db16798402b5de6c733e1e8fdc8cfd4582` |
| [Little-helpers launch contract](../../packages/pi-little-helpers/docs/project/2026-04-16-sidequest-ghostty-launch-contract.md) | `123caece8888e8a7e2996f403685197d021acb15eb2ab63284928ca545d6a6d6` |
| [Capability manifest](../../packages/pi-little-helpers/src/capabilityManifest.ts) | `cc8f9c03685a90e81f99a75a70a520ab75a295632f9b859defc406db89462acb` |

AK readbacks were made serially through `agent-kernel/scripts/ak-runtime-gate.sh`. Its inspected contract owns the database selector and supplies the policy-selected explicit `-d` argument. Passing a second selector was rejected before AK started; use `gate -- <AK arguments>` rather than copying a direct binary command.

## Current workflow position

The read-only `ak layer12 cockpit --repo .` reports **SF7 / IW8 / task 4165**, an adaptive-portfolio concern, with `generic_proceed_means=continue_current_execution_task`. It is not this launch design's execution authority. Its token-specific `open_decision` control is blocked and scoped to an unrelated Position/Controls proof slice; do not pretend it applied this design's lifecycle.

`ak design guide` and `ak packet guide --kind design` select design contract plus decision-membrane determination. They explicitly stop short of implementation. Existing design packets 64/73 concern Vault dispatch and the prompt operating system, not this missing task-launch surface. Task 5434 is a bounded supporting design task; it does not repoint the active wave or mint a new strategic frame.

## Design input and remaining uncertainty

Additional source inspection after the first review identified [launchPiQuestSession](../../packages/pi-little-helpers/extensions/sidequestLaunch.ts) and [launchDetachedGhosttyWindow](../../packages/pi-little-helpers/extensions/sidequestDetachedWindow.ts). The latter uses Node APIs without a value import of the Pi host. The former imports ExtensionAPI as a type but requires `pi.exec` / `pi.getThinkingLevel`, accepts explicit execution seams, and shares transport with strict controller-tab-only ASC observers. The inspected package manifest has no CLI bin, no launch-core export and no `pi.skills` entry. A host-independent adapter is plausible, not proven by an import/packed-runtime smoke test. Existing detached transport removes its temporary handshake scratch in `finally`; the proposed durable unresolved-attempt observation must preserve the transport result outside that scratch rather than treating it as durable history. G2 therefore remains an explicit packaging/compatibility gate.

The selected solution is one shared visible-launch implementation, a thin source-owned AK task adapter, CLI/Pi projections and a distributed selection skill. Shared command/runtime behavior requires an architecture decision before implementation. The material admission and packaging questions are tracked in the design's decision-input gates, not hidden as implementation details.

This assessment establishes inspected-source facts and the need for design. It does not prove live transport correctness, a safe arbitrary task worker, automatic task delegation, effective skill discovery, standing-agent readiness, or a shipped CLI. The next lawful activity is review of the design under task 5434, followed by exact-scope decision authorization where required.
