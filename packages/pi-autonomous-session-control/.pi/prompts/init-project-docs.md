---
description: Run interview-first initialization for organization and project docs
system4d:
  container: "Project-local prompt template for startup interview flow."
  compass: "Route startup intent into context-aware interview-driven document setup."
  engine: "Intent + repo context -> runtime interview -> synthesize -> update docs -> verify."
  fog: "If context extraction fails, project-level wording may drift generic."
---

Initialize organization and project docs from interactive intake.

Startup intent (if provided): $@

Steps:
1. Read context sources:
   - `README.md` (if present)
   - `package.json` (especially `config.intakeContextSeed` if present)
   - current folder/repo name
2. Read `docs/org/project-docs-intake.questions.json`.
3. Build runtime questions using repo context:
   - `node ./scripts/build-intake-questions-runtime.mjs --output docs/org/project-docs-intake.runtime.questions.json --startup-intent "<startup intent>"`
   - If startup intent is empty, omit the `--startup-intent` flag.
4. Try running the `interview` tool:
   - `questions`: `docs/org/project-docs-intake.runtime.questions.json`
   - `timeout`: `900`
5. If `interview` is unavailable or fails (for example missing tool or non-interactive/headless mode), fall back to plain chat intake:
   - Ask the same questions from `docs/org/project-docs-intake.questions.json` directly in chat.
   - Keep question ids so mapping stays deterministic.
6. Use collected responses (tool or fallback chat) to update these files:
   - `docs/org/operating_model.md`
   - `docs/project/foundation.md`
   - `docs/project/vision.md`
   - `docs/project/strategic_goals.md`
   - `docs/project/tactical_goals.md`
7. Keep wording fully in English.
8. Keep **organization purpose** separate from **project purpose**.
9. Keep output compact and testable.
10. Delete `docs/org/project-docs-intake.runtime.questions.json` if it was created.
11. Run `bash ./scripts/validate-structure.sh`.
