---
summary: "KES diary capture for kaizen check phase for Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."
read_when:
  - "Reviewing raw package-local KES capture for phase."
kes_contract_version: 1
kes_kind: "diary"
kes_package: "pi-society-orchestrator"
system4d:
  container: "Package-local KES diary entry."
  compass: "Preserve raw orchestration memory before any learning promotion."
  engine: "Capture context -> actions -> surprises -> patterns -> candidate hints."
  fog: "The main risk is treating a raw capture as a canonical learning before the evidence stays bounded."
---

# 2026-07-11 — KES Diary: kaizen check phase for Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit.

## Source
- Package: pi-society-orchestrator
- Source kind: loop_phase
- Loop: kaizen
- Phase: check
- Session: kaizen-1783742226915
- Objective: Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit.
- Entry kind: phase

## What I Did
- Ran check with agent reviewer using cognitive tool audit.
- Execution status: done (exit 0, 45920ms).
- Evidence write outcome: ak.
- Captured output excerpt: ## BUGS - **Cleanup is not preflight-atomic:** `scripts/ci/full.sh:73-87` validates and deletes each target sequentially. A valid `ontology/dist` is deleted before a later escaping `dist` is rejected → validate all targ…

## What Surprised Me
- No surprises recorded.

## Patterns
- No stable patterns recorded yet.

## Crystallization Candidates
- No promotion candidates recorded yet.

## Follow-up
- Inspect the raw diary capture before reusing this phase output elsewhere.

## Metadata
```json
{
  "kes_contract_version": 1,
  "package": "pi-society-orchestrator",
  "source": {
    "kind": "loop_phase",
    "loop": "kaizen",
    "phase": "check",
    "sessionId": "kaizen-1783742226915",
    "objective": "Wave 0 closure pass in /home/tryinget/ai-society/core/rocs-cli. The prior pass is NOT accepted as closed. Preserve its working safety changes, and close exactly these independently verified gaps before Wave 1: (A) scripts/ci/full.sh must verify ROCS_REPO as a real expected repo root and prove all destructive cleanup targets resolve beneath it before deletion; add adversarial tests for '/', outside paths, symlink escape, missing manifest, spaces. (B) scripts/bootstrap-repo.sh mutations, including vendoring plus managed writes, must be transactionally staged or snapshot/rollback safe so any late failure restores byte-identical preimages; add injected-failure tests. (C) define one closed versioned capability registry in importable rocs_cli code and have fleet audit/bootstrap/policy logic consume it instead of independently hard-coding capability names/class requirements; unknown/missing entries fail closed. (D) independently dogfood all five Wave 0 properties: fresh-audit apply binding, actual vendored hash coverage, destructive cleanup containment, bootstrap+vendor rollback safety, single closed registry. Preserve unrelated existing AGENTS.md and uv.lock changes. Update CHANGELOG where behavior breaks. Run full tests. Do not begin Wave 1 and do not commit."
  },
  "metadata": {
    "event": "phase",
    "agent": "reviewer",
    "primaryTool": "audit",
    "status": "done",
    "exitCode": 0,
    "elapsed": 45920,
    "failureKind": null,
    "evidence": {
      "ok": true,
      "via": "ak"
    },
    "hookArtifacts": []
  }
}
```
