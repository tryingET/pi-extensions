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

Security fixes target the latest release and `main` branch.

## Reporting a vulnerability

Use **private reporting**.

1. Preferred: GitHub Security tab -> **Report a vulnerability**.
2. If private reporting is unavailable, open a minimal issue titled
   `Security contact request` without exploit details and request a private channel.
3. Include impact, affected versions, and reproduction steps.
4. Avoid public disclosure until maintainers confirm a fix/release plan.

## Release and supply-chain baseline

- Release flow uses release-please PRs before tags/releases.
- Release checks gate artifact contents (`npm pack --dry-run --json`) and publish dry-run (`npm publish --dry-run`).
- Publish flow uses npm Trusted Publishing (OIDC) and `npm publish --provenance`.
- Workflow permissions default to read and elevate per job only.
- Third-party actions must stay explicit; high-risk paths should be SHA pinned.
