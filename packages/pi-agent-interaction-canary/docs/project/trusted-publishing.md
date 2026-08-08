---
summary: "Explicit publication prohibition for the private Agent Interaction canary."
read_when:
  - "Reviewing release or publication posture for this package."
system4d:
  container: "Private experimental package boundary."
  compass: "Keep validation and live proof separate from release authority."
  engine: "Validate locally; fail closed on release or publication requests."
  fog: "Generated release-oriented template files can be mistaken for authorization."
---

# Publication posture

`@tryinget/pi-agent-interaction-canary` is private and uses
`x-pi-template.releaseConfigMode=none`.

There is no trusted-publishing, release-please, npm publication, tagging, or
remote-adoption route for this package. `scripts/release-check.sh` fails closed
if invoked. Package validation and local Pi install/reload proof do not grant
release authority.

If publication is ever proposed, create separate owner-authorized work to
change the package contract, threat model, validation, release metadata, and
root workflow. Do not reinterpret task 4677 or its canary evidence as that
authorization.
