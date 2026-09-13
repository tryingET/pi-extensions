---
summary: "AK5597 source-only explicit readiness/acquisition proposal; current bytes require independent review."
read_when:
  - "Reviewing the bounded AK5597 artifact probe and conditional acquisition effect plan."
---

# AK5597 artifact acquisition — current source review packet

Current observer corrections, exact diffs/hashes and separate unexecuted fake-only test plan:
[2026-09-10 helper observation source review](2026-09-10-helper-observation-source-review.md).
Historical evidence and freeze inventories below are not current-source acceptance.

## Latest observed runtime failure and source-only correction

The proposal/history below predates the following events. Parent completed the
41-case pure suite, obtained exact operator approval8755, and launched ONE D154
no-network probe: `run-1788975594-b7458b42334cdea9`. Sandbox child exited0, but
strict verification correctly failed and driver/owner exited1. Raw observed FD
set was `[0,1,2,5,121]`, expected `[0,1,2,5]`. No archive acquisition, npm/SDK code,
retry or cleanup followed. Other raw observations do not constitute a full pass.
Evidence8763 records failure, not qualification.

The complete failed run was preserved outside the owner runs root in
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-probe-custody.ANoFHb7w`:
7 entries,22478 bytes, matching two-pass inventories and original-baseline
owner-readable reference scan complete/active[]/8protected. Original retained
run and failure record remain untouched;8764 is preservation, not cleanup permission.

The extra FD is strongly inferred to be the inherited host output-directory
capability: the old `--bind /proc/self/fd/N /out` did not consume it. Parent changed
only that common mount argument to `--bind-fd N /out`, preserving the strict FD
allowlist. Installed0.12 help advertises it; retained public0.12 source checks
mounted device/inode then closes `op->fd`. Source is in
`ak5597-fd-leak-review.3zv5p2SA`, SHA
`3f17ee26057cae9d660801ca8d9ba84722f1bafdcd072d5151ee1c64eeeb15f4`.
This is source reasoning, not proof of the corrected installed-helper behavior.

Read-only review `dispatch-1788977202027` accepted the narrow source fix for
bounded pure testing. Parent then ran41 pure tests successfully, including exact
bind-fd tuples in both modes: `ak5597-bind-fd-pure.eWPe5d1u`. No corrected runtime
probe has run. Published launch-review088b0ae9 binds the old driver and must NOT
be reused. New source/review hashes, an unused export destination, explicit
permission (or bounded delegation), fresh owner admission and an available retained
run slot remain required. Generic cleanup is forbidden; any future cleanup may
address only the explicitly authorized new failed run through owner guards after
full preservation. Older runs, baselines, failure records and unrelated work remain
protected. Existing packet hash tables are historical relative to this correction.

## Status, scope, and historical evidence

**SOURCE ONLY. Current revision has not been tested, compiled, launched, or approved.**
This packet supersedes predecessor source/effect inventories, not their evidence history.
Only `scripts/pi-host-compatibility-canary/artifact*.py` and this packet were edited in
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-source.nINZEw58/repo`.
No Python/project execution, test, network, namespace, bwrap, heavy-job, lifecycle,
cleanup, AK mutation, git-ref operation, package activation, or frozen-input edit occurred.
Source inspection, text edits, line counts and source SHA-256 hashing are not runtime proof.
All unrelated deltas were outside the write set.

Dispatch-reported history, **not rerun or independently revalidated here**:

- First pure run: `ak5597-artifact-pure.lw9ZWBjG`, **21 tests: 17 passed, 4 failed**;
  retained under `/home/tryinget/.local/state/pi-quests/tmp/`. No acquisition followed.
- `ak5597-dir-cursor.IXZD2zJl`: retained-dirfd enumeration remained stale after a write;
  opening a new file description exposed the entry. This is a local observation, not
  universal filesystem root-cause proof. The correction opens `.` relative to the pinned
  dirfd, checks identity before/after, and closes only the fresh FD. **Preserved unchanged**;
  inventory equality, ownership, hash and emptiness guards were not relaxed.
- Latest prior pure run: `/home/tryinget/.local/state/pi-quests/tmp/ak5597-artifact-fd-fix.Ejp8PQzl`,
  **22 tests passed before the parent's tiny `/usr/lib` contract edit**. Neither that edit
  nor this readiness extension inherits a test pass.
- Reviewer `dispatch-1788966143390` accepted the prior corrections. This is not review of
  these new bytes and not workload approval. Original packet placement history remains
  retained in `ak5597-packet-placement.NarkNM4n`; no evidence was deleted here.
- Only D154 read-only preflight passed, with eight protected entries. **No actual
  acquisition/workload approval exists in the supplied dispatch.**

## Source-only correction — dispatch-1788970766776

The preceding readiness revision had **35 authored tests, unexecuted**. Review found three
source blockers; this correction adds no execution evidence or approval:

1. **Cancellation through settlement:** one driver-wide nonraising latch remains installed
   through preflight, child supervision, final EOF/poll, wait/reap, exports and owned-FD close.
   No cleanup SIG_IGN window exists. Checks gate each new child and phase, receipt validation,
   copy progression, final acceptance and status emission. Recorded cancellation makes a
   child/result unhealthy even with return code 0; probe verification rejects cancelled
   supervision. No later acquisition is authorized by stale healthy supervision. Original
   signal handlers restore only after the operation has stopped/settled. This is not atomic
   cancellation of an already-initiated effect: receipts/status are snapshots, final exits
   remain mandatory, and partial evidence remains retained. Driver status v3 explicitly uses
   acquisitionCopyComplete and acceptancePending=true, not an acquisition acceptance claim.
2. **Transient readdir FD:** after listing its private proc FD directory, the observer fstats
   every reported descriptor except its own observer FD. Only EBADF for an already-closed
   transient is ignored. Extra LIVE descriptors remain visible and fail the exact allowlist;
   all other fstat errors fail. No actual proc/namespace observation was run here.
3. **Inert worker import:** imports no longer set HTTP private hooks or parser limits.
   Explicit validated acquisition mode enters a sequential scoped HTTP policy; probe never
   enters it. The scope requires CPython stock http.client._read_headers and limits
   65536/100, installs strict hook and 8192/32 limits, and restores the exact prior tuple on
   normal or exceptional exit. Overlapping scopes, including different runpy-loaded worker
   instances, refuse without replacing the active hook. This is not a thread-safe generic
   global policy manager; frozen CPython/stdlib source compatibility remains an owner gate.
   Parser pure tests use this explicit scope. Unknown mode precedes hooks/limits/effects.

Current count: **41 authored methods (35 retained/adapted + 6 new); none run or compiled**.
Historical 22 passes do not apply to these bytes. Metadata observation may be rerun only after
review and separate effect permission; existing toolchain facts remain metadata, not runtime
proof. No operational frozen inputs, launch-review JSON or authorization reference was created.

## Authority and D154 boundary (unchanged)

