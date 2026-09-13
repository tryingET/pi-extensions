---
summary: "AK5597 offline provisioning failures and source corrections; no successful provisioning or SDK qualification."
type: reference
---

# Offline provisioning source review — NOT execution admission

## V4 retained failure and EOF-aware source correction (unexecuted)

Per parent dispatch, freeze `w44wc6vr` passed48fixtures8921; V4 admission8932
was consumed by failure8933: `ValueError:OBS_MOUNT_SET:P0:U0:M240`, no npm,
retained run. Reviewer `dispatch-1789066754307` identifies a proven API defect:
unbuffered FileIO permits nonempty short reads, so one `.read(maximum + 1)`
is not proof of EOF. This is a plausible actual cause, NOT captured cause proof.

Only `proc_read` changes production behavior: accumulate nonempty byte chunks
on the same open descriptor to explicit EOF, requesting only the remaining
`maximum + 1` budget; overflow/nonbytes/None fail closed with the fixed bound
ValueError. No zero/unbounded read, reopen or retry; exceptions propagate and
the context manager closes. Strict mounts/four optional covers and all namespace,
FD, resource, settlement and export semantics remain unchanged.

Five new deterministic methods (53 total) are authored, NOT RUN: midline reads,
empty/exact bounds, separately arriving overflow, one-byte request/call bounds,
exception/nonbytes/no-progress closure, and real-reader mocked observations plus
host validation of267synthetic mounts split27+240. The27-row prefix alone has
P0/U0/M240; malformed, genuinely missing and unknown mounts still have refusal
assertions. `open` is patched in real function globals; no live proc fixture reads.
This is source coverage, not passing-fixture or runtime evidence. Only worker,
tests and this note were edited; predecessor files remain unchanged. The earlier
inventory/status sections below are historical. Next: independent source/effect
review, then separate parent fixture admission; no runtime retry or cleanup here.

## Third attempt and finite protective-proc compatibility proposal

Fixed diagnostic codes passed43fixtures under8901; fullfreeze djpmqqag digest
`906297ff05945f1dc13e7ddb750a4f1daea35d370123a9858d1c1d470194c3a9`.
Task5629 separately preserved and removed ONLY the second failed run (8910).
V3 packet `ak5597-offline-provision-v3.515Lfmp2` passed source/effect8912 and
freshowner8913/8914; ONE admission8915 was consumed.8916 records retained failure
`run-1789067092-501e579f2072e15f`, device50/inode412959640: control1214bytes,
worker1585bytes, no pre-node/install/export, no npm commands. Worker reports
`ValueError:OBS_MOUNT_SET`. All262input7code12launchpins and4oldmanifest97record
hashes match before/after. Actual extra/missing mount names were NOT captured.

Source decision8917 follows independent review `dispatch-1789067400565`, not a
claim that those historical extras were known: tagged bwrap0.12 source1380–1427
conditionally self-binds exactly four private-proc paths readonly. Latest source
requires every base mount and permits ONLY optional `/proc/sys`, `/proc/sysrq-trigger`,
`/proc/irq`, `/proc/bus`. Each must be procfs, exact corresponding procRoot, same
procDevice as the private `/proc` anchor, and mount flags ro/nosuid/nodev/noexec
with no rw. Superblock rw is allowed because readonly is a per-mount property.
Missing base mounts, unknown extras/descendants, writable or unrelated-proc covers
remain rejected; helper argv, private namespaces/PID1/caps/FD/input guards unchanged.

Worker parses root/device ONLY for proc rows from its already-bounded mountinfo
read. Worker and host validate the same explicit metadata contract independently.
Refusals can record only fixed four-bit presence and saturating unknown/missing
counts in existing error text, not unexpected paths, argv or environment.
Five new pure methods exercise all16 subsets in mocked worker observations and
host validation, plus malformed/duplicate/propagated/writable/wrong-root/device/
missing/unknown metadata and diagnostic non-disclosure.48methods authored, not yet
run or implementation-reviewed. No tracer, new mount, relaxed arbitrary allowance,
new runtime admission or third-run cleanup follows from this source proposal.

Review8918 caught a fixture-only binding error BEFORE execution: replacing a
SimpleNamespace attribute does not patch functions' original exec globals. The
corrected fixture patches observations.__globals__, installs a fail-fast worker
open sentinel, and asserts exactly two synthetic proc reads with their bounds.
No live proc fixture read occurred; testing remained unadmitted. Count saturation
and invalid numeric diagnostics are also covered synthetically. This corrected
fixture still requires fresh review/admission before its first execution.


## Historical second attempt: pre-Node refusal, exact predicate not captured

