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

## Built-in commands

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

- Package-local stack guidance stays in [docs/tech-stack.local.md](docs/tech-stack.local.md).
- Lane metadata now stays root-owned at the monorepo level and is no longer shipped as `policy/stack-lane.json`.

## Environment flags

- `PI_INTERACTION_ENABLED` (`0` disables runtime)
- `PI_INTERACTION_LEGACY_MODE` (`1` skips editor override)
- `PI_INTERACTION_EXAMPLES` (`0` disables built-in demo triggers such as `!! /` and `!! .`; PTX's `$$ /...` is not a built-in example here)

Legacy `PI_INPUT_TRIGGERS_*` aliases remain accepted for compatibility.
