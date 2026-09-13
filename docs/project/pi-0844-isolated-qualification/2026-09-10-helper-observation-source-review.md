---
summary: "AK5597 reviewer corrections: source-only, unexecuted fake coverage and pending freeze."
read_when:
  - "Reviewing the corrected helper observer and its separately proposed fake-only tests."
---

# AK5597 helper observation — corrected source, NOT accepted or executed

Later source-only actual-dialect correction, current hashes, privacy delta and remaining gates:
[helper trace dialect calibration](2026-09-10-helper-trace-dialect-calibration.md).
Everything below is the historical correction packet, not current byte acceptance.

## Status and bounded correction

**SOURCE ONLY: 27 retained/adapted + 7 new = 34 authored observer test methods; NONE run.**
No Python/project execution, imports, compilation, tests, tracing, network, process/reference
scan, locks, cleanup, AK mutation or git-ref mutation occurred. Only targeted context/source
reads, text edits, diffs, counts and SHA256 hashing were performed. Syntax and behavior remain
unverified. This packet creates neither runtime approval nor a new freeze.

C = `/home/tryinget/.local/state/pi-quests/tmp/ak5597-source.nINZEw58/repo`.
Reloaded C's context chain: only C/AGENTS.md found; no deeper scripts/docs context file.
Read C's engineering.local.md and engineering-lane.json. Exactly five allowed files changed:
three observer Python sources/tests, the existing review document, and this NEW document.
The first four exact deltas are below; this document is entirely new. No runtime supervisor,
driver, exporter, old41 suite, worker, probe, contract, toolchain, package or canonical-owner
file was edited. No install/reload, operational inputs or authorization reference was created.
Ordinary probe/acquire source and behavior were not intentionally changed or executed.

Dispatch reports the preserved candidate `ak5597-root-source-freeze.e74swxqe`, digest
`ae889f62f54e0c814fbc919bca861f4322a81bcc26f073f4570c6e9e0e075d25`,
4660 entries / 74285413 bytes / 54 deltas, **UNACCEPTED**. That supplied inventory was not
rescanned/revalidated here. Reviewer `dispatch-1789015900461` identified three concrete
source defects. Corrected source pins require a NEW complete parent freeze; neither that
historical candidate nor older passed tests/diagnostics are acceptance of these bytes.

### 1. Retain the metadata actually associated with the tracer hash

`pin_tracer` now returns `(fd, snapshot)`. Snapshot includes dev/ino/size/mtime/ctime and
UID/GID/mode/link count; full before/after metadata must agree across hashing. Existing
root ownership, executable/nonprivileged mode, single-link and SHA256 checks remain.
Before the actual Popen call, BOTH current retained FD and nofollow pathname metadata
must independently equal that retained snapshot, not merely each other. A same-inode
rewrite with changed timestamps/size therefore cannot satisfy the intended source guard.

To keep the non-allowed supervisor source unchanged yet check AFTER its selector setup,
`supervise_pinned` reuses its existing code object via FunctionType with a private copied
globals dictionary and a subprocess facade. Only Popen is wrapped; PIPE/DEVNULL are passed
through. No shared runtime module global is mutated. The existing bwrap FD/path comparison
is also performed in that wrapper. This binding technique itself needs independent review
and execution of its authored fake coverage; it is not a new supervisor implementation or a proof of it.
Failures remain inside the existing supervisor's launch-failure/settlement handling.

**Not atomic pathname exec, immutable executable bytes, or loader closure.** There remains
an interval between metadata observations and pathname execution, and the native loader
and dependencies are outside this correction. Root/kernel adversaries and undetectable
metadata restoration are not excluded. No bwrap hash-snapshot extension is claimed.

### 2. Attachment notices cannot revive terminal PIDs or repeat ambiguously

An internal bounded-by-nodes attachment set rejects repeated attach notices and any attach
after that PID's terminal record (helper or worker). Attach still does not establish an
edge. Child records, including a terminal, may precede the parent's resumed clone return;
that later edge can still connect the already-seen child. The new set is not exported and
the process receipt shape remains unchanged. This finite synthetic grammar is uncalibrated.

### 3. Construct operation-review data before shared-global fakes

`operation_fixture` saves `review()` before replacing O's S binding with fake_s, avoiding
policy's missing TRACE_MAX AttributeError. The saved fixture is passed to operation in all
three existing methods / four cases (normal, missing supervisor return, export cancellation,
FD-close cancellation). Those routing fixtures mock the new adapter; separate new cases
exercise the REAL adapter and REAL supervisor together, with fake Popen/OS/selector/clock.

### Additional authored coverage, not executed evidence

Seven new methods add:

1. Same-inode changed metadata across tracer hashing (seven fields).
2. Pre-Popen retained snapshot checks AFTER fake selector construction: stable success,
   and nine changed fields each on FD+path, FD only and path only (27 refusal cases).
3. Postterminal attachments for both helper100 and worker101.
4. Ambiguous repeated attachments, plus attached child exec/terminal BEFORE resumed clone.
5. Both transient EOF/reap orders completing once both facts arrive before the deadline.
6. REAL `E.observation_trace`, `E.open_source`, `C.regular` and identity/hash checks over
   fake integer FDs: empty/nonempty success, changed FD/path metadata, alias, oversized
   metadata, length mismatch, wrong owner/mode/link count, and close bookkeeping.
