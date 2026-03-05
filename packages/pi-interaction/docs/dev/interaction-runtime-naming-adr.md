---
summary: "ADR for interaction-runtime naming and pre-publish package rename policy during monorepo migration."
read_when:
  - "Finalizing package naming and migration compatibility strategy."
  - "Planning import transitions to @tryinget/pi-interaction."
system4d:
  container: "Architecture decision record for package scope and naming."
  compass: "Adopt broader interaction-runtime identity with minimal downstream churn."
  engine: "Name decision -> publish policy -> phased migration rules."
  fog: "Risk of avoidable churn if rename happens after first npm publish."
---

# ADR: Interaction-runtime umbrella naming and pre-publish rename policy

- Date: 2026-03-05
- Status: Accepted
- Owners: pi-extensions maintainers

## Context

The trigger-focused implementation has evolved into a broader interaction-runtime surface
(editor registration, interaction primitives, fallback behavior, diagnostics).

Because the package has **not yet been published on npm**, we can adopt the final umbrella
name before first publish and avoid later rename churn across docs, imports, and release flow.

## Decision

1. **Primary publish package name** is `@tryinget/pi-interaction`.
2. First npm release should publish under `@tryinget/pi-interaction`. 
3. No dedicated compatibility npm package is planned unless a concrete downstream requirement emerges.

## Compatibility policy

### Pre-publish policy

- Prefer zero-bridge rollout: ship first public npm release under `@tryinget/pi-interaction`.
- Avoid creating permanent maintenance burden for an unpublished legacy package name.

### Import policy

- New docs/examples default to `@tryinget/pi-interaction` immediately.
- No internal-source-path imports are allowed.
- Local/internal consumers should be updated directly to the new package name.

### Deprecation policy

- Since the old package name was never published, no public npm deprecation window is required.
- Any future alias package requires explicit scope, owner, and sunset date.

## Consequences

### Positive

- Final package identity aligns with actual scope from day one.
- Less downstream churn in monorepo rollout, release automation, and docs.
- Avoids unnecessary dual-surface maintenance.

### Tradeoffs

- Existing local/internal references to old package name must be updated promptly.
- Some migration notes now need to shift from "bridge window" to "pre-publish rename" framing.

## Implementation notes

1. Rename package metadata to `@tryinget/pi-interaction` before first publish.
2. Keep runtime behavior stable (no trigger/selection regression coupled to naming).
3. Update monorepo pilot package path and component metadata to `pi-interaction`.
4. Update roadmap/handoff docs to reflect pre-publish rename policy.

## Validation gates

- `npm run check`
- `npm run release:check:quick`
- `npm audit`
- Monorepo pilot: package-local tests + cross-extension non-UI smoke tests
