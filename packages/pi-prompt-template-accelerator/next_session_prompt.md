---
summary: "PTX package/runtime hardening and docs cleanup are now committed and validated; package truth lives in README.md + this handoff, while the true remaining PTX work is stable live-runtime verification and, if warranted, a guarded hybrid LLM-assisted inference design."
read_when:
  - "Starting the next pi-prompt-template-accelerator work session in monorepo."
system4d:
  container: "Session handoff artifact."
  compass: "Resume from committed PTX package truth, not from earlier mixed-state debugging or already-finished docs cleanup."
  engine: "Verify live runtime -> decide objective-source contract -> only then evolve inference architecture."
  fog: "Main risk is redoing committed cleanup work or confusing adjacent monorepo churn with unfinished PTX package work."
---

# Next session prompt — pi-prompt-template-accelerator

## Completed ✅

### PTX runtime/picker hardening is landed and committed
- PTX context inference treats `sessionManager` / `getBranch()` as optional enrichment instead of a required dependency.
- PTX live picker preserves the **exact selected prompt metadata** (`name` / `path` / description) instead of re-resolving only by slash-command name after selection.
- PTX picker candidates now:
  - disambiguate duplicate prompt names with origin detail
  - include only prompt commands with a usable template path
- PTX keeps picker semantics stricter:
  - `$$ /...` and `/ptx-select` surface only prompt commands with a usable template path
  - direct `$$ /name` can still fall back to a raw slash command when richer transform building fails
- `/ptx-debug-commands [query]` inspects visible prompt commands, paths, prefillability, and inferred arg contracts.
- Regression coverage includes a broker-driven live-picker case with duplicate prompt names:
  - `tests/non-ui-mixed-extension-smoke.test.ts`

### PTX docs/task-management cleanup is landed and committed
- `docs/dev/status.md` is gone.
- Package truth now lives in:
  - `README.md` for durable repo/operator guidance
  - `next_session_prompt.md` for active fresh-context handoff
- Package docs/scripts were updated to stop referring to a package-local status snapshot:
  - `README.md`
  - `docs/dev/EXTENSION_SOP.md`
  - `docs/dev/CONTRIBUTING.md`
  - `docs/dev/plans/*.md`
  - `scripts/validate-structure.sh`
  - `CHANGELOG.md`
- Agent Kernel (`ak`) is the documented canonical task/work-item authority when task tracking is needed.
- This package does **not** maintain a `governance/work-items.json` projection.
- PTX release automation now belongs to the root-owned monorepo component release control plane.

### Recent package validation passed on the committed PTX state
```bash
npm run docs:list
npm run check
npm run test:smoke:non-ui
npm run release:check:quick
```

## Current package truth

### What PTX does today
- PTX **does not use the active model to generate argument suggestions** at prefill time.
- PTX prefill is currently **deterministic** and code-driven:
  1. parse selected prompt template
  2. parse placeholders and line hints
  3. collect local/session/git context
  4. map inferred values into slots
  5. stage the resulting slash command in the editor
- For templates like `/implementation-planning`, PTX currently treats the main slot as a **rough objective/request** slot.
- If PTX cannot infer a trustworthy objective from:
  - explicit provided args, or
  - the latest meaningful **user** message,
  it currently falls back to:
  - `"<MUST_REPLACE_PRIMARY_OBJECTIVE>"`

### What PTX does not do yet
- PTX does **not** currently use:
  - the active LLM/model
  - structured semantic extraction from assistant messages
  - editor-text-first objective inference
  - per-template inference policies
  - confidence/provenance scoring for inferred slots

### Architectural conclusion reached
- The current ceiling is **deterministic-only semantic inference**.
- The strongest proposed direction is a **hybrid architecture**:
  - deterministic template parsing + slot planning
  - bounded context harvesting
  - LLM only for unresolved semantic slot filling
  - deterministic provenance, confidence thresholds, and fallback behavior
- This remains a **proposal**, not implemented package behavior.

## The true remaining PTX work

Only two meaningful PTX areas are left:

1. **Live runtime verification**
   - confirm PTX behavior in a stable, single-agent Pi runtime after reinstall + `/reload`
   - especially verify `/implementation-planning` with and without explicit objective args

2. **Inference-architecture decision**
   - decide whether deterministic improvements are enough, or whether to implement guarded hybrid LLM-assisted slot inference

Do **not** spend the next PTX session redoing docs cleanup unless new evidence forces it.

## Priority objective (next session)