Projection fix passed40fixtures under8882, fullfreeze fb1iv2tl digest
`557ce7004e9f31c68d84640526cabaa1ec0acb2a91f2a0e8fa4cd9214674f5fd`.
Separately scoped5628 removed ONLY the first failed run after complete custody,
reviewedPLAN/APPLY and independent postcheck8892. Its failure record remains.

Corrected packet `ak5597-offline-provision-v2.KGV8cqhI` passed review8894 and
fresh owner gates8895/8896; admission8897 was consumed by ONE attempt.8898 records
failure: retained run `run-1789063627-7bcf1886874b764f`, device50/inode412692566,
control1214bytes and worker.json1571bytes only, no pre-node.json or export.
Worker reports errorValueError, null preNode hash, commands[], logbytes0,
settledtrue/reaped0/terminationtrue. All262input7code12launchbeforeafterpins and
4oldmanifest96recordhashes match. Source ordering narrows failure to limit setting
or observations before preparation, not an identified failing guard. Terminating
settlement with zero children does not imply descendant killing was needed.

Independent failure review `dispatch-1789063835450` found lost diagnostics, not
a deterministic runtime mismatch. Latest source adds only fixed allowlisted codes
to the existing worker.error field and constant phase classification. Limit values,
order, guards, export gate and no-Node-before-readiness boundary are unchanged.
Unknown/multiargument/sensitive exception text is never serialized. Each unchanged
setrlimit call maps ValueError to its fixed resource name. Three additional pure
fixture methods cover mappings/non-disclosure and mocked unchanged limit calls.
43fixtures authored; latest diagnostic correction NOT YET tested/reviewed.
No raw traces, extra receipt protocol or relaxed guard is introduced. No new job or
cleanup is authorized; second failed run remains intact pending separate owner work.


## Historical first real attempt: admission consumed

Cursor correction passed all37fixtures under8874, source freeze
`ak5597-root-source-freeze.h31_kgww` digest
`c413e849d6eb30f39d47d500629c608f5bccd47019d3a8006969316949a75122`.
Exact input packet `ak5597-offline-inventory-proposal.4iVAtTWi` contains262pins/
179220132bytes, independently reviewed8875. Fresh owner checks8876/8877 passed;
exact admission8878 was executed ONCE and failed (8879).

Retained run `run-1789060402-34392cd7e67d2418` dev50/ino412508522 has only
control manifest and empty work/tmp; export parent is empty. Owner/driver exit1,
262input+7code+12launch before/after pins and4oldmanifest/95record hashes match.
No successful provisioning, SDK qualification, CI or landing follows. No cleanup
or retry occurred; new job requires separate fresh review/admission and any
capacity disposition must be separately scoped to workstation ownership.

Independent failure review `dispatch-1789060455192` proves one deterministic
source/input mismatch: host source `/usr/lib/ld-linux-x86-64.so.2` also appears
as the legitimate guest target of the separate loader alias. The old global
substring disclosure guard necessarily rejects that approved cross-row spelling.
This is a likely failure cause, not captured actual exception-stage evidence.

Bounded source correction: `private_projection` validates the strict data schema,
exact projected rows and export-parent exclusion, then excludes ONLY validated
guest target fields from host-source disclosure scanning. Both loader targets
and pins remain. Three new pure tests cover concrete alias spellings, injected
private fields/targets/export paths and changed projected inputs.40tests authored;
this latest correction is NOT YET tested/reviewed. Earlier assertions below that
all source was unexecuted are preserved authoring history, not current status.

## Parent fixture result and bounded correction

Evidence8871 records the first37fixture run: exit1, two errors at `unexpected
/work roots`, unchanged source/Python/libpython pins. No npm/SDK/helper/runtime
work occurred. Failure receipts remain in `ak5597-provision-parent.Z9sM1Faf/pure37`
under pi-quests TMPDIR. Full failing source is preserved in
`ak5597-root-source-freeze.l57m3ltt`, digest
`8eda451b35a015c0cb3e6959bab503acb266c0bc311fcf00d0676cf72cfa2019`.

Tree exporter now opens a fresh nofollow directory description for each listing,
matching the predecessor's documented directory-cursor correction without requiring
npm directories to have0700 mode. Positive roundtrip already exercises root opened
before population and repeated export. Negative tree/limit/trailing-data assertions
now require their intended error, preventing early unrelated guards from passing
vacuously. This cursor correction later passed8874; see latest section above.

The remaining original source-only narrative describes authoring before this parent
fixture run; it must not override the observed failure above.

