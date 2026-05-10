---
summary: "Autoresearch campaign brief for code-to-canvas live design paths across browser, Penpot, OpenPencil, and DesignMD Foundry."
read_when:
  - "Starting or reviewing the code-to-canvas live design autoresearch campaign."
  - "Comparing browser live preview, Penpot, OpenPencil, and DesignMD Foundry projection routes."
type: "campaign-brief"
system4d:
  container: "Cross-owner autoresearch campaign brief for live/watchable AI-authored design surfaces."
  compass: "Find the best first live-design architecture without overclaiming external canvas integration readiness."
  engine:
    invariants:
      - "Pi autoresearch owns exploration, route comparison, experiment execution, and synthesis."
      - "DesignMD Foundry owns DESIGN.md, verified export/handoff surfaces, Watch Mode, and design evidence packets."
      - "Browser preview is treated as the likely implementation truth surface until experiments prove a better truth surface."
      - "Penpot/OpenPencil outputs are projections or handoffs unless a live, explicitly approved mutation proof records before/after evidence."
  fog:
    risks:
      - "Calling projection/handoff output live sync without proof."
      - "Letting Foundry become the autoresearch orchestrator."
      - "Mutating DESIGN.md, Penpot, OpenPencil, AK, or KES from exploratory paths without explicit owner approval."
---

# Code-to-canvas live design autoresearch campaign

## Campaign identity

- campaign: `code-to-canvas-live-design-autoresearch`
- AK task: `#2794 Run code-to-canvas live design autoresearch campaign`
- question: Can AI-authored code become a live/watchable design surface in browser, Penpot, OpenPencil, or a hybrid path, and which route gives the best fidelity, editability, and operator experience?
- first-pass method: Pi / `pi-autoresearch` / `pi-society-orchestrator` campaign execution, not DSPx program generation.

## Owner model

| Concern | Owner |
|---|---|
| campaign exploration, route comparison, experiment execution, synthesis | `pi-autoresearch` / `pi-society-orchestrator` |
| `DESIGN.md`, design contract lint/export, Watch Mode, Foundry packets | DesignMD Foundry |
| visible candidate worktrees / peers | Pi peer tooling |
| final adoption decision / durable evidence | AK / owner decision surface |
| live Penpot/OpenPencil mutation or promotion | explicit design-tool owner approval |

Foundry is a subject-matter owner and evidence provider. It is not the campaign orchestrator.

## Foundry owner guidance already received

The DesignMD Foundry owner session said the campaign should respect these current verified surfaces:

- Read first in `/home/tryinget/ai-society/softwareco/owned/designmd-foundry`:
  - `DESIGN.md`
  - `docs/project/product_posture.md`
  - `docs/project/integration-readiness.md`
  - `docs/project/integrations.md`
  - `docs/learnings/2026-05-10-standalone-projection-surface-dogfood.md`
- Stable gates / commands:
  - `npm run check`
  - `npm run readiness:integrations`
  - `npm run smoke:render:baseline`
  - optional local visual evidence: `npm run visual:cssvd`
- Stable export / projection paths:
  - CLI exports: `css`, `oat`, `tailwind`, `dtcg`, `json`, `xstate`, `rive`, `agent-prompt`
  - Watch Mode canvas bridge: `designmd.canvas-bridge.v1`
  - canvas bridge export to `svg` and OpenPencil-compatible `.pen`
  - standalone projection pages: `/canvas-bridge.html?session=<id>` and `/penpot-pull.html?session=<id>`
  - OpenPencil fixture-verified `info`, `lint`, and export to `svg`, `png`, `jpg`, `webp`, `fig`
  - Penpot MCP inspect/export/bridge where bridge apply is explicit and bounded
- Claim boundaries:
  - no continuous Penpot sync claim;
  - no unattended MCP mutation automation claim;
  - no OpenPencil JSX claim;
  - no browser/page-wide Pigmnts claim;
  - Watch Mode is local evidence/observability, not canonical AK evidence.

## Candidate routes

### Route A — Browser live preview as truth

Hypothesis: Code changes rendered in a browser are the best first implementation truth surface. Penpot/OpenPencil should consume projections from this truth rather than become the main runtime.

Proof artifact target:

