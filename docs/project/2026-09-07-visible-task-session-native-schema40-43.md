---
summary: "Task5513 frozen schema40/43 native integration: 42/42 pass, reached SQL/readback faults and repinned off:null refusals; not public G2/live/task closeout."
read_when:
  - "Reviewing the latest task5513 native AK/Pi compatibility evidence."
  - "Reconciling prior schema40, native fault-control and I04 coverage gaps."
type: implementation_evidence
---

# Task5513 — frozen schema40 / schema43 continuation

**Observed: 42 passed, 0 failed, 0 skipped/cancelled/TODO; exit 0.**
The final full run took **259.593 seconds** on Linux x64 / Node26.8.1.
There are **21 cases per schema**, including eight total pre-reservation refusals;
this is not a claim that all 42 cases spawn a worker. Four historical pending entries
were removed only after their newly executable coverage passed. **Task5513/final5482
are not closed; public G2, installed/live readiness and parent authority remain separate.**

The [prior 16-case result](2026-09-07-visible-task-session-native-interop.md), old packet,
logs and committed evidence are preserved unchanged. They attest to their older pair,
not to this continuation. Committed projections:
[schema40](2026-09-07-visible-task-session-native-schema40.evidence.json) and
[schema43](2026-09-07-visible-task-session-native-schema43.evidence.json).

## Frozen inputs and provenance

| Binding | Exact identity |
| --- | --- |
| AK source / owner evidence | `4e621c977e21b886d142263138ed0e134c737b2c` / `c7ab0e196a9776f2c4911f6d7bcf9baacaf26a9e` |
| Native fixture ELF SHA256 | `67ed5173468d30aadc53c3e22d76572d1441e4a4705709bdd7ac4646c629e7f3` |
| Candidate debug ELF SHA256 | `dabb339f6179deb4f17bb055e2348b01ed0ca2031b021cfdf05e484f0c6f8fc1` — copied/hash-verified only, **not invoked** |
| Source identity SHA256 | `ec98d94757024e393cb47c145fceb0e9aac106f26d5175a6e1d6e756e753966e` |
| Pi I04 fix / evidence | `bbf557e445b9a662af314cf790d9c0082b98fc29` / `817b08d799a7163bb3abc4d83e15ea675793ec5f` |
| Little-helpers 0.9.0 tar SHA256 | `e538a0640879838713dfe5a24a0a55ebcf9a090ca1cbbcc868592b526b34c813` |
| Society-orchestrator 0.11.5 tar SHA256 | `32356f3d3cfa67f9d2aca59cf9b2b7e09418d8af72dbcbd4b6694083963beddd` |
| Packed host build digest | `660436a776fc93c781285f1376cbf5113b43d28fc3100ad7272d172f92e58e91` |
| Packet | `$TMPDIR/task5513-frozen-88as5L/` |
| Pins SHA256 | `60d02ffb3402c07df5ad7ea7756117b25afb274e424a63889927c750174022ff` |

Inputs came from `task5479-review-artifacts.05Ex3E8d` and
`task5480-pack-proof-S6vnqv`. **186 AK files** were materialized from exact Git blobs
and matched against the export manifest. Its 187th entry, ignored `.cargo/config.toml`,
was separately hash-matched as a **non-Git, non-runtime build appendix**, not represented
as tracked source. No build or use of its configured target directory occurred.
The export records an earlier dirty build HEAD; exact source-byte correspondence is
established against 4e621c9, not inferred from that HEAD. Default-feature candidate
excludes `task-session-test-support`; only the unshipped fixture includes it.

Both reviewed tarballs were frozen and every packaged file compared with the copied
runtime. All **20,861** runtime/dependency file/link entries are inventoried; external
symlinks refuse. The matrix imports both actual packed adapters, compares their startup
encodings, delivers the orchestrator-produced payload to the real native supervisor,
and interprets actual admission/recovery data through both adapters. Their public
producer fences are explicitly asserted. Actual packed little-helpers `runHost` and
SDK serialization/write-tool execution are used through the existing internal seam.

Packet source, tar, ELF and complete dependency inventories verify before and after
execution. The runner additionally freezes/checks root harness source hashes; the
summarizer refuses changed harness bytes, incomplete case membership or a subset log.
Its recorded pre-landing observer HEAD is `226d9987aa0e847163d2e77146779ae75f62aacb`;
the scoped source hashes identify the exact subsequently committed harness, not an
inference that the old HEAD already contained it. No independent native/Pi rebuild
was done: source-to-emission provenance still relies on the reviewed owner export.

## Executed matrix and reach proof

The original **16 scenarios run on both schemas**: builtin and owner alias recovery;
baseline drift; native result loss; host/helper death; envelope/profile/pin mismatch;
namespace withdrawal; domain drift after first send; actual lease expiration; CLOSED
loss; persistence failure; corrupted T1; policy drift before T2. Positive paths prove
pending/v1 → claimed/v2 → pending/v3, actual serialized SDK sends/write result, durable
T1 binding, T2/private CLOSED ordering, independent flock exclusion/unlock, CLOEXEC
and ordinary-exec noninheritance. Missing effect disposition and recovery replay refuse.
Pi occupancy flags remain retained rather than inferred retired by AK recovery.

