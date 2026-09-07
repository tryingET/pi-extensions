---
summary: "Independent pre-ranking review record for frozen cases, staleness samples, and remediated preparation evidence."
read_when:
  - "Confirming semantic and staleness review occurred before source-selection ranking."
type: "reference"
system4d:
  container: "Pre-ranking independence and artifact-integrity review record."
  compass: "Prevent truth leakage and stale metadata claims before measurement."
  engine: "Review cases and samples -> remediate preparation -> freeze reviewed bytes."
  fog: "Post-ranking edits or unbound review claims would invalidate independence."
---

# Pre-ranking review

Status: all case cohorts and metadata-staleness samples were independently **ACCEPTed before ranking**. Blockers from `dispatch-1784967679451` were remediated by repreparation as new frozen bytes.

- Canonical case source: `canonical-case-source.generated.json`, `sha256:7badfe24d8d951c06fcf0bc34c573bf564c39e0aad3e1db52ccc1692543fe8fb`.
- Preregistration: `../../../docs/project/2026-07-12-source-list-sci-ablation-preregistration.md`, `sha256:80fb803aa93733efb4a78812764081402b871b0d56b48b5184cc8145511f4dfd`.
- Ranking leakage: **none**; no ranking was executed, retained, printed, or inspected.
- Metadata staleness: all four 10-path samples retained `stalePaths=[]`.
- SCI index/state evidence: retained strace `trace=%file` bundle is bounded file-access corroboration, not authentication; Git index reads are classified separately.
- Producer measurements: actual monotonic durations, exact raw bytes, and `ceil(bytes/4)` estimates are retained in `preparation-summary.generated.json`.
- Final ranking result: absent.

## Frozen commits

| Repository | Commit |
|---|---|
| agent-scripts | `36792de9195c86e6e8ae521efb5c952492278088` |
| engineering-core | `f084fcc4981339893c302e13c8266313233a0e2b` |
| dspx | `cc21bc7e04ec15241b5fc86f0cc3863d0fd19a27` |
| pi-extensions | `e67b1071dbdd2c8139da60432fb019d8dd991597` |

## Independent ACCEPT reviews

| Repository | Case cohort | Case dispatch | Staleness sample | Staleness dispatch |
|---|---|---|---|---|
| agent-scripts | ACCEPT | `dispatch-1784965442566` | ACCEPT, stalePaths=[] | `dispatch-1784967045475` |
| engineering-core | ACCEPT | `dispatch-1784965442566-1` | ACCEPT, stalePaths=[] | `dispatch-1784967045476` |
| dspx | ACCEPT | `dispatch-1784965442567` | ACCEPT, stalePaths=[] | `dispatch-1784967045476-1` |
| pi-extensions | ACCEPT | `dispatch-1784965442568` | ACCEPT, stalePaths=[] | `dispatch-1784967045477` |