First restore trust in runtime evidence by validating PTX in a stable single-agent Pi session. After that, decide and document the objective-source precedence contract. Only then scope any hybrid LLM-assisted inference work.

### Recommended checks
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
npm run docs:list
npm run test:smoke:non-ui
npm run check
npm run release:check:quick
```

If task tracking is needed for the next slice:
```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task create \
  --repo /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator \
  "PTX: verify live runtime and decide hybrid inference direction"
./scripts/ak-v2.sh task ready
```

Then install/reload in Pi and verify for real:
```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
# inside pi:
# /reload
# /ptx-debug-commands implementation-planning
# $$ /implementation-planning "verify PTX full prefill"
# $$ /implementation-planning
# $$ /
# select implementation-planning
# /ptx-select implementation-planning
```

## Deferred with contract

| Finding | Rationale | Owner | Trigger | Deadline | Blast Radius |
|---------|-----------|-------|---------|----------|--------------|
| Live installed proof that `$$ /implementation-planning` behaves as expected in a fresh, stable Pi runtime | Package tests are green, but editor/runtime parity is still the main remaining truth gap | Next PTX session owner / current operator | Next single-agent interactive Pi session after reinstall + `/reload` | Before changing inference architecture | If skipped, LLM architecture work may target the wrong problem instead of a runtime integration gap |
| Formalize objective source precedence (`explicit -> editor -> user -> assistant -> placeholder`) | The current objective-source rule is still implicit in code and too weak for semantic PTX use cases | Next PTX session owner | Once live runtime behavior is re-verified | Before implementing hybrid LLM inference | If skipped, future model-assisted inference will feel arbitrary and hard to debug |
| Design a structured hybrid LLM slot-fill contract with confidence/provenance | Needed to improve semantic inference safely without giving up determinism | Next PTX session owner | After runtime proof and precedence decision | Next architecture slice | If skipped, PTX remains reliable but semantically shallow |
| Add a shadow-mode evaluation corpus for deterministic vs hybrid inference | Needed to compare “sounds smarter” vs “is actually better” | Next PTX session owner | After initial hybrid design exists | Before enabling by default | If skipped, PTX inference may drift by anecdote |
| Keep adjacent `/vault:atomic-` issue package-scoped to `pi-vault-client` | That issue is real but belongs to another package and should not contaminate PTX causality | Current operator / vault owner | Any time `/vault:` failures reappear | Immediate | If skipped, PTX sessions will keep mixing package boundaries and runtime evidence |

## Next truthful question to answer

After verifying a stable live runtime, should PTX remain deterministic-only for prefill, or should it add **hybrid LLM-assisted semantic slot inference** behind explicit provenance/confidence guardrails?

### Hypotheses to test
1. the remaining PTX frustration is mostly about weak deterministic objective extraction, not picker/runtime correctness
2. explicit arg + editor text + recent user message precedence would solve most pain even before adding an LLM
3. assistant-message use is only safe as a bounded input to an LLM extractor, not as a raw direct substitution
4. a hybrid slot-fill contract would improve templates like `/implementation-planning` materially without making PTX opaque or brittle

## Keep these boundaries explicit

- `$$ /...` = installed/exported prompt-command picker only
- `/vault` = full visible Prompt Vault browser/retrieval surface
- PTX currently stages commands via **code-driven deterministic inference**, not the active LLM
- any future model-assisted inference must be described as a new architecture slice, not as current behavior
- do not let adjacent `pi-vault-client` work pull PTX edits off-package
- do not recreate a package-local markdown status database; use `README.md` + this handoff for docs and `ak` for canonical task/work-item tracking

## Files most relevant now
- `extensions/ptx.ts`
- `src/inferContextArgs.js`
- `src/mapArgsByUsage.js`
- `src/planPromptTemplateTransform.js`
- `src/ptxCandidateAdapter.js`
- `tests/non-ui-mixed-extension-smoke.test.ts`
- `README.md`
- `next_session_prompt.md`
- `../agent-kernel/README.md`

## Success condition for the next slice
A truthful next session is successful if it cleanly does all of the following:
1. verifies PTX in a stable single-agent live Pi runtime before making more architectural claims
2. confirms the real current behavior of `/implementation-planning` with and without an explicit objective arg
3. decides and documents an explicit objective-source precedence contract
4. either
   - confirms deterministic improvements are enough for the next slice, or
   - scopes a guarded hybrid LLM-assisted inference implementation
5. keeps package boundaries clear and avoids redoing already-completed docs cleanup unless new evidence requires it