Controller session01a08914 retains exact root-task authority. The initial change created
only six provisioning-prefixed Python files and this note. The bounded correction
edits four of those Python files and this note; no additional files. No Python, tests,
Node/npm/package commands, provisioning, extraction, network, runtime scans,
installation, git actions, or AK mutations were executed. Static file reads,
edits, line counts and SHA256 calculations are the evidence here, not behavior proof.

The supplied predecessor freeze is p0jnb43k,
`fe77af1fde18998d88dc0062cdf7ea910a46897955df6bc4f23b05e9d4501240`.
Its aggregate was not independently reconstructed. All eleven pre-existing
`artifact-*.py` files have matching before/after SHA256 values; no existing
acquisition, observation, source or configuration file was edited.

## New source inventory

Paths below are relative to `scripts/pi-host-compatibility-canary/`.

| File | SHA256 |
| --- | --- |
| artifact-provision.py | `7d1d622a0904631e0e6c40fd7cb3c2f6532ef91e9ef44e256a441b6ffffc22ca` |
| artifact-provision-contract.py | `954b9d471f1e8fc6240a6c187ebeb5b34b5b415cac30e303bc1997406af7a04e` |
| artifact-provision-tree.py | `6e46f823d8f9a3c4c1edab1f7269bfb474a5d33fa60eeedb99be0c9b90ae64a6` |
| artifact-provision-lifetime.py | `858c96615cb0273a2cc9f09ea6247942ff20b3c3591ca839d4e7865bedabe546` |
| artifact-provision-worker.py | `f2840a1f896102569b4f5ca69e21c58f5c0a5b35663cf11dc7cd375ab642ae09` |
| artifact-provision-tests.py | `bfd66ac669dcfd4f6d927594629ce1264655a9c077f59e7e1e4318440c314039` |

Code files remain below 500 LOC/50KB. The single test file remains
within the explicitly permitted test budget of 1000 LOC/80KB; no split was added. Utility loading pins unchanged
`artifact-contract.py` (`336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543`)
and `artifact-driver.py` (`c4dfc47f1bd97a0bba736097dd839e1745b68713be731adfae54efe9dc11fc82`).
Only strict file/hash/JSON primitives and sealed inputs, Cancellation,
require_d154 and directory_identity are reused; acquisition's 256-mount schema
and flat exporter remain untouched and are not provisioning paths.

## Implemented source boundary

New exact review/input/data/receipt schemas bind review, source, inventory,
projection, acquisition-manifest and proposed-root digests. Preflight validates
private parent identities, unused destinations, coherent runtime control attribution,
D154/heavy-job attribution, interpreter/bwrap identities, disjoint inputs and
all sealed bytes/SRI before disk creation or subprocess launch. References and
control attribution are not authenticated authorization.

The inventory permits at most 512 unique per-file role/source/target pins and
256MiB total: exact Node22.22.2, seven separately pinned Node ELF libraries,
Python closure, five worker code files, exact 165 SDK archives, intact npm seed,
and proposed package/lock. Worker data excludes host sources/export parent.
No runnable review or concrete closure manifest was created.

Argv mandates private user/PID/mount/IPC/UTS/network namespaces, readonly root
and proc, cleared environment/capabilities, new session, die-with-parent, and
trusted Python as PID1. Worker records and validates PID/ns/capability/FD/mount/
input observations before Node; host independently checks their receipt schemas
and bindings. Effective environment is reset to sandbox HOME/TMPDIR/PATH and
explicit npm config (including disabled npm debug-file logging).

Only `/out` is host-directory-bound. All npm state resides on `/work` tmpfs.
Seed extraction is bounded, nofollow, collision/link/special/privileged-mode
rejecting; only path PAX metadata is accepted. SDK archives remain intact and
are passed in frozen manifest order to 165 serial offline ignore-scripts cache
adds, then one ci with dev/optional/no-bin-links. No retry, online fallback,
additional 29 shrinkwrap versions, native loads or SDK scenarios are included.

The worker exports all seven `/work` roots to deterministic uncompressed tar,
retaining hidden lock, empties and executable modes. Limits: 1GiB tar,
100000 entries, depth64, 1024-byte paths, 64MiB/member; inventory additionally
caps at32MiB. Host streams validation, rechecks root hashes and inventory, and
never extracts. Links/specials/privileged modes fail rather than disappear.

## Lifetime, bounds and failure semantics

