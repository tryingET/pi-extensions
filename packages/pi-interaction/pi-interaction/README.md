---
summary: "Umbrella interaction-runtime package for pi with split subpackages."
read_when:
  - "Using @tryinget/pi-interaction in extensions."
system4d:
  container: "Umbrella package docs for interaction-runtime split architecture."
  compass: "Stable facade API over editor-registry, interaction-kit, and trigger-adapter."
  engine: "Install umbrella -> register triggers/helpers -> keep import surfaces package-level."
  fog: "Avoid internal src imports across subpackages."
---

# @tryinget/pi-interaction

Umbrella/facade package for live interaction runtime behavior in pi.

## Canonical package home

This package lives in the `pi-extensions` monorepo at:

- `packages/pi-interaction/pi-interaction`

It is the canonical successor to the old standalone `pi-input-triggers` repo.
The parent `packages/pi-interaction/` directory is a package-group shell, not the publish target.

## Package split (monorepo)

`@tryinget/pi-interaction` now composes three subpackages:

- `@tryinget/pi-editor-registry` — editor ownership + mount primitives
- `@tryinget/pi-interaction-kit` — selection/fuzzy/ranking UI primitives
- `@tryinget/pi-trigger-adapter` — trigger broker + `registerPickerInteraction`

The umbrella keeps the stable end-user extension entrypoint and re-exports the main helper API.

## Install

```json
{
  "packages": ["npm:@tryinget/pi-interaction"]
}
```

## Extension author API (stable facade)

```ts
import {
  getBroker,
  registerPickerInteraction,
  splitQueryAndContext,
} from "@tryinget/pi-interaction";
```

### Example trigger registration

```ts
registerPickerInteraction({
  id: "my-picker",
  description: "Template picker",
  match: /^\$\$\s*\/(.*)$/,
  loadCandidates: async () => ({
    candidates: [{ id: "nexus", label: "/nexus", detail: "High-leverage intervention" }],
  }),
  parseInput: (match) => {
    const parsed = splitQueryAndContext(String(match?.groups?.[0] ?? ""));
    return { query: parsed.query, context: parsed.context, raw: String(match?.groups?.[0] ?? "") };
  },
  applySelection: ({ selected, api }) => {
    api.setText(`$$ /${selected.id} `);
  },
});
```

## Ownership boundary

`@tryinget/pi-interaction` owns the trigger/runtime substrate.
It does **not** own product-specific trigger semantics such as PTX's `$$ /...` prompt-template accelerator surface.
Those belong to the owning extension package (currently `pi-prompt-template-accelerator`), which should register through `registerPickerInteraction`.

## Exact external editor bridge

Interactive Ghostty/Niri sessions expose a same-user, mode-`0600` Unix socket under `${XDG_RUNTIME_DIR}/pi-editor-refine/`. Each publisher receives a process-unique endpoint plus a mode-`0600` `<socket>.json` discovery descriptor in the same mode-`0700` directory. The descriptor carries only protocol/endpoint identity and TTL metadata: no editor text or content hashes. Clients must reject stale descriptors by checking the exact PID/start identity and socket before use.

Eligibility requires the exact owned `TriggerEditor` to be focused, one live process-bound session-presence publisher for the logical session, and the focused Niri window to match the presence-owned Ghostty process, app family, normalized surface, full `gs:<family>:<surface>` plus logical-session title suffix, and focus epoch.

The bridge owns editor access only; it does not call a model or define refinement prompts. A client must:

1. establish a short-lived snapshot of the exact expanded Pi editor buffer;
2. bind the full session, publisher, PID/start identity, owned editor instance/generation, Niri window/focus epoch, mode, transaction, deadline, and input digest;
3. return a changed candidate on the same connection (at most the snapshot and commit frames are accepted);
4. commit only while Pi is idle, no message is pending, the owned editor remains active, process/focus identity is unchanged, and both the exact editor preimage and monotonic generation still match;
5. query hash-only transaction status on a new connection after a lost reply rather than retrying an effect.

Outcomes remain in publisher memory for 30 seconds. `found: false`, expiry, or publisher restart means **unknown and not retry-safe**; it never authorizes another commit. A client must create a fresh operator action and transaction instead of replaying an uncertain effect.

Raw editor text is bounded and transported only in the snapshot/commit exchange. It is never logged, persisted, emitted as a session entry, included in diagnostics, or copied through the system clipboard. A successful changed native `setEditorText()` operation is one Pi undo unit (`Ctrl+-`); unchanged candidates are rejected rather than reported as applied. Unsupported terminals, ambiguous publishers, stale sockets, concurrent operations, focus drift, editor drift, expiry, and readback mismatch fail closed.

## Built-in commands

- `/editor-refine-bridge-status`
- `/triggers`
- `/trigger-enable <id>`
- `/trigger-disable <id>`
- `/trigger-diag`
- `/trigger-pick`
- `/trigger-reload`

## Release notes

- Publish target: `packages/pi-interaction/pi-interaction`
- Root/package release workflow: `../docs/dev/release-workflow.md`
- Trusted publishing notes: `../docs/dev/trusted_publishing.md`

## Local stack surface

- Package-local stack guidance stays in [docs/engineering.local.md](docs/engineering.local.md).
- Lane metadata now stays root-owned at the monorepo level and is no longer shipped as `policy/engineering-lane.json`.

## Environment flags

- `PI_INTERACTION_ENABLED` (`0` disables runtime)
- `PI_INTERACTION_LEGACY_MODE` (`1` skips editor override)
- `PI_INTERACTION_EXAMPLES` (`0` disables built-in demo triggers such as `!! /` and `!! .`; PTX's `$$ /...` is not a built-in example here)

Legacy `PI_INPUT_TRIGGERS_*` aliases remain accepted for compatibility.
