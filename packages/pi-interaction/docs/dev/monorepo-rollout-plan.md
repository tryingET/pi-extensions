---
summary: "Phased rollout plan for migrating extensions to a tpl-monorepo-based workspace and introducing an L3 extension template."
read_when:
  - "Planning monorepo migration across current/future pi extensions."
  - "Defining how pi-extensions-template_copier becomes an L3 template in ai-society."
system4d:
  container: "Strategic execution plan for architecture + repository topology migration."
  compass: "Preserve current package stability while enabling multi-extension scale."
  engine: "Decide -> bootstrap -> template-ize -> migrate pilots -> scale safely."
  fog: "Main risk is over-coupling rename, packaging, and monorepo migration in one big-bang step."
---

# Monorepo + L3 template rollout plan

## Target state

Create a monorepo under:

- `~/ai-society/softwareco/owned/`

based on `tpl-monorepo`, containing all current/future pi extensions.

In parallel, adapt:

- `~/programming/pi-extensions/pi-extensions-template_copier/`

into an **L3 template** for extension package creation inside ai-society.

## Repository topology contract (proposed)

Use a top-level monorepo named `pi-extensions` under:

- `~/ai-society/softwareco/owned/pi-extensions`

with extension packages as standalone workspaces, plus a **logical interaction sub-monorepo group**:

```text
pi-extensions/
  packages/
    <extension-a>/
    <extension-b>/
    ...
    pi-interaction/
      pi-editor-registry/
      pi-interaction-kit/
      pi-trigger-adapter/
      pi-interaction/            # umbrella/facade package
```

Note: this keeps a **single git root + workspace toolchain** (recommended), while still modeling
`pi-interaction` as its own grouped monorepo namespace. Avoid separate nested git roots/lockfiles
unless there is a compelling tooling requirement later.

## Umbrella package pattern (must not be lost)

The umbrella package (working example: `@tryinget/pi-interaction`) should:

1. Re-export core subpackages through a stable import surface.
2. Build a default runtime that wires subpackages together.
3. Provide the pi extension entrypoint for easy install/use.
4. Keep a stable first-class API surface under `@tryinget/pi-interaction` from first publish.

### Subpackage responsibilities

- `@tryinget/pi-editor-registry`
  - editor ownership/arbitration
  - lifecycle hooks
  - conflict diagnostics
- `@tryinget/pi-interaction-kit`
  - shared UI primitives (`select/input/confirm/custom`)
  - non-UI fallback contracts
- `@tryinget/pi-trigger-adapter`
  - typed trigger entry
  - matching + debounce/priority policy
  - picker registration helpers

### Umbrella API sketch

```ts
// @tryinget/pi-interaction
export { createEditorRegistry } from "@tryinget/pi-editor-registry";
export { createInteractionKit } from "@tryinget/pi-interaction-kit";
export { registerPickerInteraction, createTriggerBroker } from "@tryinget/pi-trigger-adapter";

export { createInteractionRuntime, getInteractionRuntime } from "./runtime.js";
export default from "./extensions/interaction.js";
```

### Runtime shape sketch

```ts
type InteractionRuntime = {
  registry: EditorRegistry;
  kit: InteractionKit;
  triggers: TriggerBroker;
  mount(pi: ExtensionAPI): void;
  diagnostics(): InteractionDiagnostics;
};
```

### Scope beyond typed trigger entry

The runtime should additionally own:

- editor ownership arbitration
- interaction routing + priority/debounce policy
- shared UI contract (UI and non-UI parity)
- cancellation/timeout semantics
- telemetry + diagnostics surface
- extension conflict visibility (for example `/interaction-diag`)

## Non-goals (for phase 1)

- No immediate hard cutover of all extension publishing in one step.
- No package-name churn after first npm publish (rename is finalized pre-publish).
- No rewriting stable extension runtime behavior while infra migration is underway.

## Workstreams

1. **Naming + architecture scope**
2. **Monorepo bootstrap (tpl-monorepo)**
3. **L3 template adaptation**
4. **Pilot migrations**
5. **Release/governance hardening**

---

## Phase 0 — Decisions and contracts

### Deliverables

- Final umbrella package name decision: `@tryinget/pi-interaction`
  (recorded in [Interaction-runtime naming ADR](interaction-runtime-naming-adr.md)).
- Scope contract beyond typed trigger entry:
  - editor ownership/registry
  - interaction primitives (select/input/confirm/custom)
  - trigger adapter layer
  - diagnostics/telemetry surface
- Naming/publish policy:
  - pre-publish rename to `@tryinget/pi-interaction` (no prior npm release under old name)
  - optional, time-boxed alias only if local migration requires temporary fallback

### Exit criteria

- ADR-style doc written and accepted.
- Explicit migration policy for imports and package ownership approved.

---

## Phase 1 — Bootstrap monorepo in `~/ai-society/softwareco/owned/`

### Deliverables

