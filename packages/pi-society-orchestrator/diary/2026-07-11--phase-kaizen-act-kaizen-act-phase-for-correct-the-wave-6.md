---
summary: "KES diary capture for kaizen act phase for Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes."
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

# 2026-07-11 — KES Diary: kaizen act phase for Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes.

## Source
- Package: pi-society-orchestrator
- Source kind: loop_phase
- Loop: kaizen
- Phase: act
- Session: kaizen-1783791092517
- Objective: Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes.
- Entry kind: phase

## What I Did
- Ran act with agent researcher using cognitive tool knowledge-crystallization.
- Execution status: done (exit 0, 124136ms).
- Evidence write outcome: ak.
- Captured output excerpt: ## Patterns Discovered - Whole-tree sibling staging plus `_publish_sibling` preserves exact repository preimages across late failures. - A persistent external lock can serialize concurrent bootstraps without introducing…

## What Surprised Me
- No surprises recorded.

## Patterns
- No stable patterns recorded yet.

## Crystallization Candidates
- Review the paired candidate-only learning artifact before any broader promotion.

## Follow-up
- Review the linked learning candidate under docs/learnings/.

## Metadata
```json
{
  "kes_contract_version": 1,
  "package": "pi-society-orchestrator",
  "source": {
    "kind": "loop_phase",
    "loop": "kaizen",
    "phase": "act",
    "sessionId": "kaizen-1783791092517",
    "objective": "Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes."
  },
  "metadata": {
    "event": "phase",
    "agent": "researcher",
    "primaryTool": "knowledge-crystallization",
    "status": "done",
    "exitCode": 0,
    "elapsed": 124136,
    "failureKind": null,
    "evidence": {
      "ok": true,
      "via": "ak"
    },
    "hookArtifacts": []
  }
}
```
