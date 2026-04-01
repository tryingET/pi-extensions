---
summary: "Completed AK task #666 by rewiring pi-society-orchestrator evidence/runtime AK calls to consume the new AK-native guarded repo bootstrap path instead of keeping package-local repo-registration assumptions."
read_when:
  - "You are resuming after FCOS-M41 task #666 in pi-extensions."
  - "You need the exact consumer-side changes made in pi-society-orchestrator for guarded repo bootstrap."
---

# 2026-04-01 — FCOS-M41 guarded bootstrap consumer rewire

## What I did
- Claimed AK task `#666`.
- Rewired `packages/pi-society-orchestrator` so repo-aware AK calls consume the AK-native guarded bootstrap path instead of relying on exact-path repo-row checks.
- Extended the shared AK runtime helper to:
  - pass explicit `cwd` through spawned `ak` commands
  - parse structured `ak repo bootstrap -F json` reports
- Updated evidence writing logic so it now:
  - checks for a registered repo ancestor, not only an exact cwd match
  - calls `ak repo bootstrap --path <cwd>` when no registered ancestor exists
  - uses the canonical `ak` evidence path after `registered` / `already_registered`
  - retains bounded direct-SQL fallback for explicit-only, excluded, or non-timeout AK-unavailable cases
  - fails closed when guarded bootstrap itself aborts or times out
  - caches non-mutating excluded/explicit-only bootstrap results for the same cwd to avoid repeated bootstrap churn
- Passed explicit cwd through loop/runtime AK calls and `/evidence` preview calls so package and nested-monorepo paths stay truthful.
- Updated the package README to describe the new AK-owned bootstrap consumption path.
- Added focused regression coverage for:
  - AK command cwd propagation
  - registered-ancestor detection from nested package paths
  - successful guarded bootstrap before evidence writes
  - excluded bootstrap -> SQL direct fallback
  - excluded bootstrap cache behavior
  - guarded bootstrap timeout fail-closed behavior
  - evidence preview cwd forwarding

## Validation
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && node --test tests/runtime-shared-paths.test.mjs tests/society-runtime.test.mjs`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`
- `npm run quality:pre-commit`
- `npm run quality:pre-push`
- `npm run quality:ci`
- `npm run check`

## Result
- `pi-society-orchestrator` now consumes the AK-owned guarded repo bootstrap surface instead of preserving package-local repo-registration assumptions.
- Nested monorepo package paths can use the canonical AK evidence path when an ancestor repo is already registered.
- Missing safe repo registrations can self-heal through AK, while excluded/explicit-only paths remain non-mutating and bounded.
