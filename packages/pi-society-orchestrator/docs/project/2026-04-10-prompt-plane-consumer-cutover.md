---
summary: "Bounded note for task 1049: orchestrator now consumes the supported pi-vault-client prompt-plane seam for cognitive-tool preparation while keeping catalog metadata + release-proof follow-through explicitly separate."
read_when:
  - "You are reviewing or extending the prompt-plane cutover in pi-society-orchestrator."
  - "You need the exact boundary after task #1049 without reopening the whole architecture packet."
system4d:
  container: "Prompt-plane consumer cutover note for pi-society-orchestrator."
  compass: "Move prompt preparation to the owning package without inventing a second prompt-plane runtime in orchestrator."
  engine: "Consume the supported seam for exact cognitive-tool loading -> preserve bounded local metadata listing -> defer package-install proof to the dedicated validation slice."
  fog: "The main risks are drifting back to private pi-vault-client imports, pretending catalog listing already has a public seam, or widening the cutover into packaging proof that belongs to the next task."
---

# Prompt-plane consumer cutover — task `#1049`

## Scope

This note captures the bounded orchestrator-side consumer cutover after upstream task `#1050` exposed the supported non-UI prompt-plane seam in `pi-vault-client`.

In scope for task `#1049`:
- switch exact cognitive-tool prompt loading to the supported `pi-vault-client/prompt-plane` seam
- keep orchestrator as a consumer rather than a second prompt-plane owner
- add package-local guardrails/tests so the consumer seam stays public-only
- refresh README / handoff / backlog truth

Out of scope for task `#1049`:
- package-install / tarball proof of the new dependency path
- root release-component validation
- a public prompt catalog/list seam from `pi-vault-client`
- broader continuation-envelope orchestration in orchestrator

Those proof/packaging concerns were intentionally deferred in task `#1049` and later closed by task `#1051`.

## What changed

### 1. Exact cognitive-tool preparation now goes through `pi-vault-client`

`src/runtime/cognitive-tools.ts` now loads exact cognitive-tool prompt bodies through the supported public seam:

```ts
import("pi-vault-client/prompt-plane")
```

and prepares the selected template through:

```ts
createVaultPromptPlaneRuntime().prepareSelection(...)
```

That means orchestrator now consumes package-owned prompt-plane behavior for:
- visibility-aware prompt preparation
- company-context fail-closed behavior
- template render/preparation semantics
- ambiguity/blocking handling

instead of reading raw prompt bodies directly with local `dolt sql` in the execution path.

### 2. Orchestrator still keeps a bounded local metadata listing path

`listCognitiveTools(...)` remains a narrow local metadata listing helper for `/cognitive`, runtime-status health summaries, and footer health checks.

This is intentionally narrower than the old raw prompt-body path:
- **prompt bodies / prepared text** now come from `pi-vault-client`
- **catalog metadata** is still local until `pi-vault-client` exposes a supported public list/query seam suited to this consumer use case

Do not read this as prompt-plane ownership remaining local.
It is a bounded metadata gap, not a reason to move prepared prompt semantics back into orchestrator.

### 3. Guardrails now fail closed on private Vault imports

`tests/execution-seam-guardrails.test.mjs` now asserts that orchestrator source consumes Vault only through:
- `pi-vault-client/prompt-plane`

and does **not** drift back to:
- `pi-vault-client/src/*`
- repo-relative sibling imports into private Vault internals

## Resulting boundary

### Canonical now
- prepared cognitive-tool prompt text for direct dispatch and loops: `pi-vault-client`
- prompt-plane render / company / visibility semantics: `pi-vault-client`
- orchestrator-side agent routing / loop sequencing / execution synthesis: `pi-society-orchestrator`

### Still deferred
- public prompt catalog/list seam for orchestrator metadata views
- any broader continuation-envelope orchestration beyond exact prompt loading

## Validation for this slice

Focused validation for task `#1049`:

```bash
node --test tests/cognitive-tools.test.mjs tests/execution-seam-guardrails.test.mjs
npm run docs:list
npm run check
```

Task `#1051` later closed that package-install / tarball proof through isolated installed-package release smoke against the target tarball plus any required local sibling dependency tarballs.
