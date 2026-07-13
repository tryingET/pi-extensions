---
summary: "Test-only Prompt Vault schema and governed-contract snapshot for isolated package validation."
read_when:
  - "Refreshing the isolated Prompt Vault integration-test fixture."
type: "reference"
system4d:
  container: "Package-local test fixture copied from the Prompt Vault owner."
  compass: "Keep isolated integration tests deterministic without claiming schema ownership."
  engine: "Refresh from owner -> validate hashes -> run package gate."
  fog: "Fixture drift can hide owner-schema incompatibility."
---

# Prompt Vault contract fixture

Test-only snapshot of the Prompt Vault-owned schema and formatter-normalized governed JSON contracts used by the package's isolated Dolt integration and replay tests.

Source owner: `/home/tryinget/ai-society/core/prompt-vault`

Captured: 2026-07-13

The fixture is not shipped in the npm package. Refresh it intentionally from the owner surface when schema or contract compatibility changes, then rerun the package gate.