Schema40 uses `--initialize-40` on an exclusively new synthetic DB; schema43 uses
`--initialize`. Raw native oracles show the exact migration version before/after.
Schema40 baselines additionally lack the schema41+ composition/impact tables;
positive full-family comparisons and recovery preserve the schema. No deployed DB,
live policy compatibility or default-candidate execution is inferred from this proof.

| New case, each schema | Independent observed reach and result |
| --- | --- |
| `claim-statement` | Control consumption; reached `claim_statement_trap_installed`; observed `actual_claim_statement_failed`. The source installs a real native SQL `RAISE(ABORT)` trap after baseline/catalog validation inside the claim transaction. Full exposed authority families/catalog equal the baseline afterward: pending/v1, null claimant, zero claim events/receipts, zero residual fault triggers. |
| `postcommit-readback` | Control consumption; reached `committed_claim_then_storage_corruption`; observed `actual_independent_readback_failed`. The actual native claim commits before bounded stored-scope corruption makes independent readback fail. Raw oracle: claimed/v2 by the exact incarnation, one claim event and receipt, invalid stored scope, no fault trigger. No automatic recovery/dispatch. |
| `owner-off-null-empty` | Fully repinned reasoning=true/all-null capabilities, requested off: `owner_model_reasoning_capabilities_invalid`. |
| `owner-off-null-nonreasoning` | Fully repinned reasoning=false/all-null capabilities, requested off: same explicit capability refusal. |
| `owner-off-null-missing` | Otherwise valid non-off capabilities, off=null, requested off: `reasoning_profile_unsupported`. |

Both native faults produce actual `UNRESOLVED / indeterminate`, null claim/readback
result fields and durable DENIED T1; zero sends/tools and no recovery are asserted.
That result alone would **not** pass: consumed/reached/observed marker identities,
actual phases, binding, custody and native DB oracles must all agree. Arming itself
is independently shown not to mutate the DB. Baseline denial and process-result loss
remain different scenarios; neither substitutes for either new native fault.

All six off:null cases independently materialize/recompute source, model and profile
pins; they do not use a rejecting production loader to mint the pins. Parent launch
and child profile loader both refuse precisely. Plan/viewer/supervisor/fetch counters
are all zero; state/profile/source bytes, empty attempts and native pending/v1 oracle
remain unchanged. No digest mismatch is accepted as the intended reasoning refusal.

Valid owner aliases on **both schemas** preserve requested
`synthetic-owner/synthetic-requested-alias` and resolved
`synthetic-wire-provider/synthetic-native-wire-model` in intent, dispatch and terminal
receipts and the actual serialized model request. Requested high with valid off="none"
metadata succeeds, including explicit native recovery; there is no builtin fallback.

## Evidence, validation and reproducibility

Final log: `$TMPDIR/task5513-latest-native-verified.log`, SHA256
`f27312505d88813b1a74dd98cc0b593ed31afe43956124283a7eeb74aa2f429c`.
Full raw evidence: `$TMPDIR/task5513-latest-native-raw-v2.json`, SHA256
`741a284c965cf4b4f193f1329ffd8b85086fb7cd39d6ff0b0c45944afb2f1ad1`.
Each committed per-schema projection is 47,177 bytes and binds the raw manifest,
per-case native observations, fault markers, receipts, model identities and trace
hashes. Its evidence-inventory digest covers the fuller raw per-file hash map.

The initial full continuation passed 42 cases with four then-retained historical TODOs
(exit 78); the final run has no TODOs. A subsequent compact evidence export exceeded
the file budget and correctly failed; no native test failed. Its raw output is retained.
Compaction was corrected without dropping the full raw evidence, then all 42 cases
were rerun against the final hash-bound harness. No production defect surfaced in
this bounded matrix. Static/oracle checks, scoped Biome, whitespace and ordinary root
precommit hooks are the landing validations; full monorepo/release gates are not claimed.

```bash
node scripts/task-session-native-freeze.mjs \
  /home/tryinget/ai-society/softwareco/owned/agent-kernel \
  4e621c977e21b886d142263138ed0e134c737b2c \
  "$TMPDIR/task5479-review-artifacts.05Ex3E8d" \
  "$TMPDIR/task5480-pack-proof-S6vnqv" 817b08d799a7163bb3abc4d83e15ea675793ec5f
node scripts/task-session-native-integration.mjs run <new-packet>/pins.json
node scripts/task-session-native-evidence.mjs <new-packet>/pins.json \
  <full-run.log> <new-raw.json> <new-compact.json>
# Creates new-compact-schema40.json and new-compact-schema43.json; refuses overwrites.
```

## Limits and next authority handoff

Internal-constructor source compatibility is proven for this frozen pair only.
Public-entrypoint/G2, installed/live identity, positive enrollment, real Ghostty,
provider canaries, exhaustive DB/FK/catalog/crash effects and parent R6/I04 disposition
are **not** established. These matrix passes do not widen policy or remove public
producer/host fences. Broader defect work belongs to parent/5479/5480, not this harness.

All DBs/resources/credentials/policy were newly synthetic; the provider port receives
real serialized requests but returns local synthetic SSE, with no external HTTP call.
No installed AK/candidate command, authoritative DB access/copy, live config/auth,
desktop action, install/activation, shared source/dist/node_modules edit, other-worker
action or retained-scratch cleanup occurred. Parent should review this evidence alongside
independent R6/I04 reviews and explicitly decide remaining gates and task5513/final5482
closeout. No AK task mutation or completion declaration was made here.
