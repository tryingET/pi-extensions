---
summary: "pi-vault-client is stable after schema-v8 alignment; only revisit for regressions or for bounded live coexistence evidence, and route broader semantic-organism work to Prompt Vault + agent-kernel instead of this package."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Deciding whether the next slice belongs here, in Prompt Vault, or in agent-kernel."
system4d:
  container: "Canonical handoff for the post-hardening, schema-v8-aligned state of pi-vault-client."
  compass: "Do not reopen solved runtime ambiguity; only touch this package for real regressions, explicit upstream contract changes, or bounded live coexistence evidence."
  engine: "Reacquire current truth -> choose the correct repo boundary -> proceed only on the smallest truthful next slice."
  fog: "Main risks are package churn, confusing PTX with /vault, and trying to do semantic-organism architecture work inside the wrong repo."
---

# Next session prompt for `pi-vault-client`

## One-line handoff

`pi-vault-client` is operationally done enough for now: render preparation is explicit, tool/query handling is per-call, execution provenance is exact, feedback is execution-bound with Prompt Vault schema-level uniqueness in v8, and the next truthful work is either **bounded live coexistence evidence** with `pi-interaction` + PTX or a **strategic pivot** into Prompt Vault + agent-kernel semantic-organism architecture work outside this package.

## Current package truth

### Stable runtime boundary
- generic `/vault` and live `/vault:` remain intentionally strict
- no generic legacy pi-vars auto-detect was restored
- exact-match lookup, picker flows, and grounding all use explicit context handoff
- shared render preparation is the canonical execution path
- schema compatibility targets Prompt Vault `v8`

### Stable tool boundary
- `vault_query` uses explicit tool-call execution context
- `vault_retrieve` uses explicit tool-call execution context
- `vault_insert` and `vault_update` require explicit mutation context and fail closed on ambiguity
- `vault_executions` is the required discovery step before `vault_rate`
- `vault_rate({ execution_id, ... })` is the only supported feedback path

### Verified package baseline
- `npm run check` passes
- test suite baseline at handoff:
  - `78` passing
  - `0` failing

## Verified cross-package truth

A later verification pass established that the previously suspected open `pi-interaction` trigger-isolation implementation work appears to have already landed in an earlier session.

Evidence already verified:
- `packages/pi-interaction/docs/dev/status.md` marks the runtime migration as completed
- `pi-trigger-adapter` tests already cover debounce/session isolation behavior
- `pi-editor-registry` tests already cover cwd + `sessionKey` propagation
- PTX mixed-extension non-UI smoke already passes