7. REAL `O.probe_candidate`, `E.open_source`, `E.hash_source`, `C.read_fd`/regular/JSON/hash
   checks over fake FDs: identified receipt + exact specimen success; extra/missing entries,
   corrupt same-length specimen, malformed JSON, wrong schema/acquisition/qualification.

The new fake-files layer supplies only in-memory open/read/lseek/fstat/stat/close/getuid
and directory-name results; unknown operations have no real-FD fallback. Reads split at
three bytes; closure is checked even on errors. It allocates no files/directories. The
minimal valid candidate receipt deliberately does NOT establish full strict probe validity.
Existing export orchestration tests still mock audit/copy; the added real-helper tests
cover those formerly mocked audit and candidate validations separately, not real-FS export
integration, real exclusive creation/copy/fsync durability, or a strict P.verify adapter.

### Supervisor ordering reconciliation (supervisor source unchanged)

EOF before tracer reap and reap before pipe EOF are normal transient orders. Source may
complete successfully once tracer reap AND both pipe EOFs arrive, absent other failure,
before the1900s deadline. A persistent mismatch reaches timeout, THEN settlement bounded
by10s/101 iterations. It is not an immediate categorical error on the first mismatch.
Clock/kernel/native/disk calls are not hard wall-time guarantees. Reap still concerns only
the owned tracer, never all helper descendants. The existing packet's current wording is
corrected narrowly; its historical inventories/evidence are not rewritten.

## Proposed PURE invocation and exact effect boundary — DO NOT RUN IN THIS DISPATCH

After separate independent source/effect review and explicit test permission, using the
separately reviewed interpreter/stdlib/native dependency bindings, proposed command:

```bash
/usr/bin/python3.14 -I -S -B /home/tryinget/.local/state/pi-quests/tmp/ak5597-source.nINZEw58/repo/scripts/pi-host-compatibility-canary/artifact-observation-tests.py -v
```

This names ONLY the new34 fake-only observer methods, not discovery or the old41 suite.
The interpreter path is a proposal, not a newly verified executable pin; prior reported
Python SHA256 `d78f9cf7178ecff09963551399855543c297f37ac207e626228bfe43cb26a70c`
requires renewed review/binding before use. No execution approval is implied by this command.

Permitted proposed effects: one interpreter process; read the test file and exactly seven
project siblings via runpy (contract, driver, exporter, probe, observer, lineage, supervisor),
and normal reviewed stdlib/native loader reads; execute only the tests/fakes and these inert
module definitions/functions; write unittest output to existing stdout/stderr. -I -S -B
excludes environment Python settings/site loading and bytecode writes, not native-loader
trust or all interpreter OS effects. No output redirection/file creation is proposed here.

All test FD/pipe/selector/process/signal/clock/fsync/umask operations are fake objects or
replaced bindings. No actual bwrap/strace/helper/worker launch, namespace, /proc observation,
network/DNS/TLS, process census, signal delivery/handler installation, resource-limit change,
memfd creation, fixture disk writes, lifecycle/owner invocation, retry/cleanup or reference
mutation is proposed. No external acquisition JSON, D154 preflight JSON, toolchain, actual
tracer ELF or AK5597_PURE_TEST_PARENT is needed by THIS suite. runpy does not load worker
or artifact-tests.py. Interpreter/source/stdlib reads are real; “fake-only” is not a claim
of zero interpreter filesystem access, OS startup effects, or an enforced syscall sandbox.

Exact fixture bounds are source constants: fake trace storage <=8MiB per FakeDisk, writes/
pipe reads <=4096 bytes, fake stdout overflow at64KiB+4096; fake clocks advance without
sleeping to the1900s/10s/101-iteration settlement limits. The new audit specimen is at most
seven bytes; >8MiB rejection uses metadata only, not that allocation. Candidate bytes are
one small synthetic JSON receipt and the existing WRITE_BYTES, never archive bodies.
The suite runs sequentially; total interpreter RSS/CPU/latency have not been measured or
hard-limited here. These are memory/mock-effect bounds, NOT actual tracer calibration.

### Separate OLD41 real-filesystem-retaining suite — NOT included above

`artifact-tests.py` remains unchanged and is NOT run/imported by the proposed observer
command. Any later separately admitted old41 invocation still requires an existing private
owned0700 AK5597_PURE_TEST_PARENT, retained exclusive fixture directories/files (no cleanup),
and both old external read bindings, independently preserved/reviewed:

- `/home/tryinget/.local/state/pi-quests/tmp/ak5597-acquisition-inputs.TAcEcBy8/acquisition-inputs.json`,
  expected SHA256 `1c411d9d51d7ba083ebdd19c35d8c55fc8c3d77ff492071e50bd8eed567f7ce8`.
- `/home/tryinget/.local/state/pi-quests/tmp/ak5597-d154-preflight.DXXXXhUE/stdout.json`; old preflight
  attribution data, NOT current admission. Its binding is still required, not invented or
  rehashed here. The deferred-manifest digest in source is NOT a hash of this stdout JSON.

