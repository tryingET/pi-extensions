---
summary: "Key resources for building and maintaining the extension."
read_when:
  - "Looking up references, docs, or operational artifacts."
system4d:
  container: "Reference catalog for the project."
  compass: "Centralize discovery paths for maintainers."
  engine: "Link docs, scripts, and examples used in execution."
  fog: "External links may become stale over time."
---

# Resources

- [Extension entrypoint](../../extensions/vault.ts)
- [Prompt templates](../../prompts)
- [Organization operating model](../org/operating_model.md)
- [RFC: non-UI prompt-plane and continuation contract](2026-04-09-rfc-non-ui-prompt-plane-and-continuation-contract.md)
- [Review memo: non-UI prompt-plane and continuation contract](2026-04-10-review-non-ui-prompt-plane-and-continuation-contract.md)
- [Implementation plan: non-UI prompt-plane V3](2026-04-10-plan-non-ui-prompt-plane-v3.md)
- [Validation / rollout / rollback: non-UI prompt-plane V3](2026-04-10-validation-rollout-rollback-non-ui-prompt-plane-v3.md)
- [ADR: non-UI prompt-plane and continuation contract](../adr/2026-04-10-non-ui-prompt-plane-and-continuation-contract.md)
- [Security policy](../../policy/security-policy.json)
- [Validation script](../../scripts/validate-structure.sh)
- [Trusted publishing runbook](../dev/trusted_publishing.md)
- [Legacy render-engine rollout](../dev/legacy-render-engine-rollout.md)
- [Biome config](../../biome.jsonc)
- [VS Code workspace settings](../../.vscode/settings.json)
- Tech-stack lane reference (pi extension TypeScript):
  - `uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo`
