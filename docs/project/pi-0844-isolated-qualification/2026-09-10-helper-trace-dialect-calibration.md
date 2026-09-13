---
summary: "AK5597 finite actual-dialect source correction; unexecuted fixtures, private exec privacy delta, and withheld runtime admission."
read_when:
  - "Reviewing the source correction after the consumed helper-only calibration."
---

# AK5597 helper trace dialect — SOURCE ONLY, NOT runtime qualification

## Boundary and evidence provenance

C = `/home/tryinget/.local/state/pi-quests/tmp/ak5597-source.nINZEw58/repo`.
Only the six dispatch-allowlisted source/test/document paths were edited. The applicable
context chain was reloaded (C/AGENTS.md only; no deeper scripts/docs context), and local
engineering guidance/policy read. No project/Python execution, imports, compilation,
tests, actual-trace parser replay, tracing, network, process/reference scan, lock, cleanup,
AK mutation, git/ref mutation, install/reload, or owner invocation occurred. Operations
were bounded text/context reads, private redacted lexical inspection, text authoring,
counts and SHA256 hashing. No new freeze, operational review or authorization was made.

Dispatch-reported history, **not re-executed or independently accepted here**:

- Immutable current 55-file freeze `wy81qt2u`, digest
  `b29f5298f0a0515adaea381be6b63ad4413a9aee78a6c64616ce6ff0b9fe573c`.
  It remains untouched; these new C bytes do not inherit that freeze.
- 34 observer + old41 tests passed8818 on previous bytes.
- ONE actual helper-only calibration8819 is consumed; result inconclusive8822.
- Independent analysis `dispatch-1789018602018`: 17778 physical lines, 17582 syscalls
  plus 3 terminals after 191 paired resumptions; outer helper, PID1 helper and worker2
  all terminal0; no detach/CLONE_UNTRACED/unknown records in that independent analysis.
  Actual PID numbers are intentionally absent from these sanitized fixtures.
  Reported socket families1/16 are helper-local/netlink only, with no observed connect
  or worker sockets; this is an observation, NOT network-policy approval.
- That analysis independently matches the 112 tmpfs temporary lifecycles, output FD124
  closure and retained strict probe data. These are reported independent observations,
  not this parser's topology proof, ordinary direct reap, or acquisition/readiness.
  `P.verify_output`'s ordinary direct-child-reap verification was **not invoked**.

