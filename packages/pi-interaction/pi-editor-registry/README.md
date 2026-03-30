# @tryinget/pi-editor-registry

Editor ownership and mount primitives for the `pi-interaction` runtime family.

## Exports

- `TriggerEditor`
- `createEditorRegistry`

## Behavioral contract

- `createEditorRegistry` is a thin mount helper around `ctx.ui.setEditorComponent(...)` plus diagnostics.
- It does **not** implement app-level key handling itself.
- `TriggerEditor` preserves pi app-level editor behavior by extending pi's `CustomEditor` and delegating input to `super.handleInput(...)` before trigger checks run.
- In particular, `Esc`/`app.interrupt` behavior remains owned by the pi host wiring (`onEscape`, action handlers), not by the registry helper.
