---
summary: "Handoff prompt for the private Agent Interaction canary package."
read_when:
  - "Starting the next focused canary session."
system4d:
  container: "Private package session handoff."
  compass: "Preserve the injected-receipt-only authority boundary."
  engine: "Read AK task -> inspect contract -> implement bounded slice -> validate -> record evidence."
  fog: "A local canary pass can be overstated as authentication, compatibility, or release readiness."
---

# Next session prompt

Work only from an explicit AK task scoped to
`packages/pi-agent-interaction-canary/**`.

1. Read `AGENTS.md`, `README.md`, and `docs/project/implementation-contract.md`.
2. Preserve owner-native AK, ts-quality, and ROCS authority.
3. Keep acquisition injected-only and add no writes, caches, evidence, session
   persistence, or memory.
4. Run `npm test` and `npm run check`.
5. Treat install/reload and registered-handler proof as a separate live gate.
6. Do not push, tag, release, or publish. The package is private and
   `scripts/release-check.sh` intentionally fails closed.
