---
summary: "Explicit release opt-out posture for the bounded pi-evidence-review candidate."
read_when:
  - "Reviewing why pi-evidence-review is not a root-managed release component."
  - "Planning a separately authorized package release wave."
system4d:
  container: "Candidate release boundary."
  compass: "Do not imply release or production readiness from a validated local package."
  engine: "Keep releaseConfigMode none -> validate locally -> require a separate root-owner release decision."
  fog: "Scaffold publishing metadata can otherwise be mistaken for release authorization."
---

# Release posture: explicit opt-out

`pi-evidence-review` currently declares `x-pi-template.releaseConfigMode: none` and is not a root-managed release component. AK-3843 authorized a bounded candidate implementation, not publication, release-please configuration, trusted-publisher setup, or production readiness.

The package's repository and `publishConfig` fields are inert npm metadata inherited from the canonical scaffold. They do not assert that the package is published, production-ready, or approved for release.

A future release requires a separately authorized owner wave that may:

1. review the security and portability boundaries;
2. choose whether to change `releaseConfigMode` to `component`;
3. synchronize root release configuration in the same authorized change;
4. establish publishing credentials/workflow and perform live install/reload verification.

Until then, release checks are packaging diagnostics only and confer no promotion authority.
