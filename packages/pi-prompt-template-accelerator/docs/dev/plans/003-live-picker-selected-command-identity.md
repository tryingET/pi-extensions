---
summary: "Plan for preserving exact selected prompt identity through the PTX live picker so duplicate prompt names still prefill the intended command."
read_when:
  - "Fixing PTX live picker cases where selecting a duplicated prompt name leaves the editor empty or resolves the wrong prompt metadata."
system4d:
  container: "Focused hardening slice for live picker selection identity."
  compass: "Carry exact selected prompt metadata through the live picker instead of re-resolving only by name."
  engine: "Reproduce duplicate-name drift -> preserve selected command identity -> add live regression coverage -> update docs/handoff."
  fog: "The main risk is proving only unique-name paths while duplicate scaffold prompts still drift in live sessions."
---

# Plan 003: live-picker selected-command identity

## Objective

Keep PTX live-picker selections stable when multiple prompt commands share the same slash-command name, and never leave the editor empty when a raw fallback command can be staged.

## Steps

1. Reproduce the failure mode with duplicate prompt names and a broker-driven live trigger path.
2. Preserve selected prompt metadata (name/path/description) in PTX picker candidates.
3. Use the selected command metadata during suggestion building instead of re-resolving only by command name.
4. Fall back to staging the raw slash command when live suggestion building still cannot produce a richer transform.
5. Add regression coverage for duplicate-name live-picker selection.
6. Run `npm run check`, `npm run test:smoke:non-ui`, and `npm run release:check:quick`.
7. Update `README.md`, `CHANGELOG.md`, and `next_session_prompt.md` with the new package truth.