- New monorepo scaffolded from `tpl-monorepo`.
- Workspace package manager + task runner conventions established.
- Baseline CI/release workflows functional for at least one package.
- Repo-level docs for contribution, release, and package lifecycle.

### Tasks

- Instantiate monorepo from template.
- Configure workspace scripts for lint/typecheck/test/release checks.
- Validate release-please + trusted publishing in monorepo mode (component-aware).
- Add extension package directory structure standard.

### Progress snapshot (2026-03-05)

- Bootstrapped `~/ai-society/softwareco/owned/pi-extensions` using:
  - `~/ai-society/softwareco/scripts/new-repo-from-copier.sh tpl-monorepo ./owned/pi-extensions ...`
- Initialized repo git root and committed baseline scaffold.
- Validation in new monorepo root:
  - `./scripts/ci/smoke.sh` ✅
  - `./scripts/ci/full.sh` ✅
- Gap observed: `enable_release_pack=true` does not currently materialize release-please/publish assets in `tpl-monorepo` output. Track this under Phase 2/5 template hardening.

### Exit criteria

- Fresh monorepo passes CI from clean clone.
- One sample package can run full quality + release-check pipeline.

---

## Phase 2 — Adapt `pi-extensions-template_copier` to L3 template

### Deliverables

- L3 template outputs monorepo-compatible extension packages.
- Template supports component-scoped release metadata and workspace scripts.
- Template docs include update/recopy policy and compatibility guarantees.

### Tasks

1. Start with a template-preflight branch in `pi-extensions-template_copier`.
   - Run baseline checks before changing template behavior:
     - `bash ./scripts/template-guardrails.sh`
     - `bash ./scripts/smoke-test-template.sh`
     - `bash ./scripts/generated-contract-test.sh`
     - `bash ./scripts/idempotency-test-template.sh`

2. Apply the **scaffold-first** transition method from tpl-template-repo operator docs.
   - Reference set:
     - `~/ai-society/core/tpl-template-repo/docs/dev/README.md`
     - `~/ai-society/core/tpl-template-repo/docs/l2-transition-playbook.md`
     - `~/ai-society/core/tpl-template-repo/docs/supply-chain-policy.md`
   - Render clean baseline(s) into `/tmp/*` and compare with candidate output using `git diff --no-index`.

3. Keep wrapper/pinned-Copier contract intact (no ad-hoc Copier calls).
   - Preserve deterministic execution order:
     - `uvx --from "copier==<version>"`
     - `uv tool run --from "copier==<version>"`
     - bare `copier` fallback only when `uvx/uv` unavailable (warning required)

4. Add monorepo-aware L3 template inputs and outputs.
   - Required inputs: workspace-relative package path, release component key, package scope/name.
   - Output contract: package-only scaffold (no nested `.git` root), workspace-compatible scripts, release metadata compatible with component mode.
   - Keep generated `.copier-answers.yml` committed in produced package folders.

5. Follow control-plane merge policy during adaptation.
   - Merge intentionally (do not blindly overwrite) for high-context files:
     - `README.md`
     - `AGENTS.md`
     - `NEXT_SESSION_PROMPT.md` / handoff prompt equivalents

6. Align profile defaults with governance intent.
   - Use tpl-template profile policy as baseline (`internal-governed` default for release-enabled internal repos unless explicitly public).
   - Keep community/vouch gates opt-in unless trust boundary requires them.

7. Validate behavior (not only static file presence).
   - Template checks must execute generated behavior, not only grep for strings.
   - Generate at least one throwaway monorepo package and run workspace quality + release checks end-to-end.

8. Keep update/recopy policy explicit for downstream adopters.
   - Clean destination before update.
   - Prefer `copier update --trust --defaults` when supported.
   - Fallback to `copier recopy --trust --defaults` when update is unavailable/conflicted.

### Progress snapshot (2026-03-05)

- Adapted `pi-extensions-template_copier` with dual scaffold modes:
  - `standalone-repo` (existing behavior retained)
  - `monorepo-package` (new package-only mode)
- Added monorepo-aware template inputs:
  - `workspace_relative_path`
  - `release_component_key`
  - `release_config_mode`
  - `monorepo_repo_name`
- Added package-level release metadata contract in generated `package.json` (`x-pi-template`).
- Added monorepo-package contract spec + validation path:
  - `contract/generated-monorepo-package.contract.json`
- Updated wrapper CLIs (`new-pi-extension-repo.mjs` and shell wrapper) with monorepo mode/options.
- Validation evidence in template source repo:
  - `bash ./scripts/template-guardrails.sh` ✅
  - `bash ./scripts/smoke-test-template.sh` ✅
  - `SCAFFOLD_MODE=monorepo-package bash ./scripts/smoke-test-template.sh` ✅
  - `bash ./scripts/generated-contract-test.sh` ✅
  - `SCAFFOLD_MODE=monorepo-package bash ./scripts/generated-contract-test.sh` ✅
  - `bash ./scripts/idempotency-test-template.sh` ✅
  - `SCAFFOLD_MODE=monorepo-package bash ./scripts/idempotency-test-template.sh` ✅

