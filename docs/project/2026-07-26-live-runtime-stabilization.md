---
summary: "AK-4265 live activation evidence for the a0a72e4c governed-loop runtime, rollback posture, and real deep-review/Nexus dogfood."
read_when:
  - "Changing live Pi package roots, governed deep-review startup, or rollback/cleanup posture."
  - "Diagnosing the final AK-4265 runtime activation and dogfood result."
type: "implementation-evidence-note"
status: "live-verified-cleanup-deferred"
date: "2026-07-26"
system4d:
  container: "AK-4265 live runtime stabilization after AK-4282 and AK-4283."
  compass: "Select one immutable owner graph, prove it in a fresh Pi process, and retain exact rollback."
  engine: "materialize -> verify -> atomic settings switch -> fresh-process provenance probe -> governed deep-review -> one Nexus release"
  fog: "A package-list switch or synthetic receipt can look successful while process-local owners remain split."
---

# Live governed-loop runtime stabilization

## Result and authority boundary

AK task `4265` owns the live settings transaction and dogfood. The selected immutable source is:

```text
commit: a0a72e4c7ee8ae77420048e77ed61777f9aa0235
root:   /home/tryinget/.local/share/pi/live-worktrees/pi-extensions-a0a72e4c
```

This descendant contains the accepted `edb96b46` base, AK-4282 provenance hardening at `c70967ac`, and AK-4283 native-ESM owner attestation. The live settings transaction selected ten governed top-level package paths beneath that root. No canonical-history integration or runtime cleanup was performed.

The evidence root is local, mode-restricted, and intentionally not canonical authority:

```text
/home/tryinget/.local/state/pi-quests/runtime-backups/ak-4265-a0a72e4c
```

AK evidence records own durable task evidence. This note explains the observed transaction and proof without copying settings contents or secrets.

## Immutable materialization

The v3 production materializer and verifier accepted the detached source at the exact selected commit:

- tracked changes: `0`;
- ordinary untracked source paths: `0`;
- package-input files hashed: `28` across the closed 14-package set;
- reconstructed owner resolutions: `20`;
- runtime registry: one physical selected-root owner;
- Typebox: `1.1.38` from the selected-root peer layer;
- Pi host peers: `0.80.6` with verified integrity and tree digests.

After live dogfood, production verification ran again and returned `ok=true`, the exact selected root/commit, and `resolutionCount=20`.

## Settings transaction and rollback

The pre-switch settings file was mode `0600` with SHA-256:

```text
93db8e6f930b7017cf490e9d3ac991901cdda9d6370b8660448a30061a6fd4f2
```

An atomic same-directory replacement changed exactly ten occurrences of the `edb96b46` root to `a0a72e4c`. The selected settings SHA-256 is:

```text
b8ae7a21777518378dbf4df5a3122d578a316ee4c8031d138a8e5f73ea9ea2f7
```

The first real-proof attempt exposed a proof-harness ownership error: the extra probe extension started the visible-loop state from its cache-distinct module instance but had not registered that same instance's tool lifecycle handlers. The governed owner preflight itself succeeded at the exact selected commit, but the harness did not bind the observed tool call, so the orchestrator correctly returned `governed-deep-review-preflight-claim-failed`.

That attempt was not treated as runtime success. Settings were immediately and atomically restored to the exact pre-switch SHA, `pi list` returned to the `edb96b46` sources, and a new Pi process proved all 50 closed-owner tool registrations came from `edb96b46` with zero failed-candidate paths.

The corrected external proof harness registered tool lifecycle handlers from the same visible-loop module instance that started the run. A second atomic switch reproduced the exact selected settings SHA before the successful proof. This was a harness correction only; no repository code changed after `a0a72e4c`.

## Fresh-process provenance

A fresh Pi RPC process loaded 75 tools. For the closed governed owner set:

```text
closedOwnerToolCount=50
closedOwnerWrongRootCount=0
oldRootToolCount=0
predecessorRootToolCount=0
piListSelectedLines=20
piListOldLines=0
```

The ten selected package entries therefore resolve only beneath `pi-extensions-a0a72e4c`. Unrelated packages outside the closed set retain their separately owned roots and are not evidence of selected-graph divergence.

## Real governed dogfood

The corrected fresh-process run performed one actual `vault_execute_template` call for `deep-review`. The visible-loop status recorded the same preflight nonce and receipt digest before the tool call, bound the exact observed tool-call id, accepted the workflow result, and released the next Nexus frontier once.

Observed result:

```text
ok=true
executionSurface=workflow_execute
handoffId=e3803723-3561-41fe-9d60-f6f9014f96d8
runId=e77dc1e2-0f9b-461a-ae2c-bb8efcec2740
status=done
preflightNonce=3766c96a-bfda-4c15-b22d-6b4adf43234e
preflightReceiptDigest=bc32d3f30c6c92d60f31a7531d21276bfcb0c7aba77bf0693f4b9a2615895e90
preflightRegistryId=a6b456f3e4598520030e83b6b69b453fca65f49517fba26197c55ed4ddbd03f2
vaultCallCount=1
nexusReleaseCount=1
```

The result came from the real Vault-to-orchestrator `workflow_execute` owner path. It was not a synthetic tool receipt. The production materialization manifest remained enforced by owner preflight.

## Retained rollback and cleanup posture

All rollback sources remain present at their exact commits:

```text
edb96b46eabe59f0269a65b875c8f468c29a2cbe  immediate rollback
c70967acd34dd321f889ca48f97ce0f5e0c31e7e  retained predecessor
0a4025a6b895b65e2128b972be8169cc99640428  validated baseline rollback
```

The mode-`0600` pre-switch settings backup and before/after hashes remain under the evidence root. Rollback is: atomically restore `settings.before.json`, fresh-start Pi, require all ten package entries and all closed-owner tool paths to return to `edb96b46`, and preserve the failed candidate for diagnosis.

No source root, backup, active worktree, candidate, branch, or historical divergence was removed. Cleanup remains explicitly deferred until final-main activation and canonical-history adjudication authorize it.
