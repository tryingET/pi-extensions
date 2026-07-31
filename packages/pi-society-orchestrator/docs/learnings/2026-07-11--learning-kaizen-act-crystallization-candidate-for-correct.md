---
summary: "KES learning candidate for kaizen act crystallization candidate for Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes."
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

# 2026-07-11 — KES Learning Candidate: kaizen act crystallization candidate for Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes.

## Status
- State: candidate-only
- Candidate kind: learning

## Source
- Package: pi-society-orchestrator
- Source diary: `diary/2026-07-11--phase-kaizen-act-kaizen-act-phase-for-correct-the-wave-6.md`
- Source kind: loop_phase
- Loop: kaizen
- Phase: act
- Session: kaizen-1783791092517
- Objective: Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes.

## Claim
The kaizen act phase surfaced reusable material for "Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes."; review the linked diary entry before promoting it beyond this package.

## Evidence
- Phase status: done.
- Primary cognitive tool: knowledge-crystallization.
- Captured output excerpt: ## Patterns Discovered - Whole-tree sibling staging plus `_publish_sibling` preserves exact repository preimages across late failures. - A persistent external lock can serialize concurrent bootstraps without introducing…

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
    "sessionId": "kaizen-1783791092517",
    "objective": "Correct the Wave 6 repair regression under AK task 3726. The current per-managed-path bootstrap publication in src/rocs_cli/wave1.py is unacceptable because Wave 0 requires whole-generation atomic sibling publication and exact rollback. Restore full staged repository publication through _publish_sibling/os.replace while retaining installed wheel/sdist bootstrap support. Coordinate concurrent bootstraps with one persistent, symlink-safe, regular-file external sibling lock at final_target.parent (for example .<repo>.rocs-bootstrap.lock) whose inode is never exchanged or unlinked; report it explicitly as external coordination state, and ensure no tools/.rocs-cli.vendor.lock is created inside the consumer when bootstrap already holds that lock. `_vendor_installed` must build from immutable packaged seed assets without recursive payload growth; generated artifact metadata/version must match the running installed distribution even after release version changes, so synthesize or validate versioned metadata rather than silently copying a stale embedded pyproject. Preserve schema-2 complete hash verification, root-layout correctness, standalone gate/hook behavior, profile semantics, GitLab removals, and uv.lock hash 2faf5bc9a99011b4eeb7c99f3464ee6bdd6f720173c954a4264f246cdb5272f9. Update adversarial tests to prove whole-tree atomic rollback at late failure points, concurrent-lock safety, no undeclared in-repo paths, no recursive bootstrap assets across repeated vendoring, and wheel/sdist installed bootstrap+verify. Re-run real disposable holdingco ontology dogfood and all gates. Work only within task scope; do not commit or mutate AK/direction/consumer source repos/remotes."
  },
  "sourceDiary": "diary/2026-07-11--phase-kaizen-act-kaizen-act-phase-for-correct-the-wave-6.md",
  "metadata": {
    "event": "phase_candidate",
    "agent": "researcher",
    "primaryTool": "knowledge-crystallization",
    "status": "done"
  }
}
```