The inert tagged bwrap v0.12.0 source at
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-fd-leak-review.3zv5p2SA/bubblewrap-v0.12.0.c`
hashes to `3f17ee26057cae9d660801ca8d9ba84722f1bafdcd072d5151ee1c64eeeb15f4`.
Lines954–980 and2112–2133 establish that `--size 1073741824 --tmpfs /work`
sets the next tmpfs's byte-size option. Lines3007–3021,3439 and the monitor's
waitpid path552–570 establish the proposed as-PID1/no-eventfd topology;
no sync-fd is supplied. This is source reasoning, not installed-binary proof.

PID1 reaps with waitpid(-1) through ECHILD; ordinary direct-child exit is
insufficient. Failure uses namespace-local TERM/KILL and bounded settlement;
host export requires normal helper reap plus verified PID1 all-child settlement.
Unknown/emergency settlement refuses export/success. Per-command walls are
120s/600s; the 2700s emergency latch spans the operation, with bounded helper
termination waits of5+5s. Post-settlement preservation can continue after
cancellation, but cannot return success; filesystem calls are not hard-latency
bounded. No generic tracer/probe/runner was added.

Captured npm output is bounded below8MiB, reserving64KiB for discarded helper
diagnostics; overflow fails. Node heap512MiB is not RSS. AS16GiB, NOFILE256,
CPU650/660s, FSIZE1GiB and disabled core dumps are per-process inherited limits.
The starting1GiB tmpfs bound targets the audited ~127MB expansion, not a hard
inode or total-memory guarantee. No aggregate cgroup/process/inode limit exists.
Trusted npm/source execution is not a hostile-code containment claim.

Failure leaves exclusive `.partial`/`.copy-partial` files; no cleanup occurs.
`incomplete.json` alone never proves completion. Final `export.json` distinguishes
copy completion, tree completion and provisioning `good`; success also requires
uncancelled driver exit and independent acceptance. Missing/invalid receipts or
unknown settlement leave data only in the owner run. Its retention and canonical
new-run lifecycle remain separately conditional owner authority.

## Parent review and remaining gates

37 focused fixture/fake tests are authored **NOT RUN**. Alongside existing schema,
argv, seed, transport and lifetime fixtures, new tests use the actual worker
sequence/finalization seams (used by run), and actual host export_result. They
cover exact 165+1 order; first/last-cache/ci failure prefixes; cancellation,
missing direct status and unknown settlement; settle-before-export, failure
preservation, root mutation and cancellation vetoes; missing/mismatched receipts,
partial tree/copy failures, and unknown helper rejection. Control tests cover
both states, each attribution, changing reads, and one-read hash/FD identity.
Worker loading is non-main; subprocess/kill/proc/namespace behavior is faked.
One explicit tar-validator double isolates the otherwise-good cancellation path;
it is not tar-validity evidence. No production archives are consumed.
Even syntax compilation was prohibited; no passing-test or runtime claim exists.

Next: independent exact source/effect review; separately authorize tests; pin
complete Python/ELF closure and installed bwrap/interpreter; verify strict mount,
FD, seed-PAX, logging and virtual-address assumptions against that exact runtime.
The canonical wrapper needs no new hook, handshake or staging job. A control
read changing during its single read pass fails closed without retry. Then fresh
workstation-owner/D154 gates and exact execution admission.

Acquisition8857 is not provisioning admission. Per supplied dispatch, AK8861
conditionally accepts only the three audited equivalent duplicate pairs for a
FUTURE admitted extraction; this implementation adds no general duplicate
exception. The supplied audit and reviewer dispatch-1789055492670 are predecessor
inputs, not independent review of these new files. No execution is authorized here.

## Bounded correction: runtime control attribution, not advance pinning

Per controller relay, reviewer dispatch-1789057283241 supported the intended
boundary but identified missing orchestration coverage and agreed that the new
`controlSha256` review pin was structurally impossible before canonical wrapper
creation of the random run, inode, PID and time values. The field and its digest
validation are removed; obsolete reviews containing it are rejected as unknown.

`control_snapshot`, used directly by preflight, opens the actual manifest once
through unchanged bounded nofollow primitives. Before/after identity comes from
the same FD; the same stable bytes are decoded, validated and hashed. Canonical
D154 checks and wrapperPID=ppid, task, label, run path/id, root dev/ino,
admitted-or-running state and childPID None-or-self checks are retained unchanged.
The resulting digest, FD identity and observed state are recorded in host
supervision and export as `controlObservation`, explicitly `authority=false`.
They are excluded from worker data. A coherent admitted observation can transition
to running later: no export-time reread, job-long immutability, retry or owner
coordination mechanism is introduced.

The controller-preserved initial eight-file inventory at
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-provision-initial-source.92mEI1XH/SHA256SUMS`
was statically hashed and matches
`646a26472ab54aaf01b6d93ab292da209c4bb7af5a43418b8bd715f593f58141`.
Lifetime/tree source and acquisition/audit/observation predecessors remain
unchanged. This correction still requires independent review; no tests, syntax
compilation, provisioning or runtime verification occurred.
