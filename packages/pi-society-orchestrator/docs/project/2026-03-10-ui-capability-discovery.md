---
summary: "Phase A evidence + ownership matrix for extension UI/runtime placement before any extraction decisions."
read_when:
  - "Before deciding whether subagent runtime or UI presentation helpers should move between packages."
  - "When architecture discussion starts from assumptions about what UI capabilities already exist upstream."
system4d:
  container: "Focused evidence-gathering artifact for UI/runtime package placement."
  compass: "Map what is already possible before proposing new homes for capabilities."
  engine: "inventory upstream primitives -> map package ownership -> identify gaps -> feed architecture decisions."
  fog: "The main failure mode is confusing generic Pi UI primitives, interaction runtime, and execution runtime."
---

# Phase A — UI capability discovery

## Goal

Establish an evidence-based capability map before deciding whether any subagent runtime or UI presentation logic should move between:

- `pi-autonomous-session-control`
- `pi-interaction`
- a future dedicated execution-runtime package
- a future dedicated UI-helper package

## Status

**Phase A is complete for this slice.**

Validated conclusions:

1. Upstream Pi / `pi-mono` already owns the generic extension UI primitives we need for widgets, footers, overlays, and custom editors.
2. `pi-interaction` owns **interaction-runtime** concerns: editor mounting, trigger brokering, picker flows, and inline selection UI.
3. ASC remains the strongest current owner for **execution/runtime lifecycle** behavior.
4. `pi-vs-claude-code` is a **pattern repo**, not a canonical runtime owner.
5. There is **not yet enough evidence** to justify a dedicated UI-helper package for orchestrator-specific presentation code.

## Source ledger

| Repo/package | Sources checked | What the source proves |
|---|---|---|
| Upstream Pi / `pi-mono` | `packages/coding-agent/docs/extensions.md`, `packages/coding-agent/examples/extensions/README.md`, `packages/coding-agent/examples/extensions/widget-placement.ts`, `custom-footer.ts`, `modal-editor.ts`, `overlay-test.ts`, `packages/tui/README.md` | Generic UI primitives are already upstream: `ctx.ui.setWidget(...)`, `ctx.ui.setFooter(...)`, `ctx.ui.custom(..., { overlay: true })`, `ctx.ui.setEditorComponent(...)`, overlay positioning, non-capturing overlays, and overlay focus handles |
| `pi-interaction` | `README.md`, `docs/dev/package-boundary-architecture.md`, `pi-interaction/README.md`, `pi-interaction-kit/src/ui.js`, `pi-editor-registry/src/editorRegistry.js`, `pi-interaction/extensions/input-triggers.ts` | `pi-interaction` is a same-process interaction-runtime family: editor ownership, trigger broker, picker registration, fuzzy selection, and inline overlay selection flows |
| ASC | `README.md` | ASC already owns `dispatch_subagent`, prompt envelope application, session lifecycle, runtime invariants, and dashboard/status artifacts |
| `pi-vs-claude-code` | `README.md`, `extensions/subagent-widget.ts`, `extensions/tool-counter-widget.ts` | Rich widget/footer/overlay usage exists as reusable UX inspiration, but it is built on upstream Pi surfaces rather than defining a canonical runtime boundary |

## What Phase A resolved

### Upstream Pi / `pi-mono`

Generic extension UI already exists upstream and should be consumed directly when possible:

- widgets above and below the editor
- custom footers
- custom editor components
- full overlay/dialog flows
- overlay sizing, anchoring, focus/unfocus, and non-capturing behavior

This means orchestrator should **not** invent a new package merely to wrap already-canonical Pi UI primitives.

### `pi-interaction`

`pi-interaction` should be treated as the owner of **interaction runtime**, not all extension UI.

What it clearly owns:

- editor mounting / editor ownership
- trigger broker lifecycle
- picker registration
- fuzzy candidate selection
- inline overlay selection helpers in the interaction flow

What it does **not** need to own by default:

- all widgets across all extensions
- global footer ownership
- execution/runtime lifecycle for subagents

### ASC

ASC remains the strongest execution-plane owner.

What it clearly owns today:

- subagent dispatch
- prompt envelope application
- session lifecycle
- reliability/invariant handling
- session/dashboard artifacts

So the working direction remains:

- **ASC-owned public execution contract first**
- extract a smaller shared runtime only if that public contract leaks `self`-specific or extension-bootstrap concerns

### `pi-vs-claude-code`

Treat `pi-vs-claude-code` as a **pattern repo**.

It is useful for:

- persistent widget layout patterns
- compact live-status widgets
- overlay interaction ideas
- dashboard ergonomics

It is **not** evidence that the pattern repo should become the runtime owner of those capabilities.

## Phase A ownership matrix

| Plane | Canonical owner today | Evidence | Explicit non-goals | Rule for `pi-society-orchestrator` |
|---|---|---|---|---|
| Generic extension UI primitives | Upstream Pi / `pi-mono` | Extension docs + examples + TUI overlay API | Trigger/runtime brokering, subagent lifecycle | Consume directly; do not wrap or extract by default |
| Interaction runtime | `pi-interaction` | package split + editor registry + picker/selection code | Global widget/footer ownership; subagent execution runtime | Depend on it only when orchestrator truly needs editor/trigger/picker semantics |
| Execution runtime | ASC | `README.md` capability inventory | Generic widget/footer ownership; prompt-vault governance | Keep subagent execution ownership there; pursue public contract first |
| UX/presentation patterns | `pi-vs-claude-code` | Pattern extensions using widgets/overlays/footers | Canonical package ownership | Borrow patterns only |
| Coordination / control plane | `pi-society-orchestrator` | current ADR + backlog direction | Raw data access, prompt-vault governance, subagent runtime ownership | Own loops, sequencing, routing, escalation, synthesis |

## Extraction rule after Phase A

Do **not** create a dedicated UI-helper package yet.

Prefer this order:

1. consume upstream Pi UI primitives directly
2. reuse `pi-interaction` only for interaction-runtime behavior
3. keep orchestrator-local presentation glue local until there are at least two real consumers and a proven gap that upstream Pi primitives do not already cover

## Reusable UX patterns worth borrowing

From `pi-vs-claude-code` we should keep in mind:

- persistent status widgets can make background work legible without changing runtime ownership
- compact counters/status chips work well as above-editor widgets
- overlays are good for rich inspection and drill-down flows when the interaction is temporary

Those are **design patterns**, not package-boundary arguments.

## Commands worth re-running when this area changes

```bash
# Upstream generic UI primitives
rg -n "setWidget|setFooter|ctx\.ui\.custom|overlayOptions|setEditorComponent" \
  /home/tryinget/ai-society/softwareco/contrib/pi-mono/packages/coding-agent \
  /home/tryinget/ai-society/softwareco/contrib/pi-mono/packages/tui

# Overlay/focus behavior
rg -n "nonCapturing|showOverlay|focus\(|unfocus\(|isFocused\(" \
  /home/tryinget/ai-society/softwareco/contrib/pi-mono/packages/tui \
  /home/tryinget/ai-society/softwareco/contrib/pi-mono/packages/coding-agent

# pi-interaction scope verification
rg -n "trigger|picker|editor|interaction runtime|facade" \
  /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction

# Pattern repo UX references
rg -n "setWidget|setFooter|overlay|subagent|dashboard" \
  /home/tryinget/ai-society/softwareco/contrib/pi-vs-claude-code
```

## Decision gates resolved in this phase

1. **What generic extension UI is already upstream and should be consumed directly?**
   - widgets, footers, overlays, and custom editors are already upstream Pi capabilities.
2. **What belongs to `pi-interaction` specifically?**
   - editor/trigger/picker interaction-runtime behavior.
3. **What belongs to ASC?**
   - subagent execution/runtime lifecycle and reliability behavior.
4. **Is a new UI-helper package needed now?**
   - no; keep local glue local until multiple consumers and a real gap are proven.

## Exit criteria status

- [x] capability map by package/repo
- [x] ownership matrix separating generic UI, interaction runtime, execution runtime, and control plane
- [x] recommendation to harden first, extract later
