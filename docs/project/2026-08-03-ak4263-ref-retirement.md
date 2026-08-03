---
summary: "AK-4581 receipt for reviewed retirement of redundant AK-4263 preservation refs while retaining unique and pending-task history."
read_when:
  - "Auditing refs/preserve/ak-4263 after repository convergence."
  - "Restoring an AK-4263 preservation ref from the verified campaign bundle."
type: "evidence"
status: "complete"
---

# AK-4263 preservation-ref retirement

## Result

AK-4581 reviewed all 16 refs under `refs/preserve/ak-4263/` against current `main` at `bd59f92d49d3da08825fa6037cc7e2b7987f1861`, non-preserve reachability, AK owner state, and a verified complete Git bundle.

Observed effects:

- **14 refs retired** with `git update-ref -d <ref> <expected-old-oid>` compare-and-swap;
- **2 refs retained** because they remain unique and owner-blocked;
- **0 branches, worktrees, tags, notes refs, remote-tracking refs, or `refs/pi-rewind/*` refs changed** by the retirement;
- **no object pruning, push, publication, reset, rebase, merge, or worktree cleanup** occurred.

This is a ref-retirement receipt, not evidence that every historical topic was accepted into current `main`. The verified bundle preserves every pre-effect tip, including the two retained tips and the retired non-main `local-main` tip.

## Per-ref disposition

| Ref suffix | OID | Disposition | Proof or blocker |
|---|---|---|---|
| `controller-audit-649a9036` | `649a9036bf0b99f8ac0a3633c8721adeec9aa457` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `deep-review-f5384ff5` | `f5384ff524a92e78ea9af07c4d5c634bb31356d1` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `detached-9982214e` | `9982214e78d01dee6bee5a9dbbd2b9c6bcf6feaf` | **retained** | no non-preserve containing ref; AK-4263 retained it and prior deletion reviews conflicted; no accepted owner retirement disposition |
| `final-candidate-53481dbc` | `53481dbcd9c9ce56075a1f5f55f2821e0a8da3f0` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `final-main-7c5b7bfa` | `7c5b7bfab872fadfba203e35eb9d1c47ae9b93b3` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `final-main-ee469a8e` | `ee469a8e66f4b7bdba37f3cc4ff635de7b5daead` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `live-asc-9570427c` | `9570427c639418b936050ce4370e897ec7a3ca6d` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `live-predecessor-c70967ac` | `c70967acd34dd321f889ca48f97ce0f5e0c31e7e` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `live-rollback-edb96b46` | `edb96b46eabe59f0269a65b875c8f468c29a2cbe` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `live-sci-26fd79e5` | `26fd79e5d44c2cf24a48be2a9e89e28a5c1d00c1` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `live-selected-a0a72e4c` | `a0a72e4c7ee8ae77420048e77ed61777f9aa0235` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `live-vault-29199dd1` | `29199dd121b9ee6326f9a4a55cd2cb0f5c59449b` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `local-main-b6b5dcef` | `b6b5dcef8cffa8a677fe0f1f7b0b74a5ce55ad68` | retired CAS | reachable from exact non-preserve ref `refs/remotes/origin/archive/pr62-d2e-transfer-workflow-gate-20260731`; exact tip in verified bundle |
| `origin-main-7ae6b344` | `7ae6b3440fd6606593b7243d6782158703a6e278` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `runtime-snapshot-0a4025a6` | `0a4025a6b895b65e2128b972be8169cc99640428` | retired CAS | ancestor of current `main`; exact tip in verified bundle |
| `task-4257-cad43d58` | `cad43d58922916de4de00a5d4747d947a5249a1b` | **retained** | no non-preserve containing ref; AK-4257 remains pending and owns the unique Toolbox D2E hardening history |

The retained set is therefore exactly:

```text
refs/preserve/ak-4263/detached-9982214e
refs/preserve/ak-4263/task-4257-cad43d58
```

## Archive and restoration proof

The campaign evidence root is:

```text
~/.local/state/pi-quests/ref-retirement/pi-extensions-ak4581-20260803
```

Key immutable evidence:

| Artifact | SHA-256 |
|---|---|
| `preflight/refs.tsv` | `5e532e3c813cbc3df0a4f2ea2ab0652e88a9c43ba2f2d08df28779797e9b7ccf` |
| `preflight/manifest.json` | `15d3cd9c43dbc322b91d6b71bf95df02f31b8f42b897f8cdb52420cc494cec5b` |
| `archive/ak4263-preservation-refs.bundle` | `3345c061b8bd92ad867bd494dee2d0769070231125931861a8e574e622a971aa` |
| `receipts/effects.tsv` | `e9e6a28179575ce8a84d4a26d558684fb9b045244eddc0a4bdcd3b2b497463a7` |
| `receipts/preserve-refs.after.tsv` | `3a029bb5b716d70b46b7bfffb72c185fb4ee6ce96ddab2fa67425908f6630f7b` |
| `receipts/restoration.heads` | `d489f5cc1b9cfaaedd94ea08c9cf168025208a42284162b69f3a5644278c9c88` |

`git bundle verify` reported complete history and all 16 exact pre-effect ref/OID heads. A fresh temporary bare repository fetched `refs/preserve/ak-4263/*` from the bundle into a separate restore namespace; its normalized 16-head set exactly matched the pre-effect manifest. The temporary repository was then removed. The bundle is about 34 MB and remains the restoration source for every retired tip.

To restore one ref, first verify the bundle checksum and inspect `preflight/refs.tsv`, then use the expected OID from that manifest. Do not infer an OID from a short suffix.

## Effect and drift validation

The execution script:

1. revalidated manifest and bundle checksums;
2. re-read all 16 live refs and exact OIDs;
3. rechecked current-main ancestry or the exact archive-ref coverage exception;
4. issued only expected-old-OID CAS deletions for the 14 reviewed rows;
5. verified the exact two-ref retained set;
6. compared all heads, remote-tracking refs, tags, notes, and rewind refs against the pre-effect snapshot;
7. compared worktree topology against the stable one-worktree baseline;
8. reverified bundle heads after effects.

The first script invocation failed during pre-effect row-digest validation because an empty containing-ref set had been rendered as the literal `none`. It produced a zero-byte effects receipt and all 16 live refs remained unchanged. That no-effect attempt is recorded in `receipts/attempt1-no-effect.json`. Validation then normalized `none` back to the preflight empty value; the successful invocation completed all 14 CAS effects and postchecks.

## Owner follow-ups

- `detached-9982214e` remains retained until an owner resolves the conflicting historical deletion reviews and proves whether its history is integrated, superseded, or intentionally historical.
- `task-4257-cad43d58` remains retained while AK-4257 is pending. Its owner may propose retirement only after task disposition and exact history coverage are durable.
- This task did not change the ASC rewind keepalive ref or notes refs; their policies remain separate owner work.