Exact review hash, `authorizationReference`, task/label, environment and control JSON
are attribution/checkable inputs, **not self-authenticating authorization**. No approval
reference or runnable launch-review JSON is manufactured here. Owner must independently
verify actual permission for the selected mode and exact effect set before launch.

Only the separately approved D154 named-run age-deferral wrapper path is proposed;
never fall back to ordinary `heavy-job run`, whose old-state prune/reconciliation can
precede driver refusal. Driver preflight cannot undo parent cleanup or grant approval.
Required control attribution remains exactly:

- schema `ai-society-heavy-job-retention-deferral/v1`, mode `named-run-age-only`;
- string decision `154`, run `run-1788137699-9655c994d9827ead`;
- old manifest SHA-256
  `3048a36f394c095946a69be97f41e225677711cb42170b71d4560beb92efaeba`;
- bounded old-root device/inode, scan scope `readable-current-uid`.

The old-manifest hash came from the dispatch's `.ak5597-d154-preflight.DXXXXhUE`, not a
new observation here. Missing/wrong/default attribution refuses. Existing parent/run
identity, wrapper PID, task/label/state, child PID and empty-TMPDIR checks are preserved.
Driver/export/probe code never deletes, renames or overwrites evidence. Owner wrapper
new-run cleanup remains outside these files: the proposed D154 invocation includes
`--keep-failure-scratch`, subject to separately reviewed retention/admission limits
(previous source described <=2 GiB/run and retained count <5 plus reference deferrals).
That flag is not a retention guarantee or permission to prune old runs. Preserve partial
new evidence; any wrapper cleanup concerns only its proven NEW run under owner policy.

## Parent toolchain metadata — not frozen launch inputs or namespace proof

