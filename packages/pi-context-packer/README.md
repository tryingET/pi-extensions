---
summary: "Context-packer code-provider migration and validation."
read_when:
  - "Working on the ripwire-only integration."
system4d:
  container: "Read-only context-packer package in pi-extensions."
  compass: "Remove the old code provider without implied replacement consent."
  engine: "Plan, bound, verify, and report explicit omissions."
  fog: "Package verification is not proof of model task performance."
---

# @tryinget/pi-context-packer

Read-only context planning and packet assembly for Pi. Instructions, Markdown/docs-list,
Git posture, and session metadata remain available. Prompt Vault, AK, and FCOS remain
owner-routed. This increment intentionally has no code retrieval backend; use Pi's
ordinary read/search tools while the opt-in ripwire stack is implemented.

## Migration

SCI is removed from this package's runtime, routing, prompts, and active experiments.
Remove `providers.sci` and its provider budget from saved requests; obsolete configuration
is rejected, never silently mapped to permission to execute another tool. No installed
software or user `.ontology` data is removed. Historical code and evidence are archived
at `docs/archive/pi-context-packer/pre-ripwire` in the monorepo, outside this package artifact.
Other independently owned monorepo packages are not removed by this migration.

## Verification

Run the canonical gate from the monorepo root:

```sh
bash scripts/package-quality-gate.sh ci packages/pi-context-packer
```

Run `npm run release:check` from this package for isolated installed-Pi verification.
The quick release check skips Pi smoke and is not proof of activation.
`npm run dogfood:gate -- --gate RW-01 --candidate-sha <SHA> --output-dir <EXTERNAL_DIR>`
checks an exact clean candidate and emits an independently rerunnable receipt.
An offline registered-tool smoke is not a model-task benchmark or independent authorship.

The package does not apply edits, run validation commands, install tools, or move task authority.
