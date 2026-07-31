---
summary: "KES learning candidate for kaizen act crystallization candidate for Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."
read_when:
  - "Reviewing a package-owned learning candidate before promotion."
kes_contract_version: 1
kes_kind: "learning_candidate"
kes_package: "pi-society-orchestrator"
system4d:
  container: "Package-local KES learning candidate."
  compass: "Bound promotion from raw capture into a durable candidate without inventing a second authority surface."
  engine: "Tie the claim to raw evidence -> state reusable heuristics -> capture follow-up and anti-patterns."
  fog: "The main risk is promoting pattern language without attributable package-local evidence."
---

# 2026-07-11 — KES Learning Candidate: kaizen act crystallization candidate for Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit.

## Status
- State: candidate-only
- Candidate kind: learning

## Source
- Package: pi-society-orchestrator
- Source diary: `diary/2026-07-11--phase-kaizen-act-kaizen-act-phase-for-wave-0-closure-pass.md`
- Source kind: loop_phase
- Loop: kaizen
- Phase: act
- Session: kaizen-1783742226915
- Objective: Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit.

## Claim
The kaizen act phase surfaced reusable material for "Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."; review the linked diary entry before promoting it beyond this package.

## Evidence
- Phase status: done.
- Primary cognitive tool: knowledge-crystallization.
- Captured output excerpt: ## Patterns Discovered - Destructive cleanup must validate **all** resolved targets before deleting any. - Capability policy is authoritative only when policy values exactly match the closed registry. - Fresh remediatio…

## Reusable Heuristics
- Promote only after confirming the candidate still matches the full raw diary capture.

## Anti-patterns to Avoid
- Do not treat candidate-only KES output as a canonical learning without review.
- Do not promote failed or partial loop output beyond the linked diary evidence.

## Follow-up
- Review the linked diary entry and explicitly decide whether to elevate this candidate.

## Metadata
```json
{
  "kes_contract_version": 1,
  "package": "pi-society-orchestrator",
  "source": {
    "kind": "loop_phase",
    "loop": "kaizen",
    "phase": "act",
    "sessionId": "kaizen-1783742226915",
    "objective": "Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."
  },
  "sourceDiary": "diary/2026-07-11--phase-kaizen-act-kaizen-act-phase-for-wave-0-closure-pass.md",
  "metadata": {
    "event": "phase_candidate",
    "agent": "researcher",
    "primaryTool": "knowledge-crystallization",
    "status": "done"
  }
}
```