Private evidence E (read-only; never published as raw fixture):
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-toolchain-v2.XQ9ADjIf/export-parent/ak5597-artifacts-observation-N7fvNXoM/trace.raw`

SHA256, matched by direct file hashing here:
`eca1759f03778dfd112665b4d94218e859e6c7511b044b2ff8412b65257f670d`.
E was **not fed to old or new project code**, paired by a substitute replay, transformed
into a repaired trace, copied, or output unrestrictedly. Read-only lexical inspection
emitted only counts and whitelisted shapes with numeric values redacted: two exec-env
count comments, one namespace-PID comment, 3624 stat timestamp comments. Timestamp shapes
are `YYYY-MM-DDTHH:MM:SS[.nine-digits]+four-digits`. Raw sendto/recvfrom have six numeric
arguments and unfinished/resumed forms; sethostname has two and sched_getaffinity three.
No payload, actual environment value, raw line, or host-source mount list was published.

## Minimal source effects

### `artifact-observation-lineage.py`

Finite dialect ID becomes `ak5597-strace-helper-source.v2`; successful **grammar-only**
status becomes `source-dialect-complete`, not actual/runtime-calibrated. Changes:

1. Accept both legacy `[pid N]` and actual bare decimal PID framing. Positive PIDs in
   frames, notices and namespace annotations must remain <=2147483647; leading zero,
   zero, negative and overbound forms refuse. Physical line/event bounds are unchanged.
2. Accept exact `strace: Process N attached` and legacy `[ Process N attached ]` notices.
   Neither creates a parent edge. Repeated or postterminal notice still refuses.
3. Recognize only the observed native embedded `clone(...strace: Process N attached`
   interruption followed by an unprefixed `) = result` line. Keep one interrupted call,
   associate the notice with its eventual child return, and allow other PIDs' records
   (including early child terminals) before the tail. Missing/mismatched/failed return,
   same-PID intervening record, nested interruption, unknown tail or duplicate notice
   refuses. No arbitrary diagnostic concatenation or skipped line is introduced.
4. Recognize only exact clone result `local /* trace in strace's PID NS */`. Both PIDs
   are bounded; parent edges use the **trace** PID, not the namespace-local number.
   Export additive `namespaceChildren` rows `{parentPid, namespacePid, tracePid}` under
   the existing lineage schema. The map is scoped to the emitting trace parent, not a
   global PID alias; repeated local child mapping for that parent refuses. This is NOT
   namespace-generation, setns, thread migration, or general ABI translation proof.
5. Preserve per-PID unfinished/resumed pairing, including execve and raw I/O; mismatched,
   unpaired, overlapping and nested unfinished records refuse. Reconstructed bodies
   stay bounded at32768; physical lines independently stay bounded at32768.
6. Accept only the observed `st_atime/st_mtime/st_ctime=integer /* timestamp */` lexical
   comments for stat/lstat/fstat/newfstatat, outside quoted strings. Timestamp fields are
   not interpreted or certified; nine fractional digits or no fraction, plus-offset
   spelling only. Other comments/annotations refuse. Exec argument/environment syntax
   now requires complete unescaped quoted arrays or the legacy pointer/count env form;
   arbitrary exec comments, unknown escaping and all ellipses/`???` still refuse.
7. Add only sendto/recvfrom/sethostname/sched_getaffinity to passive vocabulary, requiring
   their known numeric raw argument arities. No buffers are decoded, no effects approved.
   Existing socket/connect recognition also never meant network policy approval.

All prior missing/duplicate/cyclic/unconnected lineage, terminal, PID reuse, unknown syscall,
CLONE_UNTRACED/detach, unsupported clone flags including THREAD/PARENT, decoder truncation,
incomplete capture, PID/event/line bounds remain. Native bare-PID signal records and killed
terminals are deliberately refused: they were not calibrated by this observation. Existing
bracket signal fixtures remain synthetic-only support, not silent native signal approval.

`calibrated`, `verifiedRuntimeLineage`, `helperReapedByDriver` and
`descendantSettlementCertified` remain false even on a complete grammar graph. Topology,
FD generations, inode/mount identity, policy, strict probe acceptance and owner settlement
are not implemented by this parser. Error exports remain fixed messages, never raw lines.

### `artifact-observation.py` — future prefix and mandatory rubric gap

Only executable prefix delta:

```diff
- abbrev=!clone,clone3,stat,lstat,fstat,newfstatat,statx
+ abbrev=!execve,clone,clone3,stat,lstat,fstat,newfstatat,statx
- -s 32
+ -s 512
```

No `-v`, global unabbreviation, syscall decoder expansion, read/write dump, attach to an
existing process, or changed helper argv/inherited FDs. `DECODE`, raw-negation, trace=all,
read=none, write=none, metadata decoders, tracer pin and other options are unchanged.
The rubric now explicitly requires the full initial helper argv matched to the reviewed
111-input template; a supervisor argv hash cannot substitute for omitted trace arguments.
Policy hashing therefore binds the changed prefix, dialect and rubric; OLD policy/source
review hashes cannot admit these bytes. No new policy/template digest was evaluated here.

**The consumed trace's abbreviated initial helper argv is a mandatory unresolved gap.**
Bare framing support does not make that trace qualify. A future admitted replay must still
refuse its original truncated exec; do not skip it, inject reconstructed arguments, weaken
ellipsis rejection, or claim the new prefix retroactively changes E. Full captured argv
matching remains an independent rubric check, not an automated full-template validator.

### Incremental PRIVATE privacy effect — NOT silently approved

Selective execve unabbreviation exposes the complete helper argv AND exec environment:
under the unchanged supervisor's explicit child env, bwrap receives only the supplied
`TMPDIR=<new approved job path>`; the existing `--clearenv` clears the worker environment.
It does not read/inherit environments from existing processes. This is source reasoning
about the controlled launch, not a native tracer/loader privacy proof. Full TMPDIR value
was previously represented by an environment pointer/count; it is now additional private
path metadata. Full argv also exposes previously omitted mount targets and descriptor
numbers. Raising `-s` affects other already-decoded metadata strings too (e.g. path/mount
strings), not only exec. All nonmetadata I/O stays raw, including socket buffers, read,
write, ioctl, getdents/readlink and the four newly recognized raw syscalls.

Before ANY future job, an independent privacy/effect reviewer must explicitly accept this
increment, the exact supplied TMPDIR envelope, full argv, native ptrace/loader reads,
metadata/diagnostic exposure and custody. Existing private0700 export directory/new0600
raw-file discipline and8MiB cap remain; neither permissions nor cap redact secrets. No
unrestricted raw publication or ambient-environment capture is authorized. Any changed
input/env/string shape needs renewed review, not `-v`, a larger bound or a flag fallback.
No privacy approval, launch authority, or promise of no sensitive metadata is made here.

## Authored sanitized coverage — NOT executed or compiled

`artifact-observation-tests.py`: all34 methods retained; only the expected grammar status
and the formerly rejected native-attach specimen changed (now malformed `attached extra`).
The native positive and malformed/duplicate/postterminal negative cases are in the new file.
`artifact-tests.py` and all old41 methods remain byte-identical, not imported or executed.

NEW `artifact-observation-calibration-tests.py`: **13 authored methods**, including:

- Bare three-PID graph, byte/chunk framing, both notice forms, child-before-native-tail;
  notice/return mismatch, missing/nested tail, failed clone and attachment reuse.
- Exact namespace annotation, parent-scoped same-local-number mappings, wrong/invalid/
  duplicate namespace or trace PIDs, use of local number instead of trace PID refusing.
- Resumed exec and raw sendto/recvfrom, numeric raw arities; mismatch/unpaired/nested and
  decoded-buffer/unknown syscall refusals; exact timestamp comments and quoted decoys.
- Native signal/ABI/unknown diagnostic/detach/UNTRACED/thread/parent/invalid-PID/missing
  terminal and truncation negatives. Network recognition deliberately cannot approve
  even a synthetic connect; all runtime/acquisition/readiness flags stay false.
- Exact prefix delta, no extra payload decoder, unchanged32768 line bound.
- Full current111 role/target template, 591 helper arguments, 112 ro-bind-data triples,
  one bind-fd, worker invocation, template hash/order/count guards, ten-digit FD envelope
  and an entirely synthetic511-byte `TMPDIR=...` string. Authored assertions require each
  current helper string <=256 and all helper/env strings <512, with the complete modeled
  exec line <=32768, then feed that **sanitized fixture**, never E, to the parser.
- Generated111 targets of256 bytes each exceed the aggregate line bound and must refuse;
  unknown exact-bound/overbound input and oversized paired body also refuse. A per-target
  bound alone is not a full-line bound. Truncated initial exec/argv/env must still refuse.

The in-memory exec formatter is an authored string model, **not strace execution or native
unabbreviation proof**. None of these assertions has run. Exact-current-target data is a
public sandbox role/target projection only, copied in order from the unchanged named input:
`/home/tryinget/.local/state/pi-quests/tmp/ak5597-toolchain-v2.XQ9ADjIf/toolchain.json`.
Its directly observed SHA256 is
`e961cb4d8af0db768ea3d0c76823ed3feae04b47a60170b00b74092d1bf982cb`.
SHA256 of sorted-compact-JSON-plus-LF `[[role,target],...]` is
`2ce0971fa0f88b7ffdd28085c1693f64f2de0dbccc79e189e5a1d1c1f7cb955f`.
The new suite embeds that projection; future execution reads NO external toolchain/trace,
actual TMPDIR, host source file, or authorization input. This hash is not a full toolchain
admission check or source/native dependency freeze.

Future test effect proposal, **only after independent review, NEW complete freeze and
separate explicit test permission**: the new file with a reviewed Python `-I -S -B` reads
exactly contract, driver, lineage and observation siblings through runpy, plus reviewed
stdlib/native startup dependencies, and writes unittest output to existing stdout/stderr.
It exercises only pure parser/argv/status/hash functions and in-memory strings. No real
Popen/FD/proc/namespace/signal/network/filesystem fixture or raw replay is invoked. It does
not import either old test suite or worker/probe/exporter/supervisor. Strings are bounded
fixture data (largest modeled lines roughly tens of KiB); no hard interpreter RSS/CPU
bound or zero-OS-effect claim. Old34 fake-supervisor tests remain a separate proposed test
entrypoint; old41 retains its separate real-filesystem/external-input preflight requirements
in the historical review packet. None is permission to run now.

## Exact source hashes (read-only hashing, not syntax/behavior verification)

Relative to C. BEFORE hashes observed at entry:

```text
7bcbeab0f32a8bc6e273d7c3af90a80a74a0978bd84ba2b01c2089355d32d7f6  scripts/pi-host-compatibility-canary/artifact-observation.py
594b3b82e18a17e7499945c512f48e1339d5ecfcc023136003eb600955cffdb8  scripts/pi-host-compatibility-canary/artifact-observation-lineage.py
b3da1e364a89129dc66afc034002d8d978ace341cc78b71e2f7d15a473d353e4  scripts/pi-host-compatibility-canary/artifact-observation-tests.py
b06b6c87e3a16737beb1393a1beec1d07c14a76444be10cec81034a6879de3dc  docs/project/pi-0844-isolated-qualification/2026-09-10-helper-observation-source-review.md
```

AFTER (new calibration test had no predecessor; historical doc only gained a pointer):

```text
8cd597861f518e3bd1e580adcdc436d5a5bcd9f2bcc0bdbfd7e08f18a4384e27  scripts/pi-host-compatibility-canary/artifact-observation.py
98eebc5baf0c088bdb858f6830e9b8cb53ee71560cac2dd49c845a7d7bc6881e  scripts/pi-host-compatibility-canary/artifact-observation-lineage.py
e90a196cccecfbaf7af7daf8b8fa17457ebc010f5e5645b148ea795bdcad0396  scripts/pi-host-compatibility-canary/artifact-observation-tests.py
8cde71df7a6b58c7692a1fa01475583d0b1dabaa900f5c1a6ede9fc80bfb252e  scripts/pi-host-compatibility-canary/artifact-observation-calibration-tests.py
fcfb337c051290f9cbb89fea96b13d9f2e0fe08bc3caa93ef5f68639b23030d8  docs/project/pi-0844-isolated-qualification/2026-09-10-helper-observation-source-review.md
```

Unchanged sibling hashes observed both before and after edits:

```text
d6f4f078dd02d648da06acf437c40949d66bec60c3ed1fd31a68262bd72d68f4  scripts/pi-host-compatibility-canary/artifact-observation-supervisor.py
336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543  scripts/pi-host-compatibility-canary/artifact-contract.py
c4dfc47f1bd97a0bba736097dd839e1745b68713be731adfae54efe9dc11fc82  scripts/pi-host-compatibility-canary/artifact-driver.py
cefd26866df11b53779efcf59f6d8b6c234cc9120759dd792f875f134744c089  scripts/pi-host-compatibility-canary/artifact-export.py
03c47a850e579b39158136fc89a448501a5508054ff780441cd3ebff2f12d2d3  scripts/pi-host-compatibility-canary/artifact-probe.py
90ca8fd9b21476aee6e672367efda5367e78e4ab0916b71f643328db9790473a  scripts/pi-host-compatibility-canary/artifact-worker.py
6c18a36862d23f1b677bacd57bb3a2c257499d0372c1e6095a8ce6528aa8fb36  scripts/pi-host-compatibility-canary/artifact-tests.py
```

This document's hash is reported externally to avoid self-reference. No full freeze,
package/canonical-owner census, external-input inventory or unchanged-root scan is implied.
Worker/probe/contract/exporter/supervisor/driver/toolchain/canonical owner/packages were not
edited. Runtime source remains <500LOC/50KB, each test file <1000LOC/80KB, both edited docs
<800lines/60KB. The new file is not wired into any discovery/CI/runtime loader in this task.

## Stop: independent review, full freeze, and withheld admission

Stop before tests, imports, syntax checks, actual raw replay or any future job. Require
independent source/effect/privacy review and a **NEW complete parent freeze** binding all
corrected/copied/runtime/test inputs before any separately authorized testing or runtime.
Prior passes, freeze, trace custody and fixture grammar success do not qualify these bytes.

Parent still withholds runtime admission pending station-owner settlement. This correction
does not settle that owner boundary, D154 coordination/disposition, native dependencies or
privacy. A separately admitted parent offline replay may analyze original E, but must retain
its full-argv refusal. Do NOT rerun the consumed calibration. Any later full-argv observation
requires an independently approved NEW job/effect plan, unused review/export identity,
exact input/environment/string bounds, fresh per-job authority and canonical owner admission.
There is no automatic retry, cleanup, source-to-runtime promotion or acquisition transition.

Remaining evidence must independently bind full helper argv, exact emitted dialect, all
lineage/terminals, strict four-FD/two-entry probe and111 inputs/config,112-object placement,
output binding/closure, private custody and owner disposition. No direct-reap adapter was
added; tracer reap is not helper reap. Tmpfs/open-lifetime evidence is not per-file inode/
mount-ID proof. Acquisition, readiness, qualification and runtime proof flags remain false.
