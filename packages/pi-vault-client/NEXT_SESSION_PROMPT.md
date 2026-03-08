---
summary: "Session handoff for the next focused pi-vault-client slice: add governed Nunjucks templating support for Prompt Vault templates without breaking schema-v7 retrieval behavior."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Canonical package session handoff artifact for vault-client templating work."
  compass: "Add opt-in Nunjucks support as a rendering layer above Prompt Vault storage, while preserving schema-v7 ontology/governance boundaries and current retrieval semantics."
  engine: "Re-read package and Prompt Vault boundary docs -> design render-engine contract -> implement minimal Nunjucks path -> validate retrieval/render/install/reload -> document clearly."
  fog: "Main risks are treating Dolt as a template engine, breaking existing pi-style variable templates, introducing unsafe/unbounded templating, or adding DRY indirection without deterministic runtime behavior."
---

# Next session prompt for pi-vault-client

## Canonical package context

- canonical monorepo root: `~/ai-society/softwareco/owned/pi-extensions`
- canonical package path: `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`
- current branch baseline: `main`
- legacy standalone repo: retired from active development

## First reads

1. `AGENTS.md`
2. `README.md`
3. `docs/dev/template-drift-audit.md`
4. `NEXT_SESSION_PROMPT.md`
5. `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`
6. `~/ai-society/core/prompt-vault/docs/dev/vault-client-company-visibility-boundary.md`
7. `~/ai-society/core/prompt-vault/schema/schema.sql`
8. `~/ai-society/core/prompt-vault/scripts/pv-template-vars`
9. `~/ai-society/core/prompt-vault/scripts/pv-exec`

## Current package state

- `pi-vault-client` is aligned to the Prompt Vault schema-v7 boundary
- runtime requires schema version `7`
- runtime checks for these prompt columns:
  - `artifact_kind`
  - `control_mode`
  - `formalization_level`
  - `owner_company`
  - `visibility_companies`
  - `controlled_vocabulary`
  - `export_to_pi`
- query behavior now supports:
  - ontology filters
  - governance filters
  - controlled-vocabulary filters
  - optional `intent_text` re-ranking of the governed candidate set
- `vault_query` defaults now are:
  - `limit: 20`
  - `include_content: false`
  - `include_governance: false`
- current live package install path is via Pi package install + `/reload`
- existing Prompt Vault variable support is **pi-style positional substitution**, not Jinja/Nunjucks:
  - `$1`
  - `$2`
  - `$@`
  - `$ARGUMENTS`
  - `${@:N}`
- Dolt is storage only; templating must be added in client/tooling layers, not assumed from DB

## What not to redo

- do **not** resume work from the retired standalone repo
- do **not** reintroduce legacy `type`-based Prompt Vault assumptions
- do **not** reintroduce prompt tags or namespaced tags into vault-client query/insert logic
- do **not** treat Dolt as if it natively renders templates
- do **not** add runtime-templating magic without a clear opt-in contract
- do **not** break existing pi-style positional variable templates while adding Nunjucks
- do **not** widen the command surface unless there is a strong product reason
- do **not** treat `~/.pi/agent/extensions/...` as canonical source

## Recommended next implementation slice

Implement **opt-in Nunjucks support** as a rendering layer for vault templates.

### Design target

Add support for a governed render-engine contract such as:
- `none`
- `pi-vars`
- `nunjucks`

The exact storage location can be:
- a new DB column,
- or frontmatter in `content`,
- or another explicit contract field,

but it must be:
- deterministic,
- inspectable,
- backward-compatible,
- and validated.

### Required behavior

1. Existing templates without templating metadata continue to work unchanged.
2. Existing pi-style variable templates continue to render unchanged.
3. Nunjucks templates are rendered only when explicitly opted in.
4. Rendering must be sandboxed / restricted:
   - no arbitrary code execution
   - no filesystem access
   - no hidden implicit globals
5. Retrieval and execution behavior must remain separate:
   - `vault_query(..., include_content:false)` is discovery
   - `vault_retrieve(...)` / execution paths may render when requested or required
6. If partials/includes are not ready, do **not** fake them.
   - phase 1 should support inline Nunjucks rendering only
   - partial/macro DRY support can be a deliberate follow-up slice

### Good minimal scope for phase 1

- choose `nunjucks` as the render engine
- add explicit render-engine detection
- add a minimal governed render context, e.g.:
  - `args`
  - `arguments`
  - maybe `current_company`
  - maybe named structured input for future session/workflow use
- add a render path in the client/tooling layer
- preserve current pi-style vars
- add tests for:
  - plain template unchanged
  - pi-vars template unchanged
  - opt-in Nunjucks template renders correctly
  - malformed Nunjucks fails clearly

## Suggested commands

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
npm run docs:list
rg -n "nunjucks|render_engine|template vars|\$ARGUMENTS|\$@|\$[0-9]+" src tests README.md .
```

Prompt Vault boundary reads/checks:

```bash
cd ~/ai-society/core/prompt-vault
./verify.sh
rg -n "\$ARGUMENTS|\$@|\$[0-9]+|template vars|schema.sql|variables JSON" scripts schema docs tests
```

Pi package activation after changes:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
# then inside pi:
/reload
```

## Success condition for next session

By the end of the next session:
- `pi-vault-client` has a clear, explicit, backward-compatible render-engine contract,
- Nunjucks support exists as an opt-in rendering path,
- existing pi-style variable templates still work,
- package docs explain when to use plain templates vs pi-vars vs Nunjucks,
- and live behavior is verified with a real installed package + `/reload` + tool/command call.
