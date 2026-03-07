---
description: Run interview-first initialization for organization and project docs
system4d:
  container: "Prompt template for document initialization workflow."
  compass: "Create compact, aligned org/project docs from structured intake."
  engine: "Intent -> interview -> synthesize -> update docs -> verify."
  fog: "Incomplete intake answers can cause ambiguous documentation."
---

Initialize organization and project docs from interactive intake.

Startup intent (if provided): $@

Steps:
1. Read `docs/org/project-docs-intake.questions.json`.
2. If startup intent is non-empty, create `docs/org/project-docs-intake.runtime.questions.json` with one prepended question:
   - `id`: `startup_intent_confirmation`
   - `type`: `text`
   - `question`: `Startup intent captured: <startup intent>. Confirm or refine this intent before continuing.`
3. Run the `interview` tool:
   - `questions`: runtime file from step 2 if created, otherwise `docs/org/project-docs-intake.questions.json`
   - `timeout`: `900`
4. Use interview responses to update these files:
   - `docs/org/operating_model.md`
   - `docs/project/foundation.md`
   - `docs/project/vision.md`
   - `docs/project/strategic_goals.md`
   - `docs/project/tactical_goals.md`
5. Keep wording fully in English.
6. Keep **organization purpose** separate from **project purpose**.
7. Keep output compact.
8. Run `bash ./scripts/validate-structure.sh`.
