---
summary: "Paste-ready prompt to implement the live TUI icicle/header-strip for context-core inside /c, without absorbing forensic JSONL replay."
read_when:
  - "Starting the P2 live TUI slice for pi-context-overlay."
system4d:
  container: "Package-local execution prompt for the live context-core overlay surface."
  compass: "Keep occupancy, warmth, and cost visually distinct; do not invent a second session history graph."
  engine: "Read overlay contracts -> extend classifier/snapshot -> icicle + header strip in TUI -> tests + live install/reload/self-test."
  fog: "Live ContextUsage has no cacheRead; warmth must be labeled estimated/unknown rather than faked from JSONL fields."
---

# Prompt — P2 live TUI for context core (`/c`)

Copy everything below the line into a fresh Pi session at
`/home/tryinget/ai-society/softwareco/owned/pi-extensions`.

---

You are implementing **P2 live TUI** for `@tryinget/pi-context-overlay` only.

## Objective

Upgrade `/c` from a grouped list of the *current* window into a live **context-core
inspector** with:

1. A **header strip**: occupancy (`usage.tokens / usage.contextWindow`), percent,
   and a one-line **runway** estimate (est-tokens growth over recent live snapshots
   if you keep a small ring buffer; otherwise omit runway rather than fake it).
2. An **icicle pane** of the current window: x = token share, depth =
   category → tool/file → item. Keyboard: existing ←/→ pane focus, ↑/↓ select,
   Enter opens file (already implemented). Add a mode toggle (e.g. `Tab` or
   `g`/`i`) between **groups list** (keep it) and **icicle**.
3. Selected icicle frame drives the existing items/preview pane. Do not invent a
   third interaction language.

## Non-goals (do not do)

- Do not import or run `scripts/context-strata-*.mjs` inside the live overlay.
  Forensic JSONL replay stays forensic. Live data is `ctx.getSystemPrompt()`,
  `buildSessionContext(...)`, `ctx.getContextUsage()`.
- Do not build a session-history flamegraph, compaction-fault timeline, or
  cacheRead warmth contour in TUI. Host `ContextUsage` is `{ tokens, contextWindow,
  percent }` — **no cacheRead**. If you cannot measure warmth live, show occupancy
  only and label it measured. Never display a warm contour derived from chars/4.
- Do not implement P3 (compaction tradeoff calculator) or P4 (targeted GC).
- Do not open `--data-agnt-*` child sessions.
- Do not invent a second history graph. Overlay already rebuilds on
  `session_start`, `session_tree`, `session_compact`, `context`, `turn_end`.

## Read first (in order)

1. `packages/pi-context-overlay/AGENTS.md`
2. `packages/pi-context-overlay/docs/project/2026-08-26-context-core-profiler-rfc.md`
   (model + epistemic ledger; P2 is the live counterpart of the current-window icicle)
3. `packages/pi-context-overlay/src/types.ts`
4. `packages/pi-context-overlay/src/classifier.ts`
5. `packages/pi-context-overlay/src/snapshot-store.ts`
6. `packages/pi-context-overlay/src/context-overlay-component.ts`
7. `packages/pi-context-overlay/extensions/context-overlay.ts`
8. `packages/pi-context-overlay/tests/context-overlay.test.ts`

Canonical RFC: occupancy ≠ cost; token-turns and warmth are forensic-only unless
the host grows new usage fields.

## Data work

Extend `ContextItem` (not a parallel type) with optional:

- `turnIndex?: number` — count of user messages before this item, 0 for system
- `ordinal?: number` — position in classifier emission order (window stack)

Do **not** add `warmModelTokens` or `cacheRead` unless you read them from a real
host API. `chars/4` remains the per-item estimate; continue anchoring group
percent to `usage.tokens` when present (classifier already takes
`totalContextTokens`).

Keep `buildGroups` pure. If you need turnIndex, compute it while walking
`messages` (user message increments). Tests in `tests/context-overlay.test.ts`
must cover: system/agents split, tool path extraction, percent vs usage tokens,
and the new fields.

File budgets: code 500 LOC / 50KB (brownfield ratchet). `classifier.ts` is
already 460 — if you grow it past 500, split a helper (e.g. `src/icicle-layout.ts`)
rather than silencing the budget. Overlay component is 269; keep render paths
small.

## TUI work

`ContextOverlayComponent`:

- Header already shows LIVE/FROZEN, `tokens/contextWindow (percent%)`, model.
  Add a compact occupancy bar (theme colors; no extra box drawing library).
- New `focusPane` or `viewMode`: `"groups" | "items" | "icicle"`. Default can
  stay groups so muscle memory survives; document the toggle in the footer
  keyhints using existing `keyHint(...)`.
- Icicle render: one or two terminal rows per depth using `▀`/`█` or theme-fg
  spans proportional to item.tokens / max(sum, usage.tokens). Width = inner
  width. Click analog = left/right to move a cursor across frames, up/down
  for depth. Selected frame sets `selectedGroup`/`selectedItem`.
- Frozen snapshot behavior stays: `setSnapshot` no-ops while frozen.
- Stay inside `@earendil-works/pi-tui` (`truncateToWidth`, `matchesKey`) and
  host keybindings. No new deps.

## Tests and live proof

- Extend `tests/context-overlay.test.ts` (node:test + tsx, already wired).
  Cover icicle cursor clamp, empty groups, usage.tokens=null (percent unknown),
  freeze.
- Run `bash scripts/quality-gate.sh ci` from the package. File-budget must stay
  ok or you split.
- Live activation (repo AGENTS rule — you do this, not the operator):

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay
```

Then a one-shot print session cannot exercise TUI. For TUI: open a Ghostty tab,
run `pi`, `/reload`, `/c`, toggle icicle, arrow-select a file-backed item.
Report what you observed. If you cannot open Ghostty, say so and prove everything
else; do not claim live TUI verified.

## Done when

- `/c` shows occupancy strip + icicle mode without regressing groups/items/Enter-open.
- No JSONL replay in the live path.
- No fabricated cache warmth.
- Tests + package quality gate green.
- Commit only `packages/pi-context-overlay/**` (leave unrelated dirty files).
- Update RFC §8 P2 line with what actually shipped vs still missing.

Return: files changed, gate evidence, live-proof evidence or explicit deferral.
