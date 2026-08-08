---
summary: "Key resources for reviewing and validating the private canary."
read_when:
  - "Looking up implementation, policy, or validation references."
system4d:
  container: "Canary reference catalog."
  compass: "Route readers to the narrowest owner-local evidence."
  engine: "Read contract -> inspect implementation -> run validation."
  fog: "Generated scaffold references can outlive the package's private posture."
---

# Resources

- [Extension entrypoint](../../extensions/agent-interaction-canary.ts)
- [Implementation contract](implementation-contract.md)
- [Security policy](../../policy/security-policy.json)
- [Engineering overrides](../engineering.local.md)
- [Validation script](../../scripts/validate-structure.sh)
- [Publication posture](trusted-publishing.md)
- [Biome config](../../biome.jsonc)
- TypeScript lane: `uv tool -n run --from ~/ai-society/core/engineering-core engineering-core show pi-ts`

The generated files under `prompts/` are retained as Copier source lineage only;
they are not included in the package allowlist or registered with Pi.
