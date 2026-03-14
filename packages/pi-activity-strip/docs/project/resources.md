---
summary: "Key resources for building and maintaining the extension."
read_when:
  - "Looking up references, docs, or operational artifacts."
system4d:
  container: "Reference catalog for the project."
  compass: "Centralize discovery paths for maintainers."
  engine: "Link docs, scripts, and runtime entrypoints used in execution."
  fog: "External links and host-runtime assumptions may drift over time."
---

# Resources

- [Pi extension runtime entrypoint](../../extensions/activity-strip.js)
- [Pi compatibility re-export](../../extensions/activity-strip.ts)
- [CLI launcher](../../bin/pi-activity-strip.mjs)
- [Broker client](../../src/client/broker-client.mjs)
- [Session telemetry mapper](../../src/client/session-telemetry.mjs)
- [Broker server](../../src/broker/server.mjs)
- [Electron overlay entrypoint](../../src/electron/main.mjs)
- [HTML strip renderer](../../src/ui/strip-html.mjs)
- [Live headless smoke](../../scripts/live-headless-smoke.sh)
- [Release smoke](../../scripts/release-smoke.sh)
- [Strip-only capture helper](../../scripts/capture-strip-window.sh)
- [Top-band capture helper](../../scripts/capture-top-band.sh)
- [Prompt templates](../../prompts)
- [Security policy](../../policy/security-policy.json)
- [Validation script](../../scripts/validate-structure.sh)
- [Trusted publishing runbook](../dev/trusted_publishing.md)
- [Biome config](../../biome.jsonc)
- [VS Code workspace settings](../../.vscode/settings.json)
- Tech-stack lane reference (pi extension TypeScript/JS conventions):
  - `uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo`