Old fixtures include the three166-body exporter cases (831 tiny source/copy body files),
one256KiB+17 body and existing probe/library/negative fixtures, plus filesystem metadata.
Those retained real-FS effects and source/worker/HTTP-policy imports remain separately
reviewed; do not conflate the old “pure transport” label with the new no-fixture-write suite.
No proposed old41 invocation or new external-input reference is created in this correction.

## Remaining gates and stop

Stop here for independent source/effect review, separately admitted fake tests, and a NEW
complete parent freeze binding all corrected/copied/runtime bytes and exact external inputs.
Then fresh per-job authority, canonical D154 admission/disposition/coordination and unused
review/export identity remain required before any observation. No old approval, consumed
passed8803 diagnostic, UNACCEPTED candidate digest or successful raw custody grants launch.
Actual emitted strace dialect/namespace PID/exec/clone/terminal calibration remains pending.
There is still no automated topology verifier: independently account for all helper/worker
lineage, strict four-FD/two-entry probe evidence and111 inputs/config, every112 temporary's
new-tmpfs/open-generation/copy/chmod/bind/close/unlink placement and output bind-fd identity.
No per-file mount/inode proof, native dependency/privacy closure, descendant settlement,
readiness, acquisition, SDK execution or qualification is established by this source work.

## Exact correction diffs

These unified diffs are against the source bytes present at dispatch entry, not the git base.
The supplied historical freeze remains UNACCEPTED; this is not a replacement freeze.

```diff
--- a/scripts/pi-host-compatibility-canary/artifact-observation.py
+++ b/scripts/pi-host-compatibility-canary/artifact-observation.py
@@ -4,6 +4,7 @@
 """
 import hashlib
 import os
+from types import FunctionType, SimpleNamespace
 
 FILES = ('artifact-observation.py', 'artifact-observation-lineage.py', 'artifact-observation-supervisor.py')
 REVIEW_SCHEMA = 'ak5597-artifact-observation-review.v1'
@@ -65,15 +66,45 @@
     return projected
 
 
+def executable_metadata(s):
+    return C.identity(s) + (s.st_uid, s.st_gid, s.st_mode, s.st_nlink)
+
+
 def pin_tracer(review, fds):
+
     fd = C.open_file('/usr/bin/strace', 16 * 1024 * 1024)
     fds.append(fd)
     before = C.regular(fd, 16 * 1024 * 1024)
     C.require(before.st_uid == 0 and before.st_nlink == 1 and before.st_mode & 0o6022 == 0
               and before.st_mode & 0o111, 'root owned nonprivileged tracer')
-    C.require(hashlib.sha256(C.read_fd(fd, 16 * 1024 * 1024)).hexdigest()
-              == review['observer']['straceSha256'], 'tracer hash')
-    return fd
+    snapshot = executable_metadata(before)
+    digest = hashlib.sha256(C.read_fd(fd, 16 * 1024 * 1024)).hexdigest()
+    C.require(snapshot == executable_metadata(C.regular(fd, 16 * 1024 * 1024)),
+              'tracer changed during hash')
+    C.require(digest == review['observer']['straceSha256'], 'tracer hash')
+    return fd, snapshot
+
+
+def supervise_pinned(argv, inherited, helper_tmp, cancel, capture, tracer, bwrap):
+    """Bind the check to Popen, after selector setup, without changing shared S globals.
+    Reuse the reviewed supervisor code with one private subprocess binding. This is
+    NOT atomic pathname execution, a sealed executable, or native loader closure.
+    """
+    spawn = S.supervise.__globals__['subprocess']
+    def popen(*args, **kwargs):
+        C.require(not cancel.pending, 'cancelled before pinned launch')
+        C.require(C.identity(os.fstat(bwrap)) == C.identity(os.stat('/usr/bin/bwrap', follow_symlinks=False)),
+                  'launch helper changed')
+        fd, snapshot = tracer
+        C.require(executable_metadata(os.fstat(fd)) == snapshot
+                  == executable_metadata(os.stat('/usr/bin/strace', follow_symlinks=False)),
+                  'hashed tracer changed before launch')
+        return spawn.Popen(*args, **kwargs)
+    scope = dict(S.supervise.__globals__, subprocess=SimpleNamespace(
+        Popen=popen, DEVNULL=spawn.DEVNULL, PIPE=spawn.PIPE))
+    supervise = FunctionType(S.supervise.__code__, scope, S.supervise.__name__,
+                             S.supervise.__defaults__, S.supervise.__closure__)
+    return supervise(argv, inherited, helper_tmp, cancel, capture)
 
 
 def invocation(argv_for, tool, mounted, config, output, review):
@@ -137,9 +168,6 @@
         capture = S.Capture(raw_fd, L.Lineage())
         try:
             C.require(not cancel.pending, 'cancelled before output')
-            for fd, path in ((tracer, '/usr/bin/strace'), (bwrap, '/usr/bin/bwrap')):
-                C.require(C.identity(os.fstat(fd)) == C.identity(os.stat(path, follow_symlinks=False)),
-                          'launch executable changed')
             source = C.new_dir(tmp, 'probe'); fds.append(source)
             inherited = [fd for _, fd in mounted] + [config, source]
             for fd in inherited[:-1]:
@@ -149,7 +177,7 @@
                            inheritedFds=inherited, traceFdInherited=False,
                            childEnvironmentKeys=['TMPDIR'])
             launch_attempted = True
-            supervision = S.supervise(argv, inherited, os.environ['TMPDIR'], cancel, capture)
+            supervision = supervise_pinned(argv, inherited, os.environ['TMPDIR'], cancel, capture, tracer, bwrap)
             candidate = probe_candidate(source, supervision, cancel)
         except BaseException:
             if supervision is not None:
```