- tiny token-backed HTML/CSS/component fixture;
- live/watch reload path or render-smoke proof;
- screenshot or browser-render evidence;
- note on what a human can watch and inspect.

### Route B — Browser/DOM to SVG to Penpot projection

Hypothesis: DOM/browser truth can be projected to SVG and reviewed/imported in Penpot with acceptable visual fidelity, even if editability is limited.

Proof artifact target:

- browser-rendered fixture;
- SVG projection;
- optional Penpot plugin-pull or MCP bridge plan;
- explicit `liveSyncClaimed: false` unless a bounded live apply is actually performed and recorded.

### Route C — Browser/DOM to native Penpot nodes

Hypothesis: Native Penpot node creation is high value but risky/lossy. It should be tried only as a bounded allowlisted proof, not a broad sync system.

Proof artifact target:

- plan-only Penpot MCP bridge first;
- optional explicit apply only with active local Penpot file + plugin connected + operator approval;
- before/after active-file snapshot and SVG export if applied;
- lossiness/editability assessment.

### Route D — DesignMD/code to OpenPencil/Pencil

Hypothesis: DesignMD + code can produce OpenPencil-compatible `.pen`/export artifacts that are more agent-native and inspectable than Penpot for early review.

Proof artifact target:

- canvas bridge export to `.pen`;
- OpenPencil `info` / `lint` / `svg` export;
- editability assessment;
- note that JSX is not claimed.

### Route E — Hybrid browser truth + review projections

Hypothesis: The best near-term architecture is browser as truth, Foundry Watch Mode as evidence cockpit, and Penpot/OpenPencil as review/editability projections.

Proof artifact target:

- small end-to-end packet showing browser evidence plus projection artifacts;
- comparison matrix against routes A-D;
- recommended owner boundary and implementation task.

## Fixtures to test

Use small, token-preserving fixtures. Do not mutate canonical `DESIGN.md` automatically.

1. token-backed landing card / page section;
2. stateful button/form with focus, hover, disabled, and accessible labels;
3. responsive card grid;
4. motion/interaction handoff sample;
5. optional reference-inspired but token-preserving section.

## Scoring rubric

Each route gets scores and caveats for:

| Dimension | Question |
|---|---|
| token fidelity | Does output preserve `DESIGN.md` tokens and constraints? |
| visual fidelity | Does it match browser truth or intended design? |
| editability | Can a human edit the result in the target tool afterward? |
| watchability | Can a human watch progress live or near-live? |
| agent reliability | Can an agent generate it repeatably without hidden setup? |
| accessibility | Are focus, contrast, labels, and interaction states preserved? |
| evidence quality | Are screenshots/SVG/`.pen`/board ids/checks easy to inspect? |
| latency | Is feedback fast enough for operator steering? |
| reversibility | Are mutations sandboxed, rollbackable, and explicit? |
| authority honesty | Does the route avoid claiming sync/promotion without proof? |

## Campaign outputs

The campaign should produce:

- comparison matrix;
- tiny proof artifact for each feasible route;
- screenshots / SVG / `.pen` / Penpot board evidence where possible;
- scores for watchability, editability, agent reliability, and fidelity;
- explicit verified-vs-speculative boundary;
- recommended architecture;
- follow-up implementation task(s).

## First execution plan

1. Use Foundry as an owner input source and evidence provider.
2. Run visible scout/candidate lanes for route-specific feasibility/proofs.
3. Controller verifies artifacts and claims; peer/intercom output remains communication only.
4. Use `pi-autoresearch` receipts/packets for campaign synthesis where the runtime path is available.
5. If a live Penpot mutation is attempted, require explicit operator approval and capture before/after + SVG evidence.
6. Do not mutate AK/KES/Prompt Vault/ROCS or canonical `DESIGN.md` from campaign routes.

## First pass execution status — 2026-05-10

The campaign was started as a supervised, visible-peer autoresearch pass rather than DSPx program generation.

### Lanes launched

