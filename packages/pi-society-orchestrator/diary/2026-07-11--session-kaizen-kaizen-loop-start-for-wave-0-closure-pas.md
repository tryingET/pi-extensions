---
summary: "KES diary capture for kaizen loop start for Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."
read_when:
  - "Reviewing raw package-local KES capture for session."
kes_contract_version: 1
kes_kind: "diary"
kes_package: "pi-society-orchestrator"
system4d:
  container: "Package-local KES diary entry."
  compass: "Preserve raw orchestration memory before any learning promotion."
  engine: "Capture context -> actions -> surprises -> patterns -> candidate hints."
  fog: "The main risk is treating a raw capture as a canonical learning before the evidence stays bounded."
---

# 2026-07-11 — KES Diary: kaizen loop start for Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit.

## Source
- Package: pi-society-orchestrator
- Source kind: loop_summary
- Loop: kaizen
- Session: kaizen-1783742226915
- Objective: Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit.
- Entry kind: session

## What I Did
- Initialized the kaizen loop with 4 phases.
- Planned phase order: plan -> do -> check -> act.

## What Surprised Me
- No surprises recorded.

## Patterns
- No stable patterns recorded yet.

## Crystallization Candidates
- No promotion candidates recorded yet.

## Follow-up
- Review phase-level KES captures as the loop progresses.

## Metadata
```json
{
  "kes_contract_version": 1,
  "package": "pi-society-orchestrator",
  "source": {
    "kind": "loop_summary",
    "loop": "kaizen",
    "sessionId": "kaizen-1783742226915",
    "objective": "Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."
  },
  "metadata": {
    "event": "start",
    "phases": [
      "plan",
      "do",
      "check",
      "act"
    ]
  }
}
```
