# 2026-03-22 — Audit root-owned vs package-local tech-stack review surfaces

## What I Did
- Read the monorepo root next-session prompt, latest diary, and canonical root stack-contract docs before changing anything.
- Audited the current package review surfaces under `packages/` to see which package roots still carry `docs/tech-stack.local.md` and/or `policy/stack-lane.json`.
- Added a deterministic root script at `scripts/tech-stack-review-surfaces.mjs` plus the root npm wrapper `npm run tech-stack:review-surfaces`.
- Added `docs/project/tech-stack-review-surfaces.md` to capture the reduced-form target, current audit snapshot, and routing notes for follow-up work that belongs in other repos/packages.
- Updated root docs (`README.md`, `docs/tech-stack.local.md`, `docs/project/root-capabilities.md`) so the centralized policy stance points to the new audit surface instead of implying every package should keep the older full stack-lane surface forever.

## What Surprised Me
- The current monorepo already spans three distinct package states:
  - legacy full surface (`docs/tech-stack.local.md` + `policy/stack-lane.json`)
  - reduced-form surface (`docs/tech-stack.local.md` only)
  - no package-local tech-stack review surface at all
- Running `npm run quality:ci` and `npm run check` concurrently causes package prepack helpers to race on temporary manifest rewrites, so those gates need to stay sequential.
- `docs-list --strict` still fails at repo scope because of many pre-existing metadata gaps outside this change set; the new doc itself was added in the expected structured format.

## Patterns
- Root-owned audit scripts are a good fit when the immediate need is to make policy drift visible without prematurely forcing every existing package into one shape.
- The reduced-form direction is clearer when root docs explicitly separate:
  - centralized policy/validation ownership
  - current package-local legacy surfaces
  - routed follow-up work for templates and package-specific live verification

## Validation
- `npm run tech-stack:review-surfaces` ✅
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅ (rerun sequentially after an initial parallel race while also running `npm run check`)
- `npm run check` ✅
- `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict` ⚠️ pre-existing repo-wide metadata failures outside this change set

## Crystallization Candidates
- → future template change in `pi-extensions-template` that shrinks generated stack review output toward the reduced form intentionally, not implicitly
- → possible hardening in root validation/docs to warn when long-running package gates are launched concurrently and can race on package prepack rewrites
