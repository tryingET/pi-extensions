---
summary: "Local override notes for the shared tech-stack-core lane used by this package."
read_when:
  - "Aligning implementation decisions with the TypeScript stack baseline."
  - "Reconciling differences between generic TS guidance and pi extension constraints."
system4d:
  container: "Package-local deltas on top of shared lane guidance."
  compass: "Keep extension work aligned with reproducible Node/npm release flow inside the monorepo."
  engine: "Use shared lane -> apply local override -> validate with package and root scripts."
  fog: "External lane guidance may evolve independently of this package."
---

# tech-stack.local (pi extension package)

Primary lane:

- `tech-stack-core show pi-ts --prefer-repo`

Repo-local emphasis:

- Runtime/package manager baseline: Node.js 22 + npm (not Bun-first defaults).
- Typecheck baseline: prefer `tsgo --noEmit`; keep `tsc --noEmit` available as fallback when rollout or recovery requires it.
- Keep package artifacts deterministic via `package.json` `files` allowlist.
- This package now uses the reduced-form local surface: keep this doc for the child-package override note, and keep lane metadata/pinning at the monorepo root instead of shipping `policy/stack-lane.json`.
- Validate with package-local scripts plus monorepo root package-gate wrappers.
- Optional pi-ts companions (add only when the package actually benefits):
  - `fast-check` for parser/rendering/selection invariants.
  - `@cucumber/cucumber` only when executable operator/workflow scenarios materially improve shared understanding.
  - `nunjucks` for reusable text/config/prompt/file templates when plain typed render functions are no longer enough.
