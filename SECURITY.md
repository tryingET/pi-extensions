---
summary: "Security reporting process and monorepo release hardening baseline."
read_when:
  - "Reporting a vulnerability."
  - "Reviewing release and workflow security controls."
system4d:
  container: "Security policy for maintainers and contributors."
  compass: "Private reporting, least privilege, auditable releases."
  engine: "Report privately -> triage -> patch -> verify -> disclose."
  fog: "Monorepo release automation may evolve before first public publish flow is fully settled."
---

# Security Policy

## Supported versions

Security fixes target `main` and the latest relevant package releases.

## Reporting a vulnerability

Use **private reporting**.

1. Preferred: GitHub Security tab -> **Report a vulnerability**.
2. If private reporting is unavailable, open a minimal issue titled
   `Security contact request` without exploit details and request a private channel.
3. Include impact, affected packages/versions, and reproduction steps.
4. Avoid public disclosure until maintainers confirm a fix/release plan.

## Release and supply-chain baseline

- Root validation uses `scripts/quality-gate.sh` through `npm run quality:pre-push` and `npm run quality:ci` before push/release decisions.
- Package release checks remain package-local until monorepo release automation is finalized.
- Workflow permissions should default to read and elevate per job only.
- Third-party actions should stay explicit; high-risk paths should be SHA pinned.
