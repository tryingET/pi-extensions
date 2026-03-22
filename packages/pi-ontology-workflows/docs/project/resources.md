---
summary: "Key resources for building and maintaining the ontology workflow package."
read_when:
  - "Looking up architecture, runtime entrypoints, and tests."
system4d:
  container: "Reference catalog for ontology workflows."
  compass: "Keep discovery cheap for maintainers."
  engine: "Entrypoint -> core -> adapters -> tests -> docs."
  fog: "Package drift happens when maintainers cannot see the real ownership seams quickly."
---

# Resources

## Runtime entrypoints

- [Extension entrypoint](../../extensions/ontology-workflows.ts)
- [Workflow contracts](../../src/core/contracts.ts)
- [Inspect use case](../../src/core/inspect.ts)
- [Change use case](../../src/core/change.ts)

## Adapters and ports

- [ROCS adapter](../../src/adapters/rocs-cli.ts)
- [Workspace adapter](../../src/adapters/workspace.ts)
- [Interaction adapter](../../src/adapters/interaction.ts)
- [Formatting adapter](../../src/adapters/format.ts)
- [ROCS port](../../src/ports/rocs-port.ts)
- [Workspace port](../../src/ports/workspace-port.ts)

## Tests

- [Workspace tests](../../tests/workspace.test.ts)
- [Change planning tests](../../tests/change.test.ts)
- [Integration tests](../../tests/integration.test.ts)
- [Extension surface test](../../tests/extension.test.ts)

## Package and process docs

- [README](../../README.md)
- [Architecture decision](../decisions/2026-03-14-stable-core-thin-adapters.md)
- [Project README](../../README.md)
- [Trusted publishing runbook](../dev/trusted_publishing.md)
- [Validation script](../../scripts/validate-structure.sh)
- [Security policy](../../policy/security-policy.json)

## External references

- `~/ai-society/core/tpl-template-repo/docs/learnings/2026-03-13-stable-core-thin-adapters-for-multi-surface-systems.md`
- `~/ai-society/core/tpl-template-repo/docs/learnings/2026-03-13-recurring-operation-languages-should-become-explicit.md`
- TypeScript lane reference:
  - `uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo`