| Lane | Peer run | Owner/repo | Status | Output |
|---|---|---|---|---|
| Foundry route readiness scout | `scoutpeer-mozvpdx2-67aab2f3` | `softwareco/owned/designmd-foundry` | final received | six-route verified-readiness map |
| Route A browser truth proof candidate | `candidatepeer-mozvpdzh-6621bfd2` | `softwareco/owned/designmd-foundry` | final received | candidate doc in isolated worktree; no external mutation |
| Routes B/D/E projection proof candidate | `candidatepeer-mozvpdzs-1f6cf5db` | `softwareco/owned/designmd-foundry` | final received | candidate doc + generated SVG/`.pen`/Penpot-plan artifacts in isolated worktree |

Controller status: peer outputs are communication only. The controller inspected the candidate proof notes and treated them as review evidence, not promotion authority.

### First-pass comparison matrix

| Route | Current confidence | Watchability | Editability | Agent reliability | Evidence quality | Boundary |
|---|---:|---:|---:|---:|---:|---|
| A — browser live preview as truth | high | high | medium | high | high | implementation truth surface; no external canvas claim |
| B — browser/canvas bridge to SVG/Penpot projection | medium-high | medium | low-medium | high | medium-high | deterministic static projection/handoff only |
| C — native Penpot MCP board creation | medium | medium | medium-high if applied | medium | high when applied with before/after + SVG | requires explicit live Penpot approval; no continuous sync |
| D — DesignMD/code to OpenPencil `.pen` | medium | medium | medium pending OpenPencil validation | medium | medium | `.pen` handoff generated; native OpenPencil validation depends on installed CLI |
| E — hybrid browser truth + review projections | high | high | medium-high | high | high | recommended near-term architecture |

### Findings

1. Browser live preview is the strongest first implementation-truth surface. Existing Foundry `npm run dev` lets a human watch locally, and `npm run smoke:render:baseline` proves the same browser surface through Chromium, selector checkpoints, baseline comparison, and unchanged `DESIGN.md` hashes.
2. SVG and `.pen` projection from `designmd.canvas-bridge.v1` is feasible as local handoff evidence. It should be described as projection/handoff, not live sync.
3. Penpot MCP is already verified for inspect, plan, export, and explicitly approved bounded board creation. This campaign did not apply live mutation; any Route C proof needs a separate operator-approved live Penpot run with before/after and SVG evidence.
4. OpenPencil remains promising but environment-sensitive. A candidate generated `.pen` successfully, but clean-worktree OpenPencil lint reported the CLI as unavailable. Treat OpenPencil-native proof as pending dependency/readiness validation.
5. The best near-term product architecture is hybrid: browser truth + Foundry Watch Mode evidence + deterministic SVG/`.pen`/Penpot-plan projections + explicit owner approval for any live canvas mutation.

### Candidate worktrees

- Route A browser truth proof:
  - `/home/tryinget/.local/state/pi-quests/worktrees/designmd-foundry-82cc3efd/code-to-canvas-browser-truth-proof`
  - changed file: `docs/project/code-to-canvas-browser-truth-proof.md`
  - reported validation: `npm run lint:design` passed; `npm run smoke:render:baseline` passed with `baseline_compared`.
- Routes B/D/E projection proof:
  - `/home/tryinget/.local/state/pi-quests/worktrees/designmd-foundry-82cc3efd/code-to-canvas-projection-proof`
  - changed files: `docs/project/code-to-canvas-projection-proof.md`, `examples/generated/code-to-canvas-projection-proof.*`
  - reported validation: SVG/`.pen`/Penpot-plan shape checks passed; OpenPencil lint recorded an unavailable-tool blocker; broader `npm test` failed only on expected OpenPencil CLI availability assumptions in that clean worktree.

### Recommendation

Adopt Route E as the campaign recommendation for the next implementation slice:

```text
browser-rendered code is the live/watchable truth
-> Foundry Watch Mode captures local evidence and review packets
-> canvas bridge emits SVG / .pen / Penpot-plan projections
-> live Penpot board creation happens only through explicit MCP apply approval
```

Follow-up task: create a small integrated route-readiness/review packet in the Foundry owner repo, then decide whether to promote any candidate proof artifact there. Do not merge the candidate worktrees solely from peer reports; inspect and validate from the owner checkout first.

## Cleanup posture

Do not pause for a broad autoresearch cleanup first. This campaign is exactly the right dogfood to expose the next cleanup target. Cleanup is allowed only when a concrete friction appears and is bounded to the owning package.
