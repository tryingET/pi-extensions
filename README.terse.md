---
summary: "Short explanation of what the pi-extensions monorepo is for."
read_when:
  - "You want the shortest truthful explanation of why these extensions exist."
---

# pi-extensions — terse

## What this repo is

A monorepo of Pi extensions that turn raw Pi host/runtime capabilities into operator-usable tools.

## What the extensions essentially do

They make hidden or awkward Pi capabilities visible and actionable:

- inspect live session/context state
- improve interaction and command/prompt workflows
- add bounded operator helpers
- expose vault, ontology, and society workflows inside Pi
- harden autonomous/subagent execution paths

## Why they must exist

Because the base Pi host gives primitives, not the full operator surfaces needed for daily work.

These packages exist to provide:

- reusable commands instead of one-off local hacks
- tested seams instead of copied ad-hoc glue
- operator-visible truth for context, routing, vault state, and execution status
- a place to absorb host drift without bloating Pi core

## Why this is a monorepo

The packages share compatibility, release, and validation concerns, but still need separate seams and ownership.

## For outsiders

This repo is still useful without Prompt Vault, society DB, or the rest of the internal stack.

Prompt Vault, society workflows, and company-specific routing are optional add-ons, not prerequisites for the whole repo.

## Package map

| Package | Standalone usable? | Essentially does | Notes |
|---|---|---|---|
| `pi-context-overlay` | yes | inspect current session context | good outsider entry point |
| `pi-context-packer` | yes | plan bounded future context packets across source-owned providers | read-only first slice; preserves SCI/docs/AK/FCOS/etc. authority boundaries |
| `pi-activity-strip` | yes | show live session/activity strip UI | local desktop/window-manager assumptions may apply |
| `pi-little-helpers` | yes | add small operator helpers | general-purpose utility package |
| `pi-eval-kernel` | yes | aggregate bounded Python/JavaScript programs behind one `eval` call | persistent logical state and explicit capability registry; does not disable Bash; not a sandbox or arbitrary Pi-tool dispatcher |
| `pi-agent-vent` | yes | capture local agent frustration/recurrence diagnostics | advisory only; no tasks, issues, incidents, evidence, or telemetry writes |
| `pi-provenance` | yes | extract minimal Pi session/assistant-message provenance | source-owned provider/model/API refs for downstream evidence writers |
| `pi-peer-messaging` | yes | provide same-machine peer-session messaging and `intercom` adapter | communication-only; not task/evidence/authority state |
| `pi-better-openai` | yes | add OpenAI fast mode, GPT-5.6 Sol Pro injection, and image generation/editing affordances | `/fast`, `/pro`, `/openai-image`, `openai_image` |
| `pi-model-selection` | yes (library) | provide shared model-selection and auth-resolution primitives | support library only; no `pi.extensions` entrypoint |
| `pi-modes` | yes | switch session prompt profiles with explicit composition semantics | additive, complete static-base replacement, and exact final replacement; no autonomy authority |
| `pi-autonomous-session-control` | yes | provide the `self` operational mirror plus autonomy/subagent control surfaces | strongest in subagent-heavy workflows; `self` summaries are mirror-only, not AK/KES/evidence authority |
| `pi-autoresearch` | with extra setup | own the bounded experiment-loop runtime and manifest-campaign control seam | strongest when local campaign receipts and AK/Prompt Vault adjacencies are in play |
| `pi-prompt-template-accelerator` | yes | speed up prompt-template command workflows | picker/prefill UX only |
| `pi-prompt-template-execution` | yes | own prompt-template execution semantics | live successor for external `pi-prompt-template-model`; owns `/commit` extension execution semantics through a minimal guarded entrypoint, with no prompt bundle and no loop/chain/subagent runtime |
| `pi-session-compaction` | yes | own custom compaction summaries | live local `session_before_compact` owner after guarded cutover; handler and fail-closed registration guard are tested, branch augmentation helpers remain non-live |
| `pi-toolbox-discovery` | yes | discover and activate custom-tool bundles on demand | keeps `self`, `interview`, and `toolbox` small/active while heavy package tools stay latent |
| `pi-semantic-code-intelligence` | with installed SCI | expose SCI composites as native Pi tools | long-lived MCP stdio bridge; composite-first; preview/check tools remain risk-gated |
| `pi-evidence-review` | yes | validate and inertly display normalized SCI evidence review v1 | read-only TUI; one explicit workspace JSON file; no normalization, effects, links, or decisions |
| `pi-interaction/pi-interaction` | yes | shared interaction features | host-facing interaction layer |
| `pi-interaction/pi-editor-registry` | yes | provide editor integration seams | lower-level building block |
| `pi-interaction/pi-interaction-kit` | yes | provide reusable interaction helpers | lower-level building block |
| `pi-interaction/pi-runtime-registry` | yes | provide runtime ownership/registry seams | lower-level building block |
| `pi-interaction/pi-trigger-adapter` | yes | provide trigger plumbing for extension commands | lower-level building block |
| `pi-vault-client` | with extra stack | provide governed prompt/vault workflows | strongest with Prompt Vault + company context |
| `pi-ontology-workflows` | with extra setup | provide ontology inspection/change workflows | wants ontology/ROCS setup |
| `pi-society-orchestrator` | with extra stack | run bounded society/loop workflows | wants society/runtime surfaces |
| `pi-society-startup-context` | with AI Society workspace | inject read-only startup orientation packets | no repair/write authority; `/society-context refresh` is read-only |
| `pi-workstation-inference-provider` | with workstation lane-op contract | expose workstation inference as a read-only Pi provider | no model/server/runtime control ownership |

For live release-component inventory, run `node ./scripts/release-components.mjs list --json`.

For behavior-first routing across system prompts, editor prefill, `sendUserMessage`, settlement, loops, and evaluation, see [docs/project/runtime-capability-map.md](docs/project/runtime-capability-map.md).
