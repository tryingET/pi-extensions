---
summary: "Session handoff for live verification and follow-up governance of implemented Nunjucks support in pi-vault-client."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Canonical package session handoff artifact for vault-client templating work."
  compass: "Verify the implemented render-engine contract end to end without blurring package work, root policy work, and template work."
  engine: "Re-read package + root/template handoffs -> verify live Nunjucks behavior -> record evidence -> route any policy/template follow-up to the correct repo."
  fog: "Main risks are claiming live verification too early, confusing raw retrieval with execution-time rendering, or pushing monorepo/template policy decisions into package-local docs."
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
5. `~/ai-society/softwareco/owned/pi-extensions/NEXT_SESSION_PROMPT.md`
6. `~/ai-society/softwareco/owned/pi-extensions-template/NEXT_SESSION_PROMPT.md`
7. `~/ai-society/core/prompt-vault/docs/dev/vault-client-relocation-interface.md`
8. `~/ai-society/core/prompt-vault/docs/dev/vault-client-company-visibility-boundary.md`
9. `~/ai-society/core/prompt-vault/schema/schema.sql`
10. `~/ai-society/core/prompt-vault/scripts/pv-template-vars`
11. `~/ai-society/core/prompt-vault/scripts/pv-exec`

## Current package state

- `pi-vault-client` is aligned to the Prompt Vault schema-v7 boundary.
- phase-1 render-engine support is implemented in the client/tooling layer:
  - `none`
  - `pi-vars`
  - `nunjucks`
- render metadata currently lives in prompt-content frontmatter.
- existing pi-style positional substitution still works:
  - `$1`
  - `$2`
  - `$@`
  - `$ARGUMENTS`
  - `${@:N}`
- tests and docs for the render-engine contract are in place and passing.
- package validation passes.
- Prompt Vault verification passes.
- the missing piece is **live end-to-end verification** with a real installed package + `/reload` + an actual opt-in Nunjucks template call.
- monorepo/template follow-up now exists around `tech-stack-core` review and reduced-form template outputs; that work belongs in the root/template repos, not here.
- session/handoff prompt wording work belongs primarily to:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/NEXT_SESSION_PROMPT.md`
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/prompts/one-line-handoff.md`
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/prompts/one-sentence-handoff.md`

## What not to redo

- do **not** re-implement the phase-1 Nunjucks slice from scratch
- do **not** reintroduce legacy `type`-based Prompt Vault assumptions
- do **not** reintroduce prompt tags or namespaced tags into vault-client query/insert logic
- do **not** treat Dolt as if it natively renders templates
- do **not** claim Nunjucks is fully verified until a live installed package + `/reload` + actual tool/command call proves it
- do **not** conflate `vault_retrieve(...)` raw content with execution-time rendering behavior
- do **not** push root/template `tech-stack-core` policy decisions into package-local docs unless the package contract itself changed

## Recommended next verification slice

Verify the already-implemented Nunjucks path **end to end**.

### Required verification

1. Confirm raw discovery still behaves as discovery:
   - `vault_query(..., include_content:false)` stays non-rendering
2. Confirm raw retrieval still stays raw:
   - `vault_retrieve(..., include_content:true)` returns content/frontmatter without pretending execution already happened
3. Confirm execution-time rendering works for explicit Nunjucks templates:
   - install package into Pi
   - `/reload`
   - invoke a real template through `/vault` or the relevant execution path
4. Confirm legacy pi-vars still behave unchanged in live usage.
5. Record explicit evidence in docs/handoff after live verification.

### Good minimal live test

Use or create a temporary local Prompt Vault template like:

```md
---
render_engine: nunjucks
---
Objective: {{ args[0] }}
Company: {{ current_company }}
Context: {{ context }}
```

Then verify:
- query surface discovers it without rendering
- retrieve surface returns raw content
- execution path renders it inline
- malformed Nunjucks still fails clearly

## Suggested commands

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
npm run docs:list
rg -n "nunjucks|render_engine|template vars|\$ARGUMENTS|\$@|\$[0-9]+|one-line-handoff|one-sentence-handoff" src tests README.md NEXT_SESSION_PROMPT.md .
```

Prompt Vault boundary reads/checks:

```bash
cd ~/ai-society/core/prompt-vault
./verify.sh
rg -n "\$ARGUMENTS|\$@|\$[0-9]+|template vars|schema.sql|variables JSON" scripts schema docs tests
```

Pi package activation after changes / live verification:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
# then inside pi:
/reload
```

## Route correctly if the session shifts

- monorepo/root `tech-stack-core` policy review:
  - `~/ai-society/softwareco/owned/pi-extensions/NEXT_SESSION_PROMPT.md`
- template-repo `tech-stack-core` reduced-form review:
  - `~/ai-society/softwareco/owned/pi-extensions-template/NEXT_SESSION_PROMPT.md`
- session/handoff prompt wording and prompt-template work:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/NEXT_SESSION_PROMPT.md`

## Success condition for next session

By the end of the next session:
- live Nunjucks behavior is verified with a real installed package + `/reload` + tool/command call
- raw retrieval vs execution-time rendering is explicitly evidenced
- existing pi-vars behavior is re-verified in live usage
- package docs/handoff mention the actual verification status accurately
- and any `tech-stack-core` or session-prompt follow-up is routed to the root/template/prompt repos instead of being improvised here