Supplied inert fact directory:
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-toolchain-facts.OwOPxkRS`.

- Python 3.14.7, actual `/usr/bin/python3.14`, SHA-256
  `d78f9cf7178ecff09963551399855543c297f37ac207e626228bfe43cb26a70c`.
- 92 observed stdlib files, approximately 3 MiB; 24 ELFs, 12 resolved library bindings,
  no unresolved `DT_NEEDED` in that observation.
- CA: 121 certificates, 185311 bytes, SHA-256
  `8c97794a899a32666593979dc7adfaec8bda2b420eb092ff0d987e44ad0bf6ea`.
- Twelve public IPv4 DNS snapshot entries; bwrap 0.12.0.

These are dispatch-reported metadata, **not loader/import/namespace/temp-placement proof**.
Actual source paths, per-file `/usr/lib` ELF targets, stdlib provenance, CA/IP validity and
hashes still need separate freezing/review. Never bind `/usr` or other host directories,
use globs, add site/dist-packages, or introduce LD/PYTHON/default-trust fallback.
The earlier curl-only staging-plan exception remains a proposal for this trusted Python
stdlib data worker, requiring explicit owner acceptance, not silently adopted policy.

Known input identities retained from the predecessor packet:

| File under `ak5597-acquisition-inputs.TAcEcBy8` | SHA-256 |
| --- | --- |
| `acquisition-inputs.json` | `1c411d9d51d7ba083ebdd19c35d8c55fc8c3d77ff492071e50bd8eed567f7ce8` |
| `npm-12.0.2.tgz` | `5dbb86c71d07a1957f2e90734092dd6a58bdcd9ebc2d8d41ca1c6e6a21d364e1` |
| `composition-receipt-corrected.json` | `19b9107431c7c035b2934e390441496bb1cda0703373c949c32226f9ad4321bc` |

The manifest declares 165 unique SDK network archives / 167 locations, plus one
3,045,132-byte npm seed, totaling 166 archive inputs. Signature/tar audit and composition
claims were not rerun. Runtime seed checks remain length, SHA-256 and SRI SHA-512.
No graph install, archive-content audit, SDK load, five-body execution or qualification
is implemented or claimed by acquisition, much less by readiness.

## Source and schema deltas

- `artifact-contract.py`: retains fresh-description directory enumeration and all existing
  input/FD guards. Parent's per-file `/usr/lib` library branch is preserved and now also
  forbids site/dist-packages. Canonical traversal rejection remains independent of regex.
  Mount cap narrows to **9..256 files**, target length <=256, total <=256 MiB.
- `artifact-probe.py` (NEW): bounded proc/read-only/write-open observations, actual Python
  executable hash, strict pure receipt comparison, post-reap output verification.
- `artifact-worker.py`: requires exactly `--probe` or `--acquire`, before limits/output
  effects. Both verify every mounted file, manifest, seed and explicit CA. Probe returns
  before seed copying, archive creation, socket construction or fetch.
- `artifact-driver.py`: launch-review **v2** with required `mode`; first child always probe,
  then verify/export before an optional second acquisition child using a NEW output dir.
  Same sealed inputs are rewound for both children. Helper receives only approved TMPDIR.
- `artifact-export.py`: separate bounded probe/supervisor receipt export. Acquisition
  allowlist/copy/fsync/failure guards and three-part acceptance requirement remain intact.
- `artifact-tests.py`: **41 authored test methods** (previous 35 retained/adapted, 6 new; original 22 preserved).
  **Zero current-revision tests or compilations executed.**

Launch-review JSON has exactly:
`schema task label mode authorizationReference codeSha256 driverPythonSha256 bwrapSha256
 toolchainPath toolchainSha256 scratchRunsRoot exportParent exportName`.
Schema = `ak5597-artifact-launch-review.v2`, task = integer 5597, label =
`ak5597-artifact-acquisition`, mode = **`probe` or `acquire`, no default**.
`codeSha256` has exactly five runtime filenames: contract, worker, export, driver, probe.
The test file is reviewed/hashes inventoried but not loaded or mounted by the job.
Unknown/missing mode refuses before memfd/disk/process effects. Bootstrap initially reads
only the hash-pinned review/source bytes; strict duplicate/schema parsing precedes preflight.

Toolchain JSON schema stays `ak5597-artifact-toolchain.v1`, exactly
`schema task label publicIPv4 mounts`. Each mount has exactly
`source target sha256 bytes role`; canonical nofollow regular sources, no overlapping targets.
Required roles: python `/runtime/bin/python3`, ca `/inputs/ca.pem`, manifest
`/inputs/acquisition.json`, seed `/inputs/npm-12.0.2.tgz`, one each; **three code files**
`/code/artifact-contract.py`, `/code/artifact-worker.py`, `/code/artifact-probe.py`.
At least one stdlib file under `/runtime/lib/python3.<minor>/` and one `.so` library under
`/lib/`, `/lib64/`, `/usr/lib/` or `/runtime/lib/`; no site/dist-packages. Code projections
must match reviewed source directory, hash and length. Public IPv4 list stays 1..32 unique
canonical public addresses even in probe-only mode (data validation, not a DNS lookup).

`scratchRunsRoot` and `exportParent` remain exactly `{path, dev, ino}`, owned 0700 dirs.
Export parent is below `/home/tryinget/.local/state/pi-quests/tmp/`, outside scratch runs;
its path must not appear in toolchain bytes. Export name is a new absent basename beginning
`ak5597-artifacts-`. Heavy attribution requires task 5597, matching label, immediate run
under reviewed root named `run-<epoch>-<16-hex>`, and `TMPDIR=<run>/work/tmp` owned and empty.
Control schema stays `ai-society-heavy-job/v1`; run inode/device/path/task/label, parent wrapper
PID, admitted/running state and driver-or-unset child PID must match, plus D154 above.

## Exact proposed effect order (not permission to run)

1. Owner starts the hash-frozen driver with reviewed Python `-I -S -B`, review path and
   independently reviewed review SHA-256, through the D154 wrapper path. Bootstrap validates mode and hashes all five runtime sources before loading siblings.
   The driver-wide cancellation handler then covers the operation through FD settlement;
   preflight hashes the actual driver interpreter and installed
   root-owned, executable, non-set-id/non-group-or-other-writable `/usr/bin/bwrap`.
   Reject ambient `LD_*`/`PYTHON*`; this cannot retroactively secure a compromised loader.
2. Complete every source/input/schema/hash/directory/control/D154/empty-TMPDIR preflight
   before output creation or Popen. Bound and seal file snapshots in memfds; manifest/seed
   hashes checked. Parent observes its own user/pid/mnt/ipc/uts/net identities for comparison.
3. Create only NEW `$TMPDIR/probe` (0700), retain dirfd. Helper host environment is exactly
   `{'TMPDIR': <approved NEW job TMPDIR>}`, **not `{}` and not inherited ambient environment**.
   No loader/proxy/session variables. This revision does not create a helper subdirectory.
   Exact `--ro-bind-data` helper temporary placement still needs separately approved runtime
   probe/trace; TMPDIR passing is intent, not confinement proof. Reject outside-new-run writes.
4. First bwrap child uses this shape (FDs and mounts are reviewed data, not shell expansion):

   ```text
   /usr/bin/bwrap --unshare-user --unshare-pid --unshare-ipc --unshare-uts
     --unshare-net --new-session --die-with-parent --cap-drop ALL
     --hostname ak5597-artifacts --clearenv
     --proc /proc --remount-ro /proc
     [each frozen file: --perms <0500 python/library; 0400 otherwise>
       --ro-bind-data <sealed-FD> <exact-target>]
     --perms 0400 --ro-bind-data <sealed-config-FD> /inputs/toolchain.json
     --bind /proc/self/fd/<NEW-probe-dirfd> /out --chdir /out
     --remount-ro / -- /runtime/bin/python3 -I -S -B /code/artifact-worker.py --probe
   ```

   Worker launch environment is cleared, with no `--setenv` or fallback. No host `/`, `/usr`,
   `/home`, `/etc`, device/socket directories or export-parent binds. `/proc` is private and
   read-only, **probe only**, for trusted self-introspection. Stdin is read-only `/dev/null`;
   stdout/stderr are supervised pipes. Only sealed input/config and new output FDs inherit.
5. Worker import is HTTP-policy-inert. Validated probe mode never installs the acquisition
   parser policy. Worker verifies mounted SHA-256/lengths, exact manifest, seed SHA-256/SHA-512, and explicit
   CA load. Probe creates **no network sockets/connections**, copies no seed/archive, and
   runs no artifact code. It reports actual `/proc/self/exe` SHA-256, executable/version/text/
   prefix/base-prefix/isolated flags; own six namespace identities; observed/allowed FDs;
   per-file/config hashes, exact mountinfo read-only flags AND statvfs read-only status.
   For each input/config it attempts O_WRONLY|O_NOFOLLOW|O_NONBLOCK **without O_CREAT/O_TRUNC**;
   closes any unexpectedly accepted FD without writing bytes. Expected EROFS/EACCES/EPERM
   alone is insufficient: mount read-only observations must also agree.
6. Probe creates only retained `probe-write.bin` containing `ak5597-readiness-write-v1\n`
   (26 bytes), fsyncs it and `/out`, rehashes it, then writes/fsyncs bounded
   `probe-receipt.json` (schema `ak5597-artifact-probe.v1`, status `observed`). No acquisition
   count/marker/success: `acquisition=false`, `qualification=false`. `/` and `/proc` must be
   read-only, `/proc` type proc, `/out` rw and not ST_RDONLY. This is a trusted observation,
   not hostile-kernel proof, socket syscall auditing or full power-loss durability proof.
7. Supervisor keeps the driver-wide nonraising cancellation handler through final poll/wait
   and snapshots cancellation after settlement. It returns only after reaping its **own proven
   NEW Popen child**, or records
   construction failure with no child. Parent strictly verifies receipt/schema/child exit,
   all six namespaces differ from its own, actual Python hash equals frozen python role,
   executable/prefix/base-prefix `/runtime` layout, version >=3.11 matching stdlib minor,
   CA loaded, exactly FDs 0/1/2 plus owned output-dirfd, every hash/RO/denied-open check,
   and expected write result. Parent independently hashes retained write specimen and
   requires exactly specimen+probe receipt in fresh directory enumeration.
8. Export after reap using existing nofollow/exclusive/owned-FD copy+rehash/fsync discipline.
   NEW `exportParent/exportName/` contains **only `probe-receipt.json` and
   `supervisor-receipt.json`** for probe-only or probe failure. Invalid/missing/failed probe
   produces a bounded distinct `ak5597-artifact-probe-failure.v1` receipt and stops, exit 1;
   invalid original bytes/partial outputs stay in the new run, never copied unchecked.
   Export I/O failure propagates failure, leaves partial new evidence, and also prevents
   acquisition. Probe-only returns 0 only after verified/exported readiness, never acquisition.
9. **Only mode `acquire`, only after successful readiness and probe receipt export:** rewind
   the SAME sealed file/config FDs, create NEW `$TMPDIR/acquisition`, and launch a separate
   rechecked bwrap child. Same mounts/options except `--share-net` replaces `--unshare-net`,
   omit `/proc` creation/remount, use new output dirfd and explicit worker `--acquire`.
   Validated acquisition installs the scoped strict CPython HTTP policy, repeats input/CA
   checks, copies inert seed, then performs the existing 165 fixed-public-IP
   HTTPS fetches. No child or existing output is reused. No missing-probe fallback exists.
10. After acquisition child reap, unchanged exporter verifies exactly 166 allowlisted archives
    and worker receipt, all hashes/lengths/counts/seed/budget and no extra entries, then copies
    into NEW `exportName/acquisition/`. Its supervisor binds the verified probe receipt hash.
    Failed acquisition exports only its failure receipts; failed copy preserves partials.
    `export-receipt.json` is a **copy-stage marker only**, not sufficient acceptance.

## Trusted data-only egress and bounds (preserved unless stated)

Acquisition approval must **explicitly permit shared-NET trusted data-only egress**. Endpoint
rules are enforced by the trusted worker, not a kernel firewall or private-NET SDK sandbox.
A single owner-approved acquisition job may conditionally probe then fetch. Alternatively,
operator may approve probe-only separately; that approval does not permit later fetch.
No install/extract/npm/Node/SDK execution, qualification or subsequent job is included.

Existing network rules: numeric public AF_INET TCP 443 only, frozen-list round robin, one
request per archive, no retry/resume/redirect/DNS/proxy/auth/netrc/cookie/session/default CA.
TLS >=1.2, mandatory hostname verification/SNI `registry.npmjs.org`, peer checks before/after
TLS, ALPN HTTP/1.1 or absent. Canonical exact HTTPS registry tarball path, no metadata/query/
fragment/credential/port/escape/traversal. Fixed GET headers: Host, Accept octet-stream,
Accept-Encoding identity, Connection close, fixed User-Agent.

Strict physical HTTP status/header CRLF/token/control parsing precedes HTTPMessage
normalization, rejects parser defects, all non-200 including interim/redirect, non-HTTP/1.1,
TE/CE/Content-Range, folding, ambiguous/missing/duplicate/noncanonical length, truncation and
wrong SRI. CPython private `_read_headers` hook compatibility still needs frozen-runtime proof.
Status/header lines <=8192 bytes; <=31 physical headers plus terminating blank line.

- Streams <=256 KiB, each archive <=64 MiB, cumulative <=512 MiB including seed/failed partials.
- Worker per-child CPU <=300s, AS <=512 MiB, FSIZE <=64 MiB, NOFILE <=64, CORE=0, or stricter
  inherited hard bounds. Worker alarm <=1800s; acquisition archive <=120s, socket timeout 30s.
- Supervisor per-child <=1900s, combined stdout/stderr <=64 KiB plus one 4096-byte read;
  discard raw logs, export only counts/hashes. At most two sequential children, so conditional
  acquisition can consume twice the per-child limits; parent preflight/export I/O is not
  covered by child deadlines. No host quiescence, disk-latency or SIGKILL guarantee.
- Mounts <=256 files / <=256 MiB; tool/config JSON <=1 MiB; probe mountinfo <=1 MiB;
  each receipt <=128 KiB. Descriptor preflight requires mounts+64 headroom. Probe closes its
  seed FD, excludes only its own observer FD, and fstats other entries: ignore only EBADF
  closed transients, retain extra live FDs, fail every other fstat error.
- Sealed snapshots/helper copies/kernel memory need separate owner heavy-job headroom.
  These are application/body limits, not TLS/TCP wire-byte or helper/kernel-memory bounds.

## Acceptance and remaining gates

Neither verified trusted probe nor readable acquisition marker proves hostile-kernel isolation,
helper temp confinement, complete power-loss durability, wrapper success, authorization, or SDK
qualification. **Successful driver exit + successful owner-wrapper exit + independent exported
receipt/allowlist/hash/length verification are all still required**, for the selected mode.
Probe receipt `observed` and supervisor `probeVerified` are never acquisition acceptance.
Markers precede final directory fsyncs/exits; post-marker fsync failures and recorded cancellation
remain fatal. A prior complete copy-stage marker/status cannot override a later cancellation
or nonzero driver exit. Current driver status v3 explicitly marks acceptance pending.

1. Independently review **current source hashes** and both mode-specific effect plans. Stop
   before testing in this source-only dispatch. Prior reviewer acceptance/passes do not apply.
2. Separately authorize/run the bounded pure suite using reviewed Python `-I -S -B` and
   explicit owned 0700 `AK5597_PURE_TEST_PARENT`. Keep every new fixture; no cleanup.
3. Separately freeze/review exact Python/stdlib/ELF/CA/IP/toolchain/review inputs, export/run
   identities, D154 wrapper and chosen mode. Settle loader/import/helper support and actual
   temp-placement/mount/FD/resource/namespace behavior with approved runtime probe/trace.
   No broad mounts, environment fallback, guessed approval reference, or acquisition on failure.
4. Obtain actual owner workload permission and fresh admission for the exact mode/effects;
   one conditional acquisition approval can cover probe then trusted egress, or use separate
   probe-only approval. This packet provides neither authorization nor a ready-to-run job.
5. Independently verify driver and wrapper exits and exported evidence. Any later private-NET
   install/SDK qualification requires a separate owner-approved job and owner surface.

## Authored pure coverage and effect plan — NOT RUN

41 methods, all 35 preceding methods and original 22 predecessor guards retained. Existing coverage includes manifest/hash/SRI/
counts/duplicates, URL/IP rejection, fake socket/SNI/peer/no-DNS/request behavior, physical
HTTP parser and error boundaries, budgets/partials/chunks/seed accounting, D154 rejection,
nofollow/exclusive/alias/symlink/hardlink/copy/metadata-race guards, synthetic 166-body export,
copy failure, post-marker fsync failure, and fresh-dirfd regression.

Adaptations/additions cover explicit mode argv/schema data, `/usr/lib/libc.so.6` library target
plus inert regular-FD positive and broad/glob/traversal/site/dist negatives, exact helper code
mount, fake good/missing/forged probe receipts, each unchanged namespace, every mount's RO/
denied-open/hash/length failure, Python/prefix/version/CA/FD/write/fsync failures, failed/unreaped
child, no acquisition before verified AND exported readiness, probe-only no-acquire, unknown
mode before effects, denied-write-open flags/no input writes, receipt-only probe export and
missing specimen rejection. Worker main is exercised **only with fake limits/CA/FD/input/probe
operations** and failing socket/fetch/copy sentinels. Probe producer uses only fake proc/mount/
FD/hash/write/fsync observations; these cannot supply kernel/runtime proof. New cases cover
closed readdir transients, extra live FDs and unexpected fstat errors; import identity and scoped
HTTP restoration/overlap; validated acquisition entering its policy with fake work only;
cancellation at final poll/wait, verify/export/acquisition, final status/settlement, and copy or
post-marker fsync. Popen, selectors, set_blocking, signal installation, child poll/wait/close
and exporter operations are replaced by in-memory fakes in these new cancellation cases.
No actual signal, subprocess, lifecycle, FD/resource-limit change or proc observation occurs.

A later authorized pure run reads reviewed siblings/stdlib and existing acquisition JSON only.
It uses fake transports/BytesIO, synthetic D154 dictionaries, no actual Popen/signal/namespace/
resource-limit changes, DNS/network/TLS, package execution, lifecycle or cleanup. New owned
0700/0600 fixture dirs/files use exclusive dirfds and stay retained. Existing three synthetic
166-body exporter fixtures remain (831 tiny body files across sources/copies), one 256 KiB+17
body, and small negatives. Added probe-export fixture creates two source files and four copied/
synthetic receipts in two new export dirs; regular-library positive adds one inert file.
Allow filesystem metadata/block headroom; these tiny bodies are not SDK tarballs. Mocked
producer/worker/sequence/cancellation/observer checks add only in-memory fake effects. The new
export-cancellation case also mocks all exporter filesystem effects (no additional fixture files).
HTTP policy tests restore the exact original policy even on error; runpy imports do not install it. No current results exist,
including no syntax-compilation result.

## Current source byte inventory

Generated by read-only source hashing, not Python execution. Runtime files remain <=500 lines;
tests <=1000 lines. All five runtime hashes (not test hash) must enter `codeSha256`; the three
worker code mounts must also be frozen with exact source/length/hash. No values are installed
into operational toolchain/review inputs here.

```text
02f0246592dc2e9793d6676fc6b9e8b495927af40d03f9df990bba768112a527  scripts/pi-host-compatibility-canary/artifact-contract.py  (318 lines)
28f14039c3c9f27ac4891afab9bd3abc4e5e7337d08a45d8b6d27aa0584b2402  scripts/pi-host-compatibility-canary/artifact-driver.py  (425 lines)
fcb63927e304baa3a2a59b39622439f11a0d9e30c1245f1703e53abee607d20f  scripts/pi-host-compatibility-canary/artifact-export.py  (189 lines)
abafd17459b34afa00e708f112506925dfb645436cec9e7643b18e92c67bd215  scripts/pi-host-compatibility-canary/artifact-probe.py  (189 lines)
94f825c3dfba5ce2ba91e1478c5f506346f9b010213ad47a2ae3aaf651fd3d96  scripts/pi-host-compatibility-canary/artifact-tests.py  (962 lines)
90ca8fd9b21476aee6e672367efda5367e78e4ab0916b71f643328db9790473a  scripts/pi-host-compatibility-canary/artifact-worker.py  (274 lines)
```

## Helper-only observation dispatch — source-blocker stop (not implementation)

This appended section records the CURRENT inspection; preceding packets and hash tables
remain historical, not relabelled. Dispatch reports corrected diagnostic passed8803,
consumed its old proposal, complete SFjeCz freeze digest
`74d269aed050bb63ef129bab0005c787c0eea52a71025d80f1c31d9310ba3c4b`
verified8793, and three other roots/93 records unchanged. None was rerun or scanned here.
The task continues; no task completion, acquisition permission or runtime approval follows.

**Decision: invoke the contract's materially-larger-safe-minimum stop. No implementation
or new test fixtures were authored.** This is a source recommendation, not an assertion
that helper-only tracing is impossible. A prefix/collector alone would leave the required
lineage/placement acceptance gate unimplemented; an always-unqualified collector would be
scaffolding rather than the requested verified observation path. Independent review of
this recommendation and a bounded verifier design should precede further source work.

### Concrete source blockers and minimum recommended change

All locations below are in `scripts/pi-host-compatibility-canary/` in the clone identified
in the inventory. They are source observations, not execution results.

1. `artifact-driver.py:285-332` supervises one Popen child, discards stderr, and calls
   `child.wait()` without a timeout at line322. Its `childReaped` means that direct child.
   Prefixing strace would change that identity to the tracer. `artifact-probe.py:123-127`
   checks this field, and `artifact-export.py:164-166` requires it even for failure export.
   Neither establishes helper descendants' exits. Do not reuse this supervisor unchanged,
   fabricate helper reaping, or route unsettled observation failure through export_probe.
2. There is no trace grammar, lineage verifier or placement state machine in these sources.
   EOF + tracer exit0 + strict probe FD receipt cannot establish the temporary backing graph.
   Before adding a launch path, specify and implement a PURE bounded helper-specific verifier
   in proposed `artifact-observation.py`: launch identity; every successful clone/fork edge;
   host/namespace PID correlation; unfinished/resumed syscall pairing; exec/FD inheritance;
   each terminal event; successful NEWNS/propagation/tmpfs/pivot transitions; temporary open
   generations, raw write/copy FD association, chmod, bind and unlink. Reject unknown relevant
   edges, CLONE_UNTRACED, detach, decoder truncation, unmatched events and unexplained stderr.
   Shared stderr can mix trace records and helper diagnostics; it is not intrinsically a
   framed trace channel. Unknown/interleaved fragments must disqualify, not be discarded.
3. Keep the rubric narrower than a universal syscall sandbox: for each expected
   `len(mounts)+1` ro-bind-data temporary, require creation after the proven private tmpfs
   transition, copy/chmod on that same open generation, binding into newroot, and source
   close/unlink. Resolve dirfds, inherited/shared FD tables, reuse and pivot aliases; printed
   `/tmp` or `/bindfile*` names alone are insufficient. Separately account for output bind-fd
   identity/consumption. Label tmpfs-instance/open-lifetime evidence as such, not per-file
   inode/mount-ID proof. Missing evidence leaves placement inconclusive. The existing strict
   `[0,1,2,workerout]` test and verify_output's exact TWO raw entries remain unchanged.
4. Only after that verifier has a reviewable finite acceptance surface, add an explicit
   observer-only schema/mode and hash-pinned host module in driver bootstrap/preflight.
   Current bootstrap accepts only probe/acquire and exactly five source hashes; review v2
   must not silently acquire observation behavior. Leave ordinary paths, code mounts,
   contract, worker, probe, toolchain and canonical owner source unchanged. Observer mode
   must have no acquisition transition. Pin the tracer and exact argv/config/module bytes;
   do not publish a launch review or frozen inputs as part of source implementation.
5. Use a distinct observation supervisor with separate tracerCreated/tracerReaped/status,
   helper terminal/lineage evidence and settlementPending fields. The tracer is the only
   direct Popen child; helper terminal evidence is NOT a direct wait/reap receipt. Preserve
   cancellation through bounded kill/reap/drain and export. Signal only the owned unreaped
   Popen/pidfd, never process census, killpg or external PID lookup. On timeout/error, attempt
   bounded tracer settlement and export pending/unqualified even if settlement remains
   unknown; no receipt may claim full descendant settlement. EXITKILL is documented in the
   supplied research, not proven here and not proof for untraced/startup-gap descendants.
6. Extend artifact-export.py with a DISTINCT observation custody path that does not weaken
   existing receipt-only export guards. Before launch create exclusively a private sibling
   outside the owner new run, never in probe /out. Stream existing stderr pipe in <=4096-byte
   chunks directly to a new0600 raw file, persist at most the remaining 8MiB allowance, then
   cancel on overflow. Do not collect whole trace in memory or use a polling-only size cap.
   Bound stdout separately at the existing64KiB policy; stderr is now mixed trace/diagnostic
   custody, NOT a separately bounded helper-log stream. Record counts, retained hash/length,
   overflow/completeness, EOFs, tracer status, cancellation, source/review/argv bindings and
   pending disposition in separately bounded receipts. Preserve empty/partial files, failed
   fsync/copy state and receipts without cleanup/overwrite. No new inherited worker FD.

The proposed tracer would prefix ONLY the newly launched bwrap, outside its sandbox, with
trace-all, raw non-path I/O, no read/write or environment dumps, and explicit relevant
mount/clone/pivot/FD decoding. No -p, -D, privileges, broad binds or changed owner lifetime.
No flags/argv are finalized here: installed manual and native dependency/privacy review
remain gates. The supplied tracer SHA below is dispatch/research data, not a fresh binary
observation. Raw trace can still expose paths, argv and mount metadata; a cap is not redaction.

### Unimplemented coverage and hard gates

Recommended NEW `artifact-observation-tests.py` (not created): fake Popen/streams/selector/
clock/fs/kill/wait fixtures for exact cap and partial writes, empty trace, launch failure,
late cancellation, EOF-with-live-tracer, reaped-tracer-with-open-pipe, kill/wait failure,
reap timeout, export/fsync failure and no automatic acquisition. Pure trace fixtures must
include missing/duplicate/unknown clone and exit edges, PID/FD reuse, split/resumed lines,
diagnostics interleaving, CLONE_UNTRACED/detach, early host-backed temporary, unresolved
bind alias and all required tmpfs-backed temporary transitions. These are recommended
cases, NOT authored/passing coverage. Existing41 test methods and every source byte stay
unchanged; artifact-tests.py already has995 lines, so additions belong in the separate file.

B1 supervision/custody, B2 actual helper observation, B3 finite acceptance verifier,
B4 residual metadata privacy/native tracer review, and B5 fresh owner/per-job authority
remain unresolved. Helper-only placement avoids tracing the whole owner's process census;
it does not solve these gates by itself. No installed-helper/source equivalence, loader
closure, kernel behavior, descendant settlement, physical-write absence or runtime pass is
claimed. Before tests/runtime: independent review of final source/effects/pins, separately
authorized pure tests, a NEW review/export identity and renewed canonical D154 admission
and coordination. Never replay the consumed diagnostic or infer acquisition authority.

### Exact inspection/write inventory

Clone C = `/home/tryinget/.local/state/pi-quests/tmp/ak5597-source.nINZEw58/repo`.
Reloaded its full applicable ancestry (only C/AGENTS.md found), engineering.local.md and
engineering-lane.json; checked both target scripts/docs context chains (no deeper file).
Read all six current artifact Python sources as text. No project/Python/test/compile/import,
tracer/help, network, lock/process/reference scan, cleanup, AK or git-ref mutation occurred.
The sole write is this append to
`C/docs/project/pi-0844-isolated-qualification/2026-09-09-artifact-acquisition-source-review.md`;
its original406 lines are preserved. No new observation module/test file was created.

Read-only SHA256 inventory (paths below relative to C unless absolute):

```text
336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543  scripts/pi-host-compatibility-canary/artifact-contract.py  322 lines / 13112 bytes
ceed7b9c3cda0138f3d95f23ccc587610abb9fa91d68f39eab45f0fd2bd9b927  scripts/pi-host-compatibility-canary/artifact-driver.py  428 lines / 21901 bytes
fcb63927e304baa3a2a59b39622439f11a0d9e30c1245f1703e53abee607d20f  scripts/pi-host-compatibility-canary/artifact-export.py  189 lines / 9477 bytes
03c47a850e579b39158136fc89a448501a5508054ff780441cd3ebff2f12d2d3  scripts/pi-host-compatibility-canary/artifact-probe.py  191 lines / 9915 bytes
6c18a36862d23f1b677bacd57bb3a2c257499d0372c1e6095a8ce6528aa8fb36  scripts/pi-host-compatibility-canary/artifact-tests.py  995 lines / 56017 bytes
90ca8fd9b21476aee6e672367efda5367e78e4ab0916b71f643328db9790473a  scripts/pi-host-compatibility-canary/artifact-worker.py  274 lines / 12094 bytes
9c1b046d2c71148637f6d93b1af3b5ecc76d6758c8373767cd02552c78676a45  source-review document BEFORE this append (406 lines / 29775 bytes)
3fb72d9c83e057c3a6da94cbada23093e71f9230306228b23fa4e071963e9987  /home/tryinget/.local/state/pi-quests/tmp/ak5597-helper-placement-proposal.UKhWAVu4/effect-plan.md
```

Dispatch/research tracer pin, NOT reread here:
`/usr/bin/strace` SHA256
`ca7daa61ec8d0c765ded1d80bdd81820d2d6433272a1bffb2b6111f244a47361`.
Final document/diff hashes are reported externally to avoid self-referential hashing.

## AK5597 bounded helper observation — IMPLEMENTED SOURCE, NOT EXECUTED

This section supersedes the preceding **absence-of-implementation stop**, not its historical
record. Parent explicitly admitted the bounded tracer supervisor and conservative lineage
verifier in this root-only slice. Actual source and 27 additional pure test methods now
exist. They have NOT been imported, compiled, tested, traced or otherwise executed. This
packet is for independent source/effect review; it is neither runtime proof nor a launch
review. Dispatch's corrected untraced passed8803 remains supplied history; its reviewed
invocation is consumed. The whole-ownertrace effect-plan remains BLOCKED and unadopted.

### Mutation inventory and boundary

Only C (`/home/tryinget/.local/state/pi-quests/tmp/ak5597-source.nINZEw58/repo`) was mutated:

- `scripts/pi-host-compatibility-canary/artifact-driver.py`: 13 added lines net, explicit
  observer bootstrap/source loading and dispatch; ordinary argv, phases, supervisor and
  acquisition path unchanged. In particular the old ordinary supervisor's unbounded wait
  is NOT represented as fixed by this distinct observer supervisor.
- `scripts/pi-host-compatibility-canary/artifact-export.py`: 99 appended lines, distinct
  exclusive observation custody/export; original ordinary two-receipt probe export remains.
- NEW `artifact-observation.py`: observer schema/policy/pin/argv binding and orchestration.
- NEW `artifact-observation-supervisor.py`: bounded streaming and owned-tracer settlement.
- NEW `artifact-observation-lineage.py`: finite pure conservative lineage projection.
- NEW `artifact-observation-tests.py`: 27 synthetic-line/fake-only methods. Existing
  `artifact-tests.py` remains byte-identical, with its 41 methods and original intent.
- This existing review document: append only; previous 534 lines preserved.

No worker, probe, contract, toolchain, frozen inputs, packages, canonical owner, lock, AK or
ref changes. No old evidence was overwritten, removed or cleaned. Reloaded C's applicable
context chain (C/AGENTS.md; no deeper target context file found), engineering.local.md and
engineering-lane.json. Read the requested prior append, current artifact sources and the
explicit external BLOCKED effect-plan. Only inert text authoring, targeted file inspection
and source/manual hashes/counts were performed; no Python/project/test/tracer/runtime
commands, imports, compilation, network, process/lock/reference scans or lifecycle effects.

### Exact future review binding (schema specification, not a published launch review)

New mode is ONLY `observe-helper`, with `schema=ak5597-artifact-observation-review.v1`.
The ordinary v2 schema/mode and five-source set cannot silently select observation.
Observer bootstrap requires the original five code names PLUS the three new runtime
modules, exactly eight names, each hash-checked before loading. Tests are not loaded.
The mode has no acquisition transition. It always returns `good=false`, `readiness=false`,
`verifiedProbe=false`, `verifiedRuntimeLineage=false`, `qualification=false`, and driver
exit1, even when capture/export complete. Canonical owner disposition for that expected
inconclusive exit must be separately reviewed; no unconditional retention promise follows.

Top-level review keys remain the ordinary exact field set plus `observer`; mode/schema
are the new values above. Observer config has exactly:

- `schema=ak5597-helper-observer-config.v1`
- `stracePath=/usr/bin/strace`
- `straceSha256=ca7daa61ec8d0c765ded1d80bdd81820d2d6433272a1bffb2b6111f244a47361`
- `purpose=calibration-only-no-readiness`
- `policySha256`: SHA256 of `C.encode(policy())` (sorted compact JSON + LF), binding the
  complete exact prefix, finite dialect/bounds and acceptance rubric in source.
- `helperArgvTemplateSha256`: SHA256 of `C.encode(driver.argv_for(...,'probe'))` with the
  existing 111 rows in original order and FD placeholders `input:0` through `input:110`,
  `config` and `output`. Actual runtime argv and inherited FD list are separately bound
  in supervision; the template does not pretend to know future numeric FD allocations.

The NEW unique exportName must begin `ak5597-artifacts-observation-`. All original owner,
D154 attribution, input sealing, mount/code/manifest hashes, parent identity, new-run and
private-export-boundary checks are reused through an explicit in-memory probe review
projection. This projection is not written as a launch review and is never sent to
ordinary phases/export_probe. Tracer is opened nofollow, checked root-owned, single-link,
executable, non-group/other-writable and non-set-id, hashed and re-stat-bound before launch.
The tracer pin is dispatch/research data fixed in source, not a newly executed binary
observation. No new tracer/native loader closure proof is asserted.

### Prefix and incremental effects

`artifact-observation.py:PREFIX` is the exact source authority for argv. It launches
`/usr/bin/strace -f --kill-on-exit -I 1 --always-show-pid`, trace=all, raw=negated finite
metadata decoder list, read=none, write=none, selected unabbreviated clone/stat structures,
`--decode-fds=path,dev --decode-pids=pidns --quiet=none -s 32 --`, followed directly by
ONLY the NEW existing probe bwrap argv. No shell, env wrapper, -p, -D, -o, detached tracing,
external PID selection, privileges, broad binds, owner wrapping or default-owner fallback.
There is no unsupported-option retry or flag removal. Exact 111 sealed mounts plus config,
worker/probe bytes and strict four-FD guard remain untouched. The only inherited FDs are
those same 111 sealed inputs, config and output dirfd. Trace/export FD and pidfd are NOT
in pass_fds; stdout/stderr remain the existing supervised pipes.

Installed `/usr/share/man/man1/strace.1.gz` was decompressed/read as inert roff text, never
through strace/help/version. Its SHA256 is
`98b8e628a6e05ecd0b7d24bfa4669fab6ea0c8e8cc2b98fbc70a50847b4f7d87`.
Relevant manual text documents `--always-show-pid`, PID-tagged unfinished/resumed examples,
-f, EXITKILL, raw negation, abbreviation, PID/FD annotations and attach/detach/exit notices.
It does NOT calibrate this binary's emitted grammar in these namespaces. EXEC remains
abbreviated; no environment expansion, raw buffer decoding or full I/O dump is requested.
Read/write/ioctl/getdents/readlink/socket buffers remain raw. Decoded paths, argv, mount
options, FD annotations and native diagnostics still present residual privacy exposure.
A byte cap is not redaction; native tracer memory/proc reads, dynamic dependencies and
ptrace perturbation require independent review. No unconditional no-secret/physical-write
or equivalence-to-uninstrumented-helper assertion is made.

Custody is created exclusively after original owner/input preflight and before helper
launch: a new0700 child of the pinned export parent, outside the owner run and outside
probe /out, with new0600 `trace.raw`. This directory is a sibling of other export children,
not an extra entry inside the worker's exact-two-entry output. Existing stderr is streamed
in <=4096-byte reads directly into that FD. Partial os.write progress is individually
counted/hashed. Persisted raw bytes cannot exceed 8MiB; only the remaining allowance is
written, an observed overflow chunk cancels collection, and no rotation/retry/cleanup
occurs. Stdout is discarded/hash-counted with its 64KiB bound (the observed overflow read
can add <=4096 bytes); stderr is now mixed trace/diagnostic custody, not a helper-log claim.
Raw interpretation failure stops interpretation, NOT bounded raw retention for offline
analysis. Raw trace plus at most three128KiB receipts totals <=8MiB+384KiB payload per
new export, excluding directory/filesystem metadata and unchanged new-run probe output.

### Supervision, cancellation and truthful custody

Popen's child is explicitly the TRACER. The new schema exposes tracerCreated/Reaped/status,
not the ordinary childReaped field. pidfd_send_signal(SIGKILL) targets that owned child;
pidfd acquisition failure falls back only to that still-owned Popen object's kill, never
os.kill of a discovered PID, killpg or a process census. Launch/stream/poll/wait/kill errors and
persistent EOF/reap mismatches cannot become normal completion. Transient EOF before reap
or reap before EOF can complete normally once both arrive before the deadline. A persistent
mismatch reaches the1900s timeout, then bounded settlement; it is not an immediate error.
The driver nonraising signal latch remains active through poll, wait, export and FD close.
An unexpected missing supervisor return records creation UNKNOWN and settlement pending,
not fabricated no-child evidence.

Normal application wall budget is1900s, polling <=0.1s. Error/cancellation settlement has
10s and at most101 iterations; waits use timeout=0 only after poll reports a status.
Drain failures disable further drainage but bounded poll/reap attempts continue. Failed
writes/overflow preserve the prefix. No unbounded error wait or descendant killing is
introduced. Stuck Popen/native/kernel/disk/fsync calls and supervisor SIGKILL cannot be
absolutely time-bounded by Python. Tracer reap/EXITKILL do NOT certify descendants: the
receipts always say helperReapedByDriver=false and descendantSettlementCertified=false.
External coordination/disposition for unconfirmed descendants remains a future owner gate;
this source neither holds/replaces owner locks nor authorizes cleanup of the new run.

Distinct export attempts `supervisor-receipt.json`, `probe-receipt.json` and typed
`ak5597-artifact-observation-receipt.v1` in `observation-receipt.json`, always exclusively.
It rereads/re-hashes bounded raw bytes and compares streamed length/hash/metadata, with
nofollow regular/single-link/0600/UID and stable FD/path identity checks. Raw records include
observed byte count, retained length/hash, overflow, write/fsync failure and dev/ino/mode/
UID/link/size/mtime/ctime. Review/code/config/argv bindings and the separate tracer/lineage
receipt are included. Missing metadata or disagreement blocks completion, never guesses.

Only when capture and the synthetic dialect's terminal graph are complete can a bounded
candidate probe receipt be copied after exact-two-entry and specimen hash checks. It remains
UNVERIFIED. There is intentionally NO fabricated helper-reap adapter into P.verify_output:
full strict probe verification is pending independent correlation/review. Otherwise a
separately typed unavailable/unverified probe record is attempted. Partial copy/write,
fsync, cancellation or raw audit failure remains retained and blocks export completion;
failed files are never retried/overwritten. A final fsync failure can occur after the marker:
marker presence is a snapshot, not durability/exit/acceptance proof. If storage cannot write
a failure receipt, absence/partial bytes are failure; no implementation can guarantee
receipt persistence on a failed filesystem. None of these paths authorizes acquisition.

### Conservative lineage coverage and calibration limits

The parser recognizes ONLY its declared PID-bracket stderr projection: initial successful
bwrap exec; successful fork/vfork/clone/clone3 child returns; perPID successful exec and
terminal exit/killed events; signal records; exact perPID unfinished/resumed pairing and
finite non-lineage syscall vocabulary. A child's records may precede the parent's resumed
clone return; final unique-parent connectivity must still resolve to the bwrap root.
It bounds each line/pair32KiB, processes256 and events200000; raw retention has its own cap.
Successful worker exec must name `/runtime/bin/python3` and the unchanged worker `--probe`.
Root exec recognition checks the path, NOT an independently reconstructed full argv; the
actual launch vector has a separate supervisor hash binding. Passive syscall records are
retained but NOT interpreted as topology/FD/object proof.

Missing/duplicate/unconnected edges or exits, PID reuse, detach, CLONE_UNTRACED, unsupported
clone flags (including CLONE_THREAD/CLONE_PARENT), unknown syscalls/ABI/personality notices,
unknown diagnostics or interleaving, truncation, unmatched resumptions and incomplete
capture are inconclusive. Fatal exit with an unfinished syscall also refuses rather than
inventing a completion. Unknown PID-namespace annotations are rejected, not decoded into a
fabricated host-PID mapping. Attach notices alone never prove parentage. The finite grammar
can recognize a synthetic complete graph and distinguish nonzero/signal exits, but ALWAYS
exports calibrated=false and verifiedRuntimeLineage=false. Actual bracket/attach spelling,
clone return annotations, exec abbreviation (notably bwrap's long argv), namespace changes,
thread behavior and other actual emitted forms may be rejected. These are explicit
uncalibrated limits, not a claim that an actual strace run will pass or even launch.

### Acceptance rubric declared BEFORE any future launch

`RUBRIC` in source is hash-bound as part of policy. Raw collection alone is insufficient.
Independent analysis must account for every helper/worker descendant and terminal, host
and namespace PID correlation, namespace generations, private propagation and new tmpfs,
root/cwd and both pivots. For EACH of112 ro-bind-data temporaries: prove creation after the
private tmpfs transition, resolve dirfd/path/bind/pivot aliases and inherited/shared/reused/
CLOEXEC FD generations, associate every copy/write/mmap and chmod with that same object,
then bind, close and unlink. Separately prove output bind-fd dev/ino equality/consumption,
all111 mounted input hashes plus config, and unchanged strict four-FD/two-entry probe.
Tmpfs-instance/open-lifetime evidence is not per-file inode/mount-ID evidence. Unresolved
edges/objects remain inconclusive. NO automated placement verifier is implemented; full
bounded raw trace is retained for this independent offline analysis, not accepted as it.

Authored27 tests cover review/schema/policy/source-set guards, fixed tracer pin/ownership,
prefix/template/111+1 mount and FD invariants, no ordinary-mode/acquisition routing, synthetic
fork/clone/clone3 and child-before-parent resume, incomplete/unknown/escaped lineage,
signals/terminal status/parser bounds, hard trace cap/partial writes/fsync, stdout cap,
tracer role, launch/pidfd/poll/wait/kill/read failure, EOF/open pipes, cancellation at poll/
wait/export/copy/fsync/FD close, unknown-child fallback and exclusive/failed exports. These
are AUTHORING claims only, not syntax validation or passing tests. They do not calibrate
native decoders, namespace/mount/FD topology, privacy, native dependencies, worker launch,
owner settlement, filesystem/kernel races or kernel latency. The old41 intents are preserved.

Required next gates, in order: independent final source/effect review; separately authorized
pure tests; NEW complete freeze of every copied/runtime binding and fresh review/export
identity (including all new runtime modules); fresh per-job authority/canonical D154 admission
and coordination; separately admitted actual-format calibration; independent complete
lineage + strict probe +112-object topology/export analysis and owner disposition. No old
approval, freeze digest, passed8803 invocation or raw-capture success may be reused as
acceptance. Calibration support changes would themselves require new source review/freeze.

### Final source-only hash/effect packet

Paths below are relative to C's `scripts/pi-host-compatibility-canary/`. Hashes are direct
read-only SHA256 observations, not imports/syntax checks or behavior proof. Runtime files
are each below500LOC/50KiB; new tests below1000LOC/80KiB. No executable launch-review file,
policy/template hash artifact, export directory, trace or new freeze was produced here.
The policy/template digest ALGORITHMS are specified above; evaluating them is deferred.

```text
c4dfc47f1bd97a0bba736097dd839e1745b68713be731adfae54efe9dc11fc82  artifact-driver.py                 441 lines / 22789 bytes
cefd26866df11b53779efcf59f6d8b6c234cc9120759dd792f875f134744c089  artifact-export.py                 288 lines / 15567 bytes
0e778e7700aec688b6f1559c22676ab4066f011a84c4ae2fb85718e6d20e5cba  artifact-observation.py             182 lines / 11261 bytes
e7faf964e6c8349b909c9de2bfe5f231d76f7fa6561133fd5086bbfdf581aaf9  artifact-observation-lineage.py     203 lines / 10485 bytes
d6f4f078dd02d648da06acf437c40949d66bec60c3ed1fd31a68262bd72d68f4  artifact-observation-supervisor.py  198 lines /  8289 bytes
c0ad7f2ca019d3558dad022994f0b1a518f0d028928ae1afdb00a5c8119bb7c1  artifact-observation-tests.py       552 lines / 32202 bytes
```

Unchanged exact source observations:

```text
336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543  artifact-contract.py
03c47a850e579b39158136fc89a448501a5508054ff780441cd3ebff2f12d2d3  artifact-probe.py
90ca8fd9b21476aee6e672367efda5367e78e4ab0916b71f643328db9790473a  artifact-worker.py
6c18a36862d23f1b677bacd57bb3a2c257499d0372c1e6095a8ce6528aa8fb36  artifact-tests.py
fcb63927e304baa3a2a59b39622439f11a0d9e30c1245f1703e53abee607d20f  original first189 lines of artifact-export.py
```

No complete toolchain/freeze/other-root re-inventory was performed or implied by this table.
Final document SHA is reported externally to avoid self-reference. Stop at independent
review: source exists, authored coverage exists, but syntax/tests, actual trace dialect,
lineage/placement acceptance, runtime readiness and acquisition authorization remain unproved.