Checks already re-run successfully:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run check
npm run release:check:quick

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
```

Interpretation:
- do **not** reopen trigger-isolation implementation blindly
- the remaining operational gap on this line is durable **live interactive coexistence evidence**, not obvious missing package-local code

## Branch A — if the next slice stays package-adjacent

### Bounded next step
Capture durable live coexistence evidence with these three packages loaded together:
- `pi-interaction`
- `pi-prompt-template-accelerator`
- `pi-vault-client`

### Boundary that must be made explicit
- `$$ /...` = installed/exported PTX prompt commands only
- `/vault` = full visible Prompt Vault set
- a much smaller PTX count than vault count can therefore be correct when only the `export_to_pi` subset is installed

### Nunjucks/rendering note
- `/vault` is the place where full Prompt Vault execution-time rendering is verified
- PTX must **not** be assumed to mirror `/vault` semantics for non-exported vault templates
- if an exported Prompt Vault template is reachable through PTX, validate and document that behavior explicitly rather than inferring parity

### Live pass kickoff
```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
# then inside pi:
# /reload
# /triggers
# $$ /
# /vault
# /vault:
```

### Success condition for Branch A
A bounded session is successful if it cleanly does one of these:
1. captures durable live coexistence evidence
2. records explicit evidence for the PTX vs `/vault` picker-surface boundary
3. reveals a real regression and fixes it without reopening solved ambiguity

## Branch B — if the next slice is the broader semantic vision (recommended pivot)

### Architectural direction recovered from session history
The stronger direction is **not** to keep growing Prompt Vault as a mere prompt tool.
The target shape is:
- **Prompt Vault** = versioned prompt-body / authoring substrate
- **agent-kernel / `society.v2.db`** = canonical operational substrate
- **bridge layer** = capability semantics, invocation contracts, artifacts, commitments, and evidence

That means the system should gradually move from:
- “which template should I retrieve?”

toward:
- “what state transition is needed, what evidence is missing, what capability can satisfy it, and what commitments/artifacts will result?”

### Do not do this broader work here
If that is the next real slice:
- do **not** try to implement the semantic-organism architecture primarily inside `pi-vault-client`
- do **not** collapse Prompt Vault into agent-kernel
- do **not** use more `pi-vault-client` runtime churn as a proxy for strategic progress

### Correct repo routing for the semantic-organism track
Use:
- `~/ai-society/core/prompt-vault`
- `~/ai-society/softwareco/owned/agent-kernel`

Treat `pi-vault-client` as a consumer/projection surface, not the main design arena.

### Recommended next artifact on that track
Create a **1-page architecture note** first, before any bridge-first schema proposal.

The architecture note should lock in:
1. what Prompt Vault owns
2. what agent-kernel owns
3. what the bridge layer owns
4. why prompt text is not the whole organism
5. why capability/affordance/intention/commitment/evidence belong above raw prompt rows

Only after that should a bridge-first schema proposal define concrete tables/fields/APIs.

### Read first for the semantic-organism track
1. `~/ai-society/softwareco/owned/agent-kernel/docs/project/prompt-vault-ak-capability-bridge.md`
2. `~/ai-society/softwareco/owned/agent-kernel/docs/project/ai-society-convergence-architecture.md`
3. `~/ai-society/core/prompt-vault/next_session_prompt.md`
4. `~/ai-society/core/prompt-vault/docs/project/tactical_goals.md`
5. `~/ai-society/core/prompt-vault/docs/dev/controlled-vocabulary-layer-plan.md`
6. `~/ai-society/softwareco/owned/agent-kernel/next_session_prompt.md`
7. `~/ai-society/softwareco/owned/agent-kernel/README.md`

### Success condition for Branch B
A strategic session is successful if it cleanly does one of these:
1. writes the 1-page architecture note
2. defines the minimal bridge concepts (`capability`, `capability_version`, `prompt_source_ref`, `invocation_contract`, `artifact`, `commitment`, `evidence`)
3. routes future work clearly so Prompt Vault authoring truth and agent-kernel operational truth are not blurred

## Reacquisition protocol

Read these in order before making any changes:
1. `AGENTS.md`
2. `README.md`
3. `NEXT_SESSION_PROMPT.md`
4. if doing Branch A:
   - `../pi-interaction/NEXT_SESSION_PROMPT.md`
   - `../pi-prompt-template-accelerator/NEXT_SESSION_PROMPT.md`
5. if doing Branch B:
   - `~/ai-society/core/prompt-vault/next_session_prompt.md`
   - `~/ai-society/softwareco/owned/agent-kernel/next_session_prompt.md`
6. then only the package/runtime files relevant to the chosen branch

## Non-goals and hard noes
- do **not** restore generic legacy pi-vars auto-detect on `/vault` or live `/vault:`
- do **not** reintroduce module-global query-error state as the primary error channel
- do **not** weaken explicit mutation-context requirements
- do **not** turn Prompt Vault data migration pressure into package-runtime ambiguity
- do **not** broaden feedback semantics casually; keep exact execution binding unless Prompt Vault changes it explicitly
- do **not** redo already-landed trigger-isolation implementation unless live evidence shows an actual regression
- do **not** describe `$$ /...` as if it were a full Prompt Vault browser
- do **not** try to make `pi-vault-client` itself the semantic-organism substrate

## Files most relevant to the current package truth

### Core runtime
- `src/templateRenderer.js`
- `src/vaultDb.ts`
- `src/vaultTools.ts`
- `src/vaultCommands.ts`
- `src/vaultPicker.ts`
- `src/vaultGrounding.ts`
- `src/vaultTypes.ts`

### High-value tests
- `tests/template-renderer.test.mjs`
- `tests/vault-grounding.test.mjs`
- `tests/vault-dolt-integration.test.mjs`
- `tests/vault-update.test.mjs`
- `tests/vault-query-regression.test.mjs`

### Operator docs
- `README.md`
- `docs/dev/live-render-engine-validation.md`
- `docs/dev/legacy-render-engine-rollout.md`

## Final routing rule

If the next session is about:
- **runtime/package correctness or live coexistence evidence** → this repo may still be relevant
- **Prompt Vault as more than a prompt tool / semantic-organism architecture / AK bridge design** → leave this repo and work in Prompt Vault + agent-kernel
