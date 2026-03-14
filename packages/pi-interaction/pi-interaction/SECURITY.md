---
summary: "Security reporting process and release hardening baseline."
read_when:
  - "Reporting a vulnerability."
  - "Reviewing release and workflow security controls."
system4d:
  container: "Security policy for maintainers and contributors."
  compass: "Private reporting, least privilege, auditable releases."
  engine: "Report privately -> triage -> patch -> verify -> disclose."
  fog: "Dependency and ecosystem risk shifts over time."
---

# Security Policy

## Supported versions

Security fixes target the latest `@tryinget/pi-interaction` release and `main`.

## Reporting a vulnerability

Use **private reporting**.

1. Preferred: GitHub Security tab -> **Report a vulnerability**.
2. If private reporting is unavailable, open a minimal issue titled
   `Security contact request` without exploit details and request a private channel.
3. Include impact, affected versions, and reproduction steps.
4. Avoid public disclosure until maintainers confirm a fix/release plan.

## Release and supply-chain baseline

- The canonical publish target is this package directory: `packages/pi-interaction/pi-interaction`.
- Release checks gate artifact contents (`npm pack --dry-run --json`) and publish dry-run (`npm publish --dry-run`).
- Trusted publishing must keep provenance aligned with the monorepo repository URL and `repository.directory`.
- Workflow permissions should default to read and elevate per job only.
- Third-party actions should stay explicit; high-risk paths should be SHA pinned.
