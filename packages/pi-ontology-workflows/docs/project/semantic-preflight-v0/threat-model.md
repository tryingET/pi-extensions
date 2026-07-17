---
summary: "Threat boundary for the development-only prepared ROCS runtime verifier and subprocess runner."
read_when:
  - "Reviewing prepared-runtime integrity, subprocess safety, or semantic-preflight security claims."
type: "security-boundary"
system4d:
  container: "Development-only ROCS runtime verification inside pi-ontology-workflows."
  compass: "Make integrity claims exact without implying defense against a malicious same-UID principal."
  engine: "Verify material and inode identity immediately before bounded execution of an exact ROCS release."
  fog: "Repeated checks cannot seal Python imports against an owner who can mutate or ptrace the process."
---

# Prepared ROCS runtime threat boundary

## Scope

The Stage-1 verifier protects against accidental drift, cross-UID/path substitution, symlink traversal, unsafe shared-writable components, manifest/content mismatch, interpreter drift, and bounded-process failures. It opens the runtime through no-follow descriptors and revalidates the complete recorded material and inode identity immediately before spawning the exact reviewed ROCS command surface.

The descriptor reports this precisely:

```json
{
  "schema": "pi-rocs-prepared-runtime-verification.v0",
  "materialIdentity": "verified_before_spawn",
  "threatBoundary": "trusted_same_uid"
}
```

This is not a claim that runtime bytes are sealed after verification.

## Trusted same-UID boundary

The runtime preparer and every process with the invoking user's UID are trusted. A malicious same-UID principal can rewrite owner-controlled files after the final check, alter permissions, ptrace the process, or otherwise subvert ordinary user-space execution. Another stat, digest, or chmod step cannot close that boundary.

If hostile same-UID mutation enters scope, the development gate must remain disabled until execution uses a separately reviewed sealed-material design, such as a sealed source archive or equivalent immutable execution substrate. Do not relabel the current evidence as complete or race-proof.

## Child-process boundary

Stage 1 invokes only the exact content-addressed ROCS `discover-capabilities`, `discover`, and bound `pack` paths. The reviewed ROCS `v0.2.1` implementation does not daemonize or leave background descendants on successful execution. Timeout, output-cap, and failure paths retain bounded process-group TERM/KILL/reap behavior.

The generic subprocess helper is not authorization to run arbitrary prepared children. If that contract expands, successful-leader exit with surviving descendants requires a separate process-group liveness and cleanup design plus adversarial regression coverage.

## Operational posture

- The semantic runner is unreachable unless an explicit verified development descriptor and gate are supplied.
- Stage 1 does not modify the Pi extension entrypoint, startup behavior, defaults, or package manifest.
- Stage-2 lifecycle activation remains separately gated by host capabilities, explicit TUI consent, a current ROCS pin, and its own review.