```diff
--- a/scripts/pi-host-compatibility-canary/artifact-observation-lineage.py
+++ b/scripts/pi-host-compatibility-canary/artifact-observation-lineage.py
@@ -41,6 +41,7 @@
         self.buffer = b''
         self.nodes, self.pending = {}, {}
         self.root, self.worker = None, None
+        self.attached = set()  # Notice bookkeeping only, not exported parentage.
         self.events, self.signals, self.error = 0, 0, None
 
     def fail(self, reason):
@@ -80,7 +81,10 @@
         # Manual documents attach notices separately from PID-prefixed syscall records.
         attach = re.fullmatch(r'\[ Process ([1-9][0-9]*) attached \]', line)
         if attach:
-            self.node(int(attach[1]))
+            pid = int(attach[1])
+            if self.node(pid)['terminal'] is not None or pid in self.attached:
+                raise ValueError('post exit or repeated attach/PID reuse')
+            self.attached.add(pid)
             return
         match = re.fullmatch(r'\[pid\s+([1-9][0-9]*)\] (.+)', line)
         if not match:
```

```diff
--- a/scripts/pi-host-compatibility-canary/artifact-observation-tests.py
+++ b/scripts/pi-host-compatibility-canary/artifact-observation-tests.py
@@ -3,6 +3,7 @@
 Existing artifact-tests.py's 41 test methods remain untouched.
 """
 import copy
+from contextlib import contextmanager
 import hashlib
 from pathlib import Path
 import runpy
@@ -72,7 +73,69 @@
                   st_uid=42, st_nlink=1, st_mtime_ns=3, st_ctime_ns=4)
 
 
+class FakeFiles:
+    """Integer handles only; no fallback to real FD/path operations."""
+    def __init__(self, case, files, *, base_change=None, fd_change=None, path_change=None):
+        self.case, self.files = case, files
+        self.base_change, self.fd_change, self.path_change = base_change or {}, fd_change or {}, path_change or {}
+        self.handles, self.closed = {}, []
+        real_os = C.regular.__globals__['os']
+        constants = {k: getattr(real_os, k) for k in ('O_RDONLY', 'O_NOFOLLOW', 'O_CLOEXEC', 'O_NONBLOCK', 'SEEK_SET')}
+        self.os = NS(**constants, open=self.open, read=self.read, lseek=self.lseek,
+                     fstat=self.fstat, stat=self.stat, close=self.close, getuid=lambda: 42)
+
+    def metadata(self, name):
+        return dict(st_dev=1, st_ino=10 + list(self.files).index(name), st_size=len(self.files[name]),
+                    st_mtime_ns=3, st_ctime_ns=4, st_uid=42, st_gid=42, st_mode=0o100600, st_nlink=1)
+
+    def open(self, name, flags, *, dir_fd):
+        self.case.assertEqual(dir_fd, 2)
+        self.case.assertEqual(flags, self.os.O_RDONLY | self.os.O_NOFOLLOW | self.os.O_CLOEXEC | self.os.O_NONBLOCK)
+        self.case.assertIn(name, self.files)
+        fd = 1000 + len(self.handles); self.handles[fd] = [name, 0]
+        return fd
+
+    def read(self, fd, n):
+        self.case.assertGreater(n, 0)
+        name, offset = self.handles[fd]
+        block = self.files[name][offset:offset + min(n, 3)]
+        self.handles[fd][1] += len(block)
+        return block
+
+    def lseek(self, fd, offset, whence):
+        self.case.assertEqual((offset, whence), (0, self.os.SEEK_SET))
+        self.handles[fd][1] = 0
+
+    def fstat(self, fd):
+        name, offset = self.handles[fd]
+        fields = dict(self.metadata(name), **self.base_change)
+        if offset: fields.update(self.fd_change)
+        return NS(**fields)
+
+    def stat(self, name, *, dir_fd, follow_symlinks):
+        self.case.assertEqual((dir_fd, follow_symlinks), (2, False))
+        fields = dict(self.metadata(name), **self.base_change); fields.update(self.path_change)
+        return NS(**fields)
+
+    def close(self, fd):
+        self.case.assertIn(fd, self.handles); self.case.assertNotIn(fd, self.closed)
+        self.closed.append(fd)
+
+
+@contextmanager
+def fake_files(case, files, **changes):
+    disk = FakeFiles(case, files, **changes)
+    fake_c = NS(**vars(C)); fake_c.directory_names = lambda d: list(files) if d == 2 else case.fail('directory')
+    with patch.dict(C.regular.__globals__, os=disk.os), patch.dict(E.open_source.__globals__, C=fake_c, os=disk.os), \
+            patch.dict(O.probe_candidate.__globals__, C=fake_c, os=disk.os):
+        try:
+            yield disk
+        finally:
+            case.assertEqual(set(disk.closed), set(disk.handles))
+
+
 class FakeSelector:
+
     def __init__(self, clock):
         self.entries, self.clock = {}, clock
         self.closed = False
@@ -186,7 +249,8 @@
     def test_tracer_pin_rejects_owner_privilege_mode_hash_and_links(self):
         data = b'not an ELF; fake bytes only'
         value = review(); value['observer']['straceSha256'] = hashlib.sha256(data).hexdigest()
-        base = dict(st_uid=0, st_mode=0o100755, st_nlink=1)
+        base = dict(st_uid=0, st_gid=0, st_mode=0o100755, st_nlink=1, st_dev=1, st_ino=2,
+                    st_size=len(data), st_mtime_ns=3, st_ctime_ns=4)
         fake = NS(**vars(C)); fake.open_file = lambda *_: 88; fake.read_fd = lambda *_: data
         for fields, good in ((base, True), (dict(base, st_uid=42), False),
             (dict(base, st_mode=0o104755), False), (dict(base, st_mode=0o100777), False),
@@ -194,7 +258,8 @@
             fake.regular = lambda *_, fields=fields: NS(**fields)
             with patch.dict(O.pin_tracer.__globals__, C=fake):
                 if good:
-                    fds = []; self.assertEqual(O.pin_tracer(value, fds), 88); self.assertEqual(fds, [88])
+                    fds = []; self.assertEqual(O.pin_tracer(value, fds), (88, O.executable_metadata(NS(**base))))
+                    self.assertEqual(fds, [88])
                 else:
                     with self.assertRaises(ValueError): O.pin_tracer(value, [])
         fake.regular = lambda *_: NS(**base)
@@ -202,7 +267,20 @@
         with patch.dict(O.pin_tracer.__globals__, C=fake), self.assertRaises(ValueError):
             O.pin_tracer(value, [])
 
+    def test_tracer_pin_same_inode_metadata_change_during_hash(self):
+        data = b'fake tracer bytes'
+        value = review(); value['observer']['straceSha256'] = hashlib.sha256(data).hexdigest()
+        base = dict(st_uid=0, st_gid=0, st_mode=0o100755, st_nlink=1, st_dev=1, st_ino=2,
+                    st_size=len(data), st_mtime_ns=3, st_ctime_ns=4)
+        for field in ('st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_uid', 'st_gid', 'st_mode', 'st_nlink'):
+            samples = iter((NS(**base), NS(**dict(base, **{field: base[field] + 1}))))
+            fake = NS(**vars(C)); fake.open_file = lambda *_: 88; fake.read_fd = lambda *_: data
+            fake.regular = lambda *_: next(samples)
+            with self.subTest(field=field), patch.dict(O.pin_tracer.__globals__, C=fake), self.assertRaises(ValueError):
+                O.pin_tracer(value, [])
+
     def test_complete_synthetic_lineage_is_never_actual_proof(self):
+
         result = parse()
         self.assertEqual(result['status'], 'synthetic-dialect-complete')
         self.assertTrue(result['allTerminal']); self.assertTrue(result['allExitZero'])
@@ -273,7 +351,22 @@
             self.assertFalse(parse()['allTerminal'])
         self.assertFalse(parse(TRACE.replace(b'100]', b'2147483648]'))['allTerminal'])
 
+    def test_attach_after_helper_or_worker_terminal_refuses(self):
+        for pid in (100, 101):
+            with self.subTest(pid=pid):
+                self.assertFalse(parse(TRACE + ('[ Process %d attached ]\n' % pid).encode())['allTerminal'])
+
+    def test_repeated_attach_refuses_without_losing_early_child(self):
+        attach = '[ Process 101 attached ]\n'
+        self.assertFalse(parse((attach + attach).encode() + TRACE)['allTerminal'])
+        self.assertFalse(parse((ROOT + attach + FORK + WORKER + attach + EXITS).encode())['allTerminal'])
+        raw = ROOT + '[pid 100] clone(child_stack=NULL, flags=SIGCHLD <unfinished ...>\n'
+        raw += attach + WORKER + '[pid 101] +++ exited with 0 +++\n'
+        raw += '[pid 100] <... clone resumed>) = 101\n[pid 100] +++ exited with 0 +++\n'
+        self.assertTrue(parse(raw.encode())['allTerminal'])
+
     def capture_fixture(self, disk=None):
+
         disk = disk or FakeDisk()
         fake_os = NS(write=disk.write, fsync=disk.fsync, fstat=disk.fstat)
         return disk, fake_os, S.Capture(90, L.Lineage())
@@ -317,7 +410,8 @@
         self.assertTrue(capture.failed); self.assertEqual(capture.used, 0)
 
     def supervise_fixture(self, *, when=None, configure=None, stderr=None, stdout=None,
-                          launch_error=False, pidfd_error=False, read_error=False):
+                          launch_error=False, pidfd_error=False, read_error=False, pinned=False,
+                          tracer_fd_change=None, tracer_path_change=None):
         cancel = D.Cancellation()
         child = FakeChild(cancel, when)
         if configure: configure(child)
@@ -341,15 +435,29 @@
             return 80
         def send(fd, sig):
             self.assertEqual(fd, 80); signals.append((fd, sig)); child.kill()
-        fake_os = NS(write=disk.write, fsync=disk.fsync, fstat=disk.fstat, read=read,
+        base = dict(st_dev=1, st_ino=2, st_size=10, st_mtime_ns=3, st_ctime_ns=4,
+                    st_uid=0, st_gid=0, st_mode=0o100755, st_nlink=1)
+        current_fd, current_path = dict(base), dict(base)
+        snapshot = O.executable_metadata(NS(**base))
+        def make_selector():
+            current_fd.update(tracer_fd_change or {}); current_path.update(tracer_path_change or {})
+            return selector
+        def fstat(fd):
+            return NS(**current_fd) if fd == 88 else NS(**base) if fd == 24 else disk.fstat(fd)
+        def stat(path, *, follow_symlinks):
+            self.assertFalse(follow_symlinks); self.assertIn(path, ('/usr/bin/strace', '/usr/bin/bwrap'))
+            return NS(**(current_path if path == '/usr/bin/strace' else base))
+        fake_os = NS(write=disk.write, fsync=disk.fsync, fstat=fstat, stat=stat, read=read,
                      pidfd_open=pidfd_open, set_blocking=lambda *_: None, close=lambda *_: None)
+
         fake_time = NS(monotonic=lambda: clock[0], sleep=lambda delay: clock.__setitem__(0, clock[0] + delay))
         with patch.dict(S.supervise.__globals__, os=fake_os, time=fake_time,
-                selectors=NS(DefaultSelector=lambda: selector, EVENT_READ=1),
+                selectors=NS(DefaultSelector=make_selector, EVENT_READ=1),
                 subprocess=NS(Popen=popen, DEVNULL=-3, PIPE=-1),
-                signal=NS(SIGKILL=9, pidfd_send_signal=send)):
-            result = S.supervise(['/usr/bin/strace', '--', '/usr/bin/bwrap'], [20, 21, 22],
-                                 '/fake/approved/tmp', cancel, capture)
+                signal=NS(SIGKILL=9, pidfd_send_signal=send)), patch.dict(O.supervise_pinned.__globals__, os=fake_os):
+            args = (['/usr/bin/strace', '--', '/usr/bin/bwrap'], [20, 21, 22], '/fake/approved/tmp', cancel, capture)
+            result = O.supervise_pinned(*args, (88, snapshot), 24) if pinned else S.supervise(*args)
+
         return result, child, calls, signals, disk, clock[0]
 
     def test_supervised_child_role_stderr_custody_and_no_extra_fds(self):
@@ -365,7 +473,20 @@
         self.assertEqual(args['env'], {'TMPDIR': '/fake/approved/tmp'})
         self.assertNotIn(90, args['pass_fds']); self.assertNotIn(80, args['pass_fds'])
 
+    def test_pinned_popen_rechecks_hash_snapshot_after_selector_setup(self):
+        result, _, calls, *_ = self.supervise_fixture(pinned=True)
+        self.assertTrue(result['captureComplete']); self.assertEqual(len(calls), 1)
+        for change in ({'st_mtime_ns': 9}, {'st_ctime_ns': 9}, {'st_size': 11}, {'st_mode': 0o100777},
+                       {'st_uid': 42}, {'st_gid': 42}, {'st_nlink': 2}, {'st_ino': 9}, {'st_dev': 9}):
+            for fd_change, path_change in ((change, change), (change, None), (None, change)):
+                with self.subTest(fd=fd_change, path=path_change):
+                    result, _, calls, *_ = self.supervise_fixture(pinned=True,
+                        tracer_fd_change=fd_change, tracer_path_change=path_change)
+                    self.assertFalse(result['tracerCreated']); self.assertFalse(result['captureComplete'])
+                    self.assertEqual(result['reason'], 'launch-failed'); self.assertEqual(calls, [])
+
     def test_poll_and_wait_cancellation_never_green(self):
+
         for when in ('poll', 'wait'):
             result, child, _, _, _, _ = self.supervise_fixture(when=when)
             self.assertTrue(result['cancelled']); self.assertEqual(result['reason'], 'interrupted')
@@ -393,7 +514,20 @@
         self.assertTrue(result['tracerReaped']); self.assertFalse(result['captureComplete'])
         self.assertEqual(signals, []); self.assertLessEqual(elapsed, S.WALL_SECONDS + S.SETTLE_SECONDS + 1)
 
+    def test_transient_eof_and_reap_order_both_complete(self):
+        def delayed(child):
+            def poll():
+                child.polls += 1
+                return None if child.polls < 4 else 0
+            child.poll = poll
+        for configuration in (dict(configure=delayed), dict(stderr=[TRACE, b''])):
+            result, _, _, signals, _, elapsed = self.supervise_fixture(**configuration)
+            self.assertTrue(result['captureComplete']); self.assertEqual(result['reason'], 'exited')
+            self.assertTrue(all(result['eof'].values())); self.assertTrue(result['tracerReaped'])
+            self.assertEqual(signals, []); self.assertLess(elapsed, S.WALL_SECONDS)
+
     def test_missing_terminal_empty_trace_stdout_and_trace_overflow(self):
+
         for raw in (b'', (ROOT + FORK + WORKER).encode(), b'unrecognized actual format\n'):
             result, *_ = self.supervise_fixture(stderr=[raw, b''] if raw else [b''])
             self.assertTrue(result['tracerReaped']); self.assertFalse(result['lineage']['allTerminal'])
@@ -411,7 +545,45 @@
                 self.assertIsNone(O.probe_candidate(1, dict(captureComplete=capture,
                                   lineage=dict(allTerminal=terminal)), cancel))
 
+    def test_real_observation_trace_fake_fd_audit(self):
+        for raw in (b'', b'abcdefg'):
+            with fake_files(self, {'trace.raw': raw}) as disk:
+                result = E.observation_trace(2)
+                self.assertEqual(result, dict(file='trace.raw', bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
+                    metadata=dict(dev=1, ino=10, size=len(raw), mtimeNs=3, ctimeNs=4,
+                                  uid=42, mode=0o100600, nlink=1)))
+                self.assertEqual(disk.closed, [1000])
+        cases = [dict(fd_change={'st_mtime_ns': 9}), dict(path_change={'st_ctime_ns': 9}),
+                 dict(path_change={'st_ino': 99}), dict(base_change={'st_size': 8 * 1024 * 1024 + 1}),
+                 dict(base_change={'st_size': 4}), dict(base_change={'st_uid': 0}),
+                 dict(base_change={'st_mode': 0o100644}), dict(base_change={'st_nlink': 2})]
+        for changes in cases:
+            with self.subTest(changes=changes), fake_files(self, {'trace.raw': b'abc'}, **changes), self.assertRaises(ValueError):
+                E.observation_trace(2)
+
+    def test_real_probe_candidate_fake_fd_success_and_validation(self):
+        receipt = dict(schema='ak5597-artifact-probe.v1', acquisition=False, qualification=False)
+        raw = C.encode(receipt)
+        files = {'probe-receipt.json': raw, P.WRITE_NAME: P.WRITE_BYTES}
+        supervision = dict(captureComplete=True, lineage=dict(allTerminal=True))
+        with fake_files(self, files) as disk:
+            row = O.probe_candidate(2, supervision, D.Cancellation())
+            self.assertEqual(row, dict(file='probe-receipt.json', bytes=len(raw),
+                sha256=hashlib.sha256(raw).hexdigest(), sha512=hashlib.sha512(raw).hexdigest()))
+            self.assertEqual([h[0] for h in disk.handles.values()], ['probe-receipt.json', P.WRITE_NAME])
+            self.assertEqual(disk.closed, [1000, 1001])
+        variants = [dict(files, extra=b''), {'probe-receipt.json': raw},
+                    dict(files, **{P.WRITE_NAME: b'x' * len(P.WRITE_BYTES)}),
+                    dict(files, **{'probe-receipt.json': b'{'})]
+        for change in (dict(schema='wrong'), dict(acquisition=True), dict(qualification=True)):
+            variants.append(dict(files, **{'probe-receipt.json': C.encode(dict(receipt, **change))}))
+        for files in variants:
+            with self.subTest(files=files), fake_files(self, files), self.assertRaises(ValueError):
+                O.probe_candidate(2, supervision, D.Cancellation())
+        # A valid candidate is custody only: this deliberately minimal receipt is NOT P.verify proof.
+
     def export_fixture(self, *, fail=None, when=None, candidate=None, extra=False):
+
         cancel, written, copies = D.Cancellation(), {}, []
         trace = dict(file='trace.raw', bytes=3, sha256=hashlib.sha256(b'abc').hexdigest(), metadata={'size': 3})
         supervision = dict(schema='ak5597-observation-supervisor.v1', childRole='tracer',
@@ -488,6 +660,7 @@
         self.assertEqual(closed, [2])
 
     def operation_fixture(self, *, launch_error=False, cancel_at=None):
+        value = review()  # Construct policy while the real S constants are still bound.
         cancel, events, exported = D.Cancellation(), [], []
         fake_c = NS(**vars(C)); fake_c.new_dir = lambda *_: 50
         fake_c.identity = lambda _: (1, 2)
@@ -517,12 +690,13 @@
             args[-1].extend([20, 21, 22, 23])
             return {}, [({}, 20)], 21, {}, 22, 23, 24
         def pin(_, fds):
-            fds.append(88); return 88
+            fds.append(88); return 88, ('fake-snapshot',)
         with patch.dict(O.operation.__globals__, C=fake_c, E=fake_e, P=fake_p, S=fake_s, os=fake_os,
                 review_projection=lambda r: r, pin_tracer=pin,
+                supervise_pinned=lambda *args: supervise(*args[:5]),
                 invocation=lambda *_: list(O.PREFIX) + ['/usr/bin/bwrap'],
                 probe_candidate=lambda *_: None):
-            result = O.operation(cancel, (fake_c, fake_e, fake_p, review(), {}, '/fixture'),
+            result = O.operation(cancel, (fake_c, fake_e, fake_p, value, {}, '/fixture'),
                                  preflight, None, '7' * 64)
         return result, exported, events, cancel
 
```

