---
summary: "Bound the package-local non-UI prompt-plane and continuation contract to the active seam-first wave and opened the corresponding AK architecture decision."
read_when:
  - "Reviewing how the seam-first wave was contract-bound before the non-UI runtime implementation landed."
  - "Checking why decision #14 exists and what exactly was bound before OP1 implementation started."
system4d:
  container: "Repo-local diary capture for the prompt-plane contract-binding slice."
  compass: "Bind seam truth before implementation and keep package-vs-AK authority explicit."
  engine: "Publish package RFC -> open AK decision -> attach bounded artifacts -> refresh local discovery surfaces -> validate docs/package gates."
  fog: "Main risk is claiming the seam is implemented when only the contract/decision binding has landed."
---

# Diary — 2026-04-09 — vault prompt-plane contract binding

## What changed

- added package RFC:
  - `docs/project/2026-04-09-rfc-non-ui-prompt-plane-and-continuation-contract.md`
- updated package discovery/reference surfaces:
  - `docs/project/resources.md`
  - `next_session_prompt.md`
- opened AK architecture decision:
  - `decision:14` — `pi-vault-client non-UI prompt-plane and continuation contract`
- attached bounded decision artifacts:
  - `problem_brief` -> package RFC
  - `evidence_note` -> root packet `docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`

## Why this was the next truthful move

The active root wave already made the seam-first order explicit, but `pi-vault-client` still lacked a bound package-local contract for:
- a supported non-UI prompt-plane seam for downstream consumers
- a machine-readable continuation envelope for `exact_next_prompt`
- the package-vs-AK authority split for this seam

Without that contract, implementation risk stayed high:
- consumers could keep copying raw prompt-plane behavior or private internals
- exact-next-step outputs would keep degrading into copy/paste prose
- AK rollout truth could be mistaken for AK runtime ownership

## Contract decisions now bound

The RFC binds these points:
- `pi-vault-client` remains canonical owner of prompt-plane runtime semantics
- the first supported seam should be a headless package runtime, not UI command glue
- `exact_next_prompt` should become operational only through a machine-readable continuation envelope
- V3 is the build target
- V4 continuation-graph lineage is reserved as the design horizon
- AK tracks the strategic/tactical rollout, but does not become runtime owner by implication

## What remains next

Decision `14` is now in review flow; the seam is **contract-bound but not yet implemented**.

The next implementation-facing move remains the active OP1 task:
- `task:1050` — expose the supported non-UI `pi-vault-client` prompt-plane seam for orchestrator cognitive-tool consumers

Implementation should now follow the bound contract instead of re-litigating seam shape during code changes.
