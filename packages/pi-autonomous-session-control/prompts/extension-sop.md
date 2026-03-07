---
description: Execute a change using this repository's Extension SOP (plan -> implement -> verify -> maintain -> release)
system4d:
  container: "Prompt template for SOP-driven extension delivery."
  compass: "Ship deterministic changes with explicit validation and refactor hygiene."
  engine: "Follow docs/dev/EXTENSION_SOP.md step by step with concrete outputs."
  fog: "Skipping maintain/refactor checks can hide complexity debt."
---

Use [docs/dev/EXTENSION_SOP.md](../docs/dev/EXTENSION_SOP.md) as the source of truth and execute this request through each SOP phase:

$@

Requirements:
- Show output grouped by SOP phases (1..7).
- In **Verify**, run and report:
  - `npm run fix`
  - `npm run check`
- In **Maintain**, include a complexity check for `extensions/self.ts` and explicitly decide:
  - keep as-is, or
  - perform/refactor-plan module split under `src/`.
- If a refactor is deferred, record a concrete trigger and follow-up task in `NEXT_SESSION_PROMPT.md`.
- Keep behavior changes and docs/changelog updates in sync.