```diff
--- a/docs/project/pi-0844-isolated-qualification/2026-09-09-artifact-acquisition-source-review.md
+++ b/docs/project/pi-0844-isolated-qualification/2026-09-09-artifact-acquisition-source-review.md
@@ -6,6 +6,10 @@
 
 # AK5597 artifact acquisition — current source review packet
 
+Current observer corrections, exact diffs/hashes and separate unexecuted fake-only test plan:
+[2026-09-10 helper observation source review](2026-09-10-helper-observation-source-review.md).
+Historical evidence and freeze inventories below are not current-source acceptance.
+
 ## Latest observed runtime failure and source-only correction
 
 The proposal/history below predates the following events. Parent completed the
@@ -646,8 +650,10 @@
 Popen's child is explicitly the TRACER. The new schema exposes tracerCreated/Reaped/status,
 not the ordinary childReaped field. pidfd_send_signal(SIGKILL) targets that owned child;
 pidfd acquisition failure falls back only to that still-owned Popen object's kill, never
-os.kill of a discovered PID, killpg or a process census. Launch/stream/poll/wait/kill errors,
-EOF-with-live-tracer, and reaped-tracer-with-open-pipes cannot become normal completion.
+os.kill of a discovered PID, killpg or a process census. Launch/stream/poll/wait/kill errors and
+persistent EOF/reap mismatches cannot become normal completion. Transient EOF before reap
+or reap before EOF can complete normally once both arrive before the deadline. A persistent
+mismatch reaches the1900s timeout, then bounded settlement; it is not an immediate error.
 The driver nonraising signal latch remains active through poll, wait, export and FD close.
 An unexpected missing supervisor return records creation UNKNOWN and settlement pending,
 not fabricated no-child evidence.
```

