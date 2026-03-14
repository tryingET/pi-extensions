---
summary: "Current status snapshot for pi-ontology-workflows after full initial package implementation."
read_when:
  - "Preparing a handoff or planning the next slice."
  - "Checking what the initial package implementation already covers."
system4d:
  container: "Status snapshot."
  compass: "Keep package status explicit and honest."
  engine: "Implemented surface -> tested seams -> next pressure points."
  fog: "Without a status note, maintainers will rediscover already-settled boundaries."
---

# Status

## Implemented

- scaffolded as a `simple-package` from `pi-extensions-template`
- stable workflow core in `src/core/`
- explicit ontology workflow contract language in `src/core/contracts.ts`
- thin adapters for ROCS, workspace resolution, formatting, and frontmatter handling
- Pi extension surface with:
  - `ontology_inspect`
  - `ontology_change`
  - `/ontology-status`
- integrated picker/editor UX layer built on the published `pi-interaction` support packages
  - `/ontology:<query>[::scope]`
  - `/ontology-pack:<query>[::scope]`
  - `/ontology-change:<query>[::scope]`
- startup status/widget behavior on `session_start`
- ontology hint injection on `before_agent_start`
- change support for:
  - concept
  - relation
  - system4d
  - bridge
- post-apply ROCS validate/build behavior
- tests covering:
  - workspace routing
  - change planning
  - end-to-end apply + inspect using real ROCS
  - extension surface registration

## Current shape

Public surface stays intentionally compact.
The internal capability is broader than the external tool count.
That is deliberate and follows the stable-core / thin-adapter decision.

## Known next pressure points

- relation-body preservation is still canonical-rewrite oriented rather than diff-preserving
- no separate reusable package export surface is published beyond the extension package itself
- the integrated interaction layer is package-local rather than delegated to the umbrella `@tryinget/pi-interaction` extension package
- live smoke currently assumes a local Pi install and company context
