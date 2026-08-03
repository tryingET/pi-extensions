---
summary: "AK-4152 closure note for repaired visible matrix peer launch, exact ACK/FINAL report-back, and bounded live dogfood."
read_when:
  - "Reviewing AK-4152 or the July 2026 matrix peer launch/report-back repair."
  - "Needing live evidence that candidate_peer_spawn reaches the controller Ghostty surface and reports through exact peer ids."
type: "validation"
status: "verified"
date: "2026-08-03"
task: "AK-4152"
system4d:
  container: "Repo-scoped verification of visible matrix candidate launch and report-back."
  compass: "Keep visible peer execution correlated, controller-verifiable, and communication-only."
  engine: "Confirm repair lineage -> prepare two matrix lanes -> authorize and launch sequentially -> watch ACK/FINAL -> verify Git lineage -> lifecycle-v2 closeout -> package checks."
  fog:
    risks:
      - "Mistaking PEER_FINAL for durable evidence or cleanup authority."
      - "Launching multiple candidates despite admission-v2 maxActiveAdmissions=1."
      - "Deleting a worktree or branch outside lifecycle-v2."
---

# Matrix peer launch and report-back repair — AK-4152

## Result

AK-4152 is verified without a new runtime patch. The repair was already present on current `main` through these descendant commits:

- `500dd6a6354c56bb7750755aa1fb6eb178478c08` — `fix(little-helpers): target controller Ghostty tabs`
- `6751938adbe5c8d3d0b83dac1ea5c4898bbcc3f9` — `fix(little-helpers): keep visible peers alive`

The first commit targets the controller Ghostty process through its exact user-D-Bus peer when available. The second makes activation fire-and-forget with `busctl --expect-reply=no`, terminates option parsing before the embedded Ghostty argv, and treats a killed executor result as launch failure. Current report-back code additionally requires an exact session id for default intercom mode and emits a literal two-message `PEER_ACK` / `PEER_FINAL` contract.

A fresh two-cell matrix dogfood then observed no launch or report-back blockers:

```text
matrix_peer_lifecycle_blockers = 0
```

## Matrix dogfood

The orchestrator prepared two visible `candidate_peer_spawn` lanes for exact task `4152`, repository cwd, and controller target:

```text
session-019fc2af-97af-7ec9-8af2-1f891a00bece
```

Admission v2 currently allows one active admission globally and for this repository, so the two-cell matrix ran sequentially rather than bypassing the capacity membrane.

| Cell | Scenario | Peer run | Protocol result | Controller Git result | Disposition |
| --- | --- | --- | --- | --- | --- |
| `cell-01-01` | controller-targeted visible Ghostty launch | `candidatepeer-msczgk4v-f1a012ac` | ACK=1, FINAL=1, duplicates=0, violations=0 | exact worktree/branch at `5be92d398e96055aae14b65b25415628be9f66eb`; clean status and empty diff | reject/ignore; no patch |
| `cell-02-01` | exact intercom ACK/FINAL report-back and watch | `candidatepeer-msczqq4u-f2552991` | ACK=1, FINAL=1, duplicates=0, violations=0 | exact worktree/branch at `5be92d398e96055aae14b65b25415628be9f66eb`; clean status and empty diff | reject/ignore; no patch |

Both registry records reported:

- `launch.status = launched`
- `launch.launchMode = tab`
- `launch.sessionMode = clean`
- exact `parentPeerTarget`
- launch note `targeted controller Ghostty process 2093892 through :1.298044`

Both peers sent the literal ACK as their first action and exactly one FINAL as their last report. The controller independently inspected branch, worktree, base OID, status, changed files, and `git diff --check`; peer text was not used as Git or completion proof.

The controller retained the exact final `peer_watch` tool results and matrix checkpoint tool result from its Pi session as `controller-protocol-and-checkpoint-snapshot.json` under the owner-only evidence root. Snapshot SHA-256: `326bd2ef2a639527cdc6d3124869bc010e0e6912b6c9b3d1b985941816113960`. The selected source entry ids are `a9c45ed5` and `aebfd8c6` for the two final protocol-ledger snapshots and `81f7baef` for the accepted checkpoint. Those entries retain message ids `7560856f-50cc-4aa5-94ef-043c12f98c6b`, `7440a61b-233b-45b7-afb4-ee033cabd305`, `13092632-7594-45c6-a162-22da38e207c3`, and `38f5b24a-39e6-449b-8a4f-8c9d0c7d0775` in ACK-then-FINAL order. The snapshot was extracted with `jq`; it preserves controller protocol observation but remains non-authoritative until attached to AK as evidence.

After both controller verifications, the exact prepared matrix checkpoint was accepted. That checkpoint exposed but did not execute optional pi-autoresearch bind/measure/export calls. No candidate-result packet was necessary because both candidates had no diff and were dispositioned as rejected/ignore before lifecycle closeout.

## Lifecycle closeout

Each lane used the source-owned lifecycle-v2 path. No raw worktree or branch deletion occurred.

| Peer run | Lifecycle resource | Verified archive digest | Terminal receipt digest | Admission result |
| --- | --- | --- | --- | --- |
| `candidatepeer-msczgk4v-f1a012ac` | `cpr-ca76cb48e11a38b1acf25cf0` | `2b7a5d08ab8a194fed7cf6ab5b4eb43be1b2231b94a4b631b6390a1a756007a2` | `761b2c65c64c430039e2c0e066fce559fe717d2b112a82d7c7afc8720cab53fc` | released after `terminal_cleaned` |
| `candidatepeer-msczqq4u-f2552991` | `cpr-6801b8983efc37d26568cbb1` | `3e68338db6c74d9f8a90b9b93cdb08e728568db80f0d9ac90fc7077c4cb1e5b2` | `aa5f60f55c83d179948eae52db900a6c8d9fe9acc1bfb08aca74810edb2444e6` | released after `terminal_cleaned` |

The exact peer process group was terminated only after restoration archive verification. Cleanup then consumed separate expiring authorization, recorded exact worktree-removal and branch-deletion observations, reached `cleaned`, and released each admission against its canonical terminal record. Final admission pressure was zero active admissions, zero unresolved resources, and zero unresolved bytes.

Owner-only dogfood artifacts are retained at:

```text
~/.local/state/pi-quests/matrix-peer-dogfood/ak4152-20260803/
```

The root contains controller Git checks, admission inputs/results, lifecycle inventory/review/disposition/archive/authorization/cleanup/release results, process-closure receipts, full package-check logs, and the checksummed protocol/checkpoint snapshot.

## Verification

Observed passing checks:

```text
node --test \
  packages/pi-little-helpers/tests/sidequest.test.mjs \
  packages/pi-little-helpers/tests/candidate-peer.test.mjs
# 31 passed, 0 failed

npm --prefix packages/pi-peer-messaging run check
# 46 passed, 0 failed

npm --prefix packages/pi-little-helpers run check
# 234 passed, 0 failed

npm --prefix packages/pi-society-orchestrator run check
# 361 passed, 0 failed
```

The package checks also completed their quick release/packaging gates. The expected npm registry guards refused dry-run publication over existing versions; no publication occurred. Existing brownfield file-budget findings remained warn-only and were not introduced or expanded by this documentation-only closeout.

## Boundaries

- Intercom messages remain communication-only.
- The checkpoint token is a controller confirmation string, not cryptographic proof.
- Controller Git inspection and lifecycle receipts supplied verification.
- No candidate patch was adopted.
- No install, reload, push, publication, merge, or production cleanup occurred.
- Unrelated dirty repository files were neither edited nor staged.