## Current byte inventory (source hashing only)

Paths relative to C. Historical input hashes for the four edited existing files:

```text
0e778e7700aec688b6f1559c22676ab4066f011a84c4ae2fb85718e6d20e5cba  artifact-observation.py (before)
e7faf964e6c8349b909c9de2bfe5f231d76f7fa6561133fd5086bbfdf581aaf9  artifact-observation-lineage.py (before)
c0ad7f2ca019d3558dad022994f0b1a518f0d028928ae1afdb00a5c8119bb7c1  artifact-observation-tests.py (before)
99d5733d44f552bc2f3d15dadc0f54f1ad1e92c706b5e8efe840c20d652b4d9c  2026-09-09-artifact-acquisition-source-review.md (before)
```

Current hashes of edited files (this entirely new document is hashed externally):

```text
7bcbeab0f32a8bc6e273d7c3af90a80a74a0978bd84ba2b01c2089355d32d7f6  scripts/pi-host-compatibility-canary/artifact-observation.py
594b3b82e18a17e7499945c512f48e1339d5ecfcc023136003eb600955cffdb8  scripts/pi-host-compatibility-canary/artifact-observation-lineage.py
b3da1e364a89129dc66afc034002d8d978ace341cc78b71e2f7d15a473d353e4  scripts/pi-host-compatibility-canary/artifact-observation-tests.py
f3fbafb5a6c72990ed9a534c1d4ea7b38530899c94208f59ca6da36c7e285fb9  docs/project/pi-0844-isolated-qualification/2026-09-09-artifact-acquisition-source-review.md
```

