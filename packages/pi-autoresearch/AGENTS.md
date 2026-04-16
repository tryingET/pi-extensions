---
summary: "Agent operating guardrails for the pi-autoresearch package workspace."
read_when:
  - "Before editing package code or docs in this workspace."
system4d:
  container: "Local package rules inside the pi-extensions monorepo."
  compass: "Keep the bounded runtime honest about its current control-plane boundary."
  engine: "Read boundary docs -> make one bounded package change -> run package validation -> summarize."
  fog: "The main risk is growing a second control plane inside the package before AK, Prompt Vault, and ontology seams are respected."
---

# AGENTS.md

## Defaults

- Prefer coherent, task-complete changes; avoid unrelated churn.
- Keep this package scoped to the local experiment runtime seam.
- Treat local receipt files as projections, not canonical campaign truth.

## Package constraints

- This folder is a package workspace, not a git root.
- Keep package scripts compatible with monorepo root runners.
- Do not add package-local `.github/` workflows.
- Preserve the bounded-runtime posture until a later task explicitly lands AK binding, safer finalization, or broader loop control.

## Validation

- Run `npm run check` after code changes.
- Run `npm run release:check:quick` when package metadata or published artifacts change.