### Exit criteria

- L3 template is reproducible and documented with explicit wrapper-driven generation/update instructions.
- Generated package passes workspace quality + release checks without manual patching.
- Scaffold-first dry-run migration + contract checks prove no hidden control-plane drift.

---

## Phase 3 — Pilot migration of existing extensions

### Selected pilot set

1. `pi-interaction`
2. `prompt-template-accelerator`

### Migration strategy

#### Import strategy (pilot-safe)

- Use `@tryinget/pi-interaction` as the **primary import surface** during pilot migration.
- Introduce interaction-runtime family subpackage imports incrementally as split packages land.
- Enforce package-surface imports only (no `src/*` internal path imports) across legacy and monorepo packages.

| Consumer state | Allowed import now | Planned target import |
|---|---|---|
| Existing/new trigger consumers | `@tryinget/pi-interaction` | `@tryinget/pi-interaction` + subpackages as needed |
| Internal monorepo package links | package entrypoints only | package entrypoints only |

#### Release strategy (pilot-safe)

- Use independent package cadence with release component key `pi-interaction`.
- Keep standalone repo releasable until monorepo release automation is fully component-wired.
- Treat monorepo package checks as required promotion gates before any publish cutover:
  - `npm run check`
  - `npm run release:check:quick`
  - `npm audit`

### Progress snapshot (2026-03-06)

- Converted `packages/pi-interaction` from single-package pilot into split package group:
  - `packages/pi-interaction/pi-editor-registry`
  - `packages/pi-interaction/pi-interaction-kit`
  - `packages/pi-interaction/pi-trigger-adapter`
  - `packages/pi-interaction/pi-interaction` (umbrella)
- Re-homed runtime code by responsibility while preserving command/fallback behavior.
- Updated umbrella package to compose split packages via package-surface imports only.
- Added umbrella runtime composition helpers (`createInteractionRuntime`, `getInteractionRuntime`).
- Migrated Pilot 2 package into monorepo at `packages/prompt-template-accelerator`.
- Updated PTX live-trigger integration to consume pi-interaction trigger surfaces (`@tryinget/pi-trigger-adapter`, fallback `@tryinget/pi-interaction`).
- Validation evidence (split packages + Pilot 2):
  - `npm run fix` ✅
  - `npm run check` ✅
  - `npm run release:check:quick` ✅
  - `npm audit` ✅
- Validation evidence (monorepo root):
  - `./scripts/ci/smoke.sh` ✅
  - `./scripts/ci/full.sh` ✅

### Validation matrix

- package-local tests pass
- cross-extension non-UI smoke pass
- live UI coexistence checks pass
- release-check and release-please path pass in monorepo

### Exit criteria

- Pilot packages released from monorepo without regression.
- Downstream consumers use `@tryinget/pi-interaction` without regression.

---

## Phase 4 — Scale to all extensions + future default

### Deliverables

- Migration playbook applied to remaining extension repos.
- New extensions created only via L3 template in monorepo.
- Legacy standalone repos marked archived/maintenance with clear pointers.

### Exit criteria

- Monorepo is single source of truth for active extensions.
- Creation flow for new extension packages is fully template-driven.

---

## Release model in monorepo

### Independent package releases

Use release-please in component mode (packages map + separate PRs).
Each package gets its own PR/tag/version.

### Independent pi-interaction group releases

Two good modes:

1. Independent versions (recommended first)
   - pi-editor-registry, pi-interaction-kit, pi-trigger-adapter, umbrella each version independently.
   - umbrella depends on internals and bumps when needed.
2. Lockstep group versions (later if needed)
   - all pi-interaction/* packages share one version cadence.
   - useful if you want tighter compatibility guarantees.

## Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Big-bang migration causes release downtime | High | Phased pilots + dual-path release readiness |
| Late package rename breaks imports | Medium | Pre-publish rename to `@tryinget/pi-interaction` and immediate doc/import alignment |
| Template drift creates inconsistent packages | Medium | L3 golden-test generation in CI |
| Cross-extension runtime conflicts in monorepo | High | Dedicated coexistence integration suite |
| Governance complexity in first ai-society L3 template | Medium | Minimal first scope + explicit ownership |

## Rollback strategy

- Keep current standalone repos releasable until pilot success criteria are met.
- If monorepo release path fails, publish from legacy repos while fixes land.
- If a temporary local alias is introduced, keep it time-boxed and remove only after downstream migration is confirmed.

## Execution checklist (operator-ready)

- [x] Phase 0 naming/scope decision recorded
- [x] Monorepo instantiated in `~/ai-society/softwareco/owned/`
- [x] L3 template adaptation complete + validated
- [x] Pilot migration package 1 scaffolded + locally validated
- [x] Pilot migration package 2 complete
- [x] Cross-extension integration matrix green
- [ ] Release from monorepo confirmed
- [ ] Legacy repo transition notices published
