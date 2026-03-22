---
summary: "Audit map for root-owned and package-local tech-stack review surfaces in the pi-extensions monorepo."
read_when:
  - "Reviewing whether tech-stack policy should stay centralized at monorepo root."
  - "Before changing package or template outputs for stack-lane metadata."
system4d:
  container: "Tech-stack review surface audit."
  compass: "Keep root policy centralized while making package-local divergence explicit and minimal."
  engine: "Inspect root surfaces -> inspect package surfaces -> route template/package follow-up to the correct repo."
  fog: "The main risk is changing template/package outputs without first seeing which packages still depend on the older full surface."
---

# Tech-stack review surfaces — pi-extensions monorepo

## Reduced-form target

For this monorepo, the intended direction is:

- monorepo root owns the shared policy and validation stance
- package/template outputs shrink toward a reduced local form
- reduced local form means keeping `docs/tech-stack.local.md` only when a package has a real local override to document

Current root-owned sources of truth:

- `docs/tech-stack.local.md`
- `scripts/validate-tech-stack-contract.mjs`

## Live audit command

From repo root:

```bash
npm run tech-stack:review-surfaces
```

JSON form:

```bash
node ./scripts/tech-stack-review-surfaces.mjs --json
```

The script enumerates every package root under `packages/` and reports whether it still carries:

- package-local `docs/tech-stack.local.md`
- package-local `policy/stack-lane.json`

## Current audit snapshot

Audited on 2026-03-22.

### Legacy full surface (`docs/tech-stack.local.md` + `policy/stack-lane.json`)

- `packages/pi-activity-strip`
- `packages/pi-autonomous-session-control`
- `packages/pi-interaction/pi-interaction`
- `packages/pi-ontology-workflows`
- `packages/pi-society-orchestrator`
- `packages/pi-vault-client`

### Reduced-form package-local surface (`docs/tech-stack.local.md` only)

- `packages/pi-interaction`

### No package-local tech-stack review surface today

- `packages/pi-interaction/pi-editor-registry`
- `packages/pi-interaction/pi-interaction-kit`
- `packages/pi-interaction/pi-runtime-registry`
- `packages/pi-interaction/pi-trigger-adapter`
- `packages/pi-prompt-template-accelerator`

## Routing notes

Use this audit before changing generated outputs.

Route follow-up work as follows:

- template output changes:
  - `~/ai-society/softwareco/owned/pi-extensions-template/NEXT_SESSION_PROMPT.md`
- Nunjucks live verification:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client/NEXT_SESSION_PROMPT.md`
- session/handoff prompt wording and prompt-template work:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/NEXT_SESSION_PROMPT.md`

## Practical interpretation

This audit does **not** by itself remove package-local `policy/stack-lane.json` from existing packages.
It makes the current state explicit so template and package follow-up can distinguish:

- packages that still rely on the older full surface
- package roots already closer to reduced form
- package members with no local tech-stack review surface at all
