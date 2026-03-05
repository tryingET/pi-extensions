---
summary: "Current development status for pi-interaction."
read_when:
  - "Starting work in this repository."
system4d:
  container: "Status tracker for extension development."
  compass: "Know what's done, what's next, and what's blocked."
  engine: "Update after each significant change."
  fog: "Staleness risk if not maintained."
---

# Status

## Completed ✓

### Core Implementation
- [x] TriggerBroker: central registry with priority, debounce, matching, and diagnostics
- [x] TriggerEditor: CustomEditor integration for keystroke watching and trigger execution
- [x] Extension entrypoint (`extensions/input-triggers.ts`) aligned with stable helper exports
- [x] InteractionHelper modularized into `src/interaction-helper/*` with stable public re-export surface at `src/InteractionHelper.js`

### Interaction Helper Hardening
- [x] TypeBox runtime boundary validation for `registerPickerInteraction` config/candidate contracts
- [x] Unknown config-key rejection and finite-number guardrails
- [x] Inline overlay semantics hardened:
  - fallback mode reported explicitly
  - no-match reason normalized
  - `maxOptions` used as visible-row cap, not search-space cap
- [x] Malformed candidate-id handling hardened with regression coverage
- [x] `loadCandidates` contract shape now enforced at runtime boundary (array or object with `candidates[]`) with regression coverage

### Deferred Contracts (now resolved)
- [x] `vault-client` migration contract closed by enforcing package-surface policy via regression guard test (no internal source-path imports)
- [x] JS `checkJs` strict migration completed for runtime modules under `src/**/*.js`

### Quality & Security
- [x] Strict TypeScript gate enabled for extension TS and runtime JS surfaces (`checkJs: true`)
- [x] Lint + typecheck + tests + pack dry-run passing via `npm run check`
- [x] `fast-xml-parser` override pinned to `5.4.2` (audit remediation)
- [x] `npm audit` clean (0 vulnerabilities)

### Testing
- [x] 39 tests passing across broker and interaction-helper suites
- [x] Boundary-focused tests for config/schema, selection semantics, and disallowed internal import paths

### Documentation
- [x] README and API docs available
- [x] CHANGELOG updated for release tracking
- [x] NEXT_SESSION_PROMPT maintained for handoff continuity

## In Progress

- [ ] Manual live TUI validation of end-to-end `$$ /` flow with `pi-interaction` + `prompt-template-accelerator`

## Blocked

None currently.

## Recently Completed

- [x] Recorded Phase 0 naming/compatibility ADR for interaction-runtime migration (`docs/dev/interaction-runtime-naming-adr.md`)
- [x] Updated monorepo rollout plan with finalized umbrella package name (`@tryinget/pi-interaction`) and migration policy details
- [x] Re-validated baseline gates (`npm run check`, `npm run release:check:quick`, `npm audit`)
- [x] Refined Phase 2 L3-template adaptation tasks using tpl-template-repo operator docs (scaffold-first migration, wrapper/pinned-Copier contract, control-plane merge policy)
- [x] Ran template-preflight checks in `pi-extensions-template_copier` (`template-guardrails`, `smoke-test-template`, `generated-contract-test`, `idempotency-test-template`)
- [x] Bootstrapped monorepo root at `~/ai-society/softwareco/owned/pi-extensions` from `tpl-monorepo`, initialized git, and validated `./scripts/ci/smoke.sh` + `./scripts/ci/full.sh`
- [x] Captured Phase 1 gap: `enable_release_pack=true` currently does not emit release automation assets in `tpl-monorepo` output (queued for template hardening)
- [x] Completed Phase 2 L3 adaptation in `pi-extensions-template_copier` with `monorepo-package` mode, component metadata, and dual-mode smoke/contract/idempotency validation
- [x] Executed Phase 3 pilot package migration scaffold into monorepo (`~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction`) using L3 wrapper `monorepo-package` mode
- [x] Renamed publish target to `@tryinget/pi-interaction` before first npm release to reduce downstream rename churn
- [x] Verified pilot package quality/release/security gates in monorepo package context (`npm run check`, `npm run release:check:quick`, `npm audit`) plus monorepo CI smoke/full scripts
- [x] Prepared release/version bump to `0.2.0` (`package.json`, `.release-please-manifest.json`, changelog release section, release artifact checks)
- [x] Integrated broker-helper usage in downstream `prompt-template-accelerator` (`registerPickerInteraction` bridge + non-UI fallback path retained)
- [x] Validated downstream non-UI mixed-extension flow (`npm run test:smoke:non-ui` in `prompt-template-accelerator`)

## Future Work

### Priority 1: Integration
- [ ] Validate end-to-end `$$ /` interaction in live environment

### Priority 2: Enhancements
- [ ] Real file picker backend for `!! .` (filesystem-backed candidates)
- [ ] Add additional built-in triggers based on usage patterns
- [ ] Add performance benchmarks for trigger matching and overlay filtering

### Priority 3: Upstream
- [ ] Propose `pi.registerInputTrigger()` API to pi core
- [ ] Document cooperative broker pattern for extension authors

## Metrics

| Metric | Value |
|--------|-------|
| Tests | 39 |
| Passing | 39 |
| Test files | 4 |
| Source files (`src/`) | 12 |
| Security advisories (`npm audit`) | 0 |

## Last Updated

2026-03-05