Unedited sibling source hashes, observed at entry and again after corrections:

```text
d6f4f078dd02d648da06acf437c40949d66bec60c3ed1fd31a68262bd72d68f4  scripts/pi-host-compatibility-canary/artifact-observation-supervisor.py
336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543  scripts/pi-host-compatibility-canary/artifact-contract.py
c4dfc47f1bd97a0bba736097dd839e1745b68713be731adfae54efe9dc11fc82  scripts/pi-host-compatibility-canary/artifact-driver.py
cefd26866df11b53779efcf59f6d8b6c234cc9120759dd792f875f134744c089  scripts/pi-host-compatibility-canary/artifact-export.py
03c47a850e579b39158136fc89a448501a5508054ff780441cd3ebff2f12d2d3  scripts/pi-host-compatibility-canary/artifact-probe.py
90ca8fd9b21476aee6e672367efda5367e78e4ab0916b71f643328db9790473a  scripts/pi-host-compatibility-canary/artifact-worker.py
6c18a36862d23f1b677bacd57bb3a2c257499d0372c1e6095a8ce6528aa8fb36  scripts/pi-host-compatibility-canary/artifact-tests.py
```

No complete freeze/toolchain/other-root inventory or external-input validation is implied.
Document SHA256 is reported externally, avoiding self-reference. Source diffs are not
execution evidence; corrected bytes remain pending parent review and complete freeze.
