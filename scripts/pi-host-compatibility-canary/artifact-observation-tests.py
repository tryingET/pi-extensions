"""AUTHORED, NOT EXECUTED. Separately admitted pure tests only: synthetic lines/fakes.
No fixture directories, binaries, subprocesses, /proc, network, cleanup or runtime traces.
Existing artifact-tests.py's 41 test methods remain untouched.
"""
import copy
from contextlib import contextmanager
import hashlib
from pathlib import Path
import runpy
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
C = NS(**runpy.run_path(str(HERE / 'artifact-contract.py')))
D = NS(**runpy.run_path(str(HERE / 'artifact-driver.py')))
E = NS(**runpy.run_path(str(HERE / 'artifact-export.py'), init_globals={'C': C}))
P = NS(**runpy.run_path(str(HERE / 'artifact-probe.py'), init_globals={'C': C}))
L = NS(**runpy.run_path(str(HERE / 'artifact-observation-lineage.py')))
S = NS(**runpy.run_path(str(HERE / 'artifact-observation-supervisor.py')))
O = NS(**runpy.run_path(str(HERE / 'artifact-observation.py'), init_globals=dict(C=C, E=E, P=P, L=L, S=S)))

ROOT = '[pid 100] execve("/usr/bin/bwrap", ["/usr/bin/bwrap"], 0x123 /* 1 var */) = 0\n'
FORK = '[pid 100] clone(child_stack=NULL, flags=CLONE_NEWNS|CLONE_NEWPID|SIGCHLD, child_tidptr=NULL) = 101\n'
WORKER = ('[pid 101] execve("/runtime/bin/python3", ["/runtime/bin/python3", "-I", "-S", "-B", '
          '"/code/artifact-worker.py", "--probe"], 0x456 /* 0 vars */) = 0\n')
EXITS = '[pid 101] exit_group(0) = ?\n[pid 101] +++ exited with 0 +++\n[pid 100] +++ exited with 0 +++\n'
TRACE = (ROOT + FORK + WORKER + EXITS).encode()


def parse(raw=TRACE, complete=True, chunk=7):
    parser = L.Lineage()
    for i in range(0, len(raw), chunk):
        parser.feed(raw[i:i + chunk])
    return parser.finish(complete)


def review():
    return dict(schema=O.REVIEW_SCHEMA, task=5597, label=C.LABEL, mode='observe-helper',
        authorizationReference='NEW independently reviewed fixture; NOT authority',
        codeSha256={name: '1' * 64 for name in C.CODE + O.FILES}, driverPythonSha256='2' * 64,
        bwrapSha256='3' * 64, toolchainPath='/fixture/toolchain.json', toolchainSha256='4' * 64,
        scratchRunsRoot=dict(path='/fixture/runs', dev=1, ino=2),
        exportParent=dict(path='/fixture/exports', dev=1, ino=3),
        exportName='ak5597-artifacts-observation-new-fixture',
        observer=dict(schema='ak5597-helper-observer-config.v1', stracePath='/usr/bin/strace',
            straceSha256=O.STRACE_SHA256, policySha256=hashlib.sha256(C.encode(O.policy())).hexdigest(),
            helperArgvTemplateSha256='6' * 64, purpose='calibration-only-no-readiness'))


class FakeDisk:
    def __init__(self):
        self.data = bytearray()
        self.maximum_write = 4096
        self.fail_after = None
        self.sync_error = False

    def write(self, fd, block):
        if fd != 90:
            raise AssertionError('unexpected trace FD')
        if self.fail_after is not None and len(self.data) >= self.fail_after:
            raise OSError('synthetic disk full')
        n = min(self.maximum_write, len(block))
        self.data.extend(block[:n])
        return n

    def fsync(self, _):
        if self.sync_error:
            raise OSError('synthetic fsync')

    def fstat(self, _):
        return NS(st_size=len(self.data), st_dev=1, st_ino=2, st_mode=0o100600,
                  st_uid=42, st_nlink=1, st_mtime_ns=3, st_ctime_ns=4)


class FakeFiles:
    """Integer handles only; no fallback to real FD/path operations."""
    def __init__(self, case, files, *, base_change=None, fd_change=None, path_change=None):
        self.case, self.files = case, files
        self.base_change, self.fd_change, self.path_change = base_change or {}, fd_change or {}, path_change or {}
        self.handles, self.closed = {}, []
        real_os = C.regular.__globals__['os']
        constants = {k: getattr(real_os, k) for k in ('O_RDONLY', 'O_NOFOLLOW', 'O_CLOEXEC', 'O_NONBLOCK', 'SEEK_SET')}
        self.os = NS(**constants, open=self.open, read=self.read, lseek=self.lseek,
                     fstat=self.fstat, stat=self.stat, close=self.close, getuid=lambda: 42)

    def metadata(self, name):
        return dict(st_dev=1, st_ino=10 + list(self.files).index(name), st_size=len(self.files[name]),
                    st_mtime_ns=3, st_ctime_ns=4, st_uid=42, st_gid=42, st_mode=0o100600, st_nlink=1)

    def open(self, name, flags, *, dir_fd):
        self.case.assertEqual(dir_fd, 2)
        self.case.assertEqual(flags, self.os.O_RDONLY | self.os.O_NOFOLLOW | self.os.O_CLOEXEC | self.os.O_NONBLOCK)
        self.case.assertIn(name, self.files)
        fd = 1000 + len(self.handles); self.handles[fd] = [name, 0]
        return fd

    def read(self, fd, n):
        self.case.assertGreater(n, 0)
        name, offset = self.handles[fd]
        block = self.files[name][offset:offset + min(n, 3)]
        self.handles[fd][1] += len(block)
        return block

    def lseek(self, fd, offset, whence):
        self.case.assertEqual((offset, whence), (0, self.os.SEEK_SET))
        self.handles[fd][1] = 0

    def fstat(self, fd):
        name, offset = self.handles[fd]
        fields = dict(self.metadata(name), **self.base_change)
        if offset: fields.update(self.fd_change)
        return NS(**fields)

    def stat(self, name, *, dir_fd, follow_symlinks):
        self.case.assertEqual((dir_fd, follow_symlinks), (2, False))
        fields = dict(self.metadata(name), **self.base_change); fields.update(self.path_change)
        return NS(**fields)

    def close(self, fd):
        self.case.assertIn(fd, self.handles); self.case.assertNotIn(fd, self.closed)
        self.closed.append(fd)


@contextmanager
def fake_files(case, files, **changes):
    disk = FakeFiles(case, files, **changes)
    fake_c = NS(**vars(C)); fake_c.directory_names = lambda d: list(files) if d == 2 else case.fail('directory')
    with patch.dict(C.regular.__globals__, os=disk.os), patch.dict(E.open_source.__globals__, C=fake_c, os=disk.os), \
            patch.dict(O.probe_candidate.__globals__, C=fake_c, os=disk.os):
        try:
            yield disk
        finally:
            case.assertEqual(set(disk.closed), set(disk.handles))


class FakeSelector:

    def __init__(self, clock):
        self.entries, self.clock = {}, clock
        self.closed = False

    def register(self, pipe, _, name):
        self.entries[pipe.number] = NS(fd=pipe.number, fileobj=pipe, data=name)

    def unregister(self, pipe):
        del self.entries[pipe.number]

    def select(self, timeout):
        self.clock[0] += timeout
        return [(key, 1) for key in list(self.entries.values())]

    def close(self):
        self.closed = True


class FakeChild:
    def __init__(self, cancel, when=None):
        self.pid, self.cancel, self.when = 900, cancel, when
        self.polls, self.waits, self.kills, self.closed = 0, [], 0, []
        self.exit_status = 0
        self.poll_error = self.wait_error = self.kill_error = False
        def pipe(n):
            return NS(number=n, fileno=lambda: n, close=lambda: self.closed.append(n))
        self.stdout, self.stderr = pipe(10), pipe(11)

    def poll(self):
        self.polls += 1
        if self.when == 'poll':
            self.cancel.record()
        if self.poll_error:
            raise OSError('synthetic poll')
        return self.exit_status

    def wait(self, *, timeout):
        self.waits.append(timeout)
        if self.when == 'wait':
            self.cancel.record()
        if self.wait_error:
            raise TimeoutError('synthetic wait timeout')
        return self.exit_status

    def kill(self):
        self.kills += 1
        if self.kill_error:
            raise OSError('synthetic kill')
        self.exit_status = -9


class Observation(unittest.TestCase):
    def test_observer_review_exact_schema_source_set_policy(self):
        value = review()
        projection = O.review_projection(value)
        self.assertEqual(projection['mode'], 'probe')
        self.assertEqual(projection['schema'], 'ak5597-artifact-launch-review.v2')
        self.assertNotIn('observer', projection)
        self.assertEqual(value['mode'], 'observe-helper')
        mutations = [lambda r: r.update(schema='ak5597-artifact-launch-review.v2'),
            lambda r: r.update(mode='probe'), lambda r: r.update(extra=True),
            lambda r: r['codeSha256'].pop(O.FILES[0]),
            lambda r: r['codeSha256'].update(unreviewed='1' * 64),
            lambda r: r['observer'].update(stracePath='/fixture/strace'),
            lambda r: r['observer'].update(policySha256='0' * 64),
            lambda r: r['observer'].update(straceSha256='bad'),
            lambda r: r['observer'].update(purpose='acquire'),
            lambda r: r['observer'].update(extra=True),
            lambda r: r.update(exportName='ak5597-artifacts-old-probe')]
        for mutate in mutations:
            changed = copy.deepcopy(value); mutate(changed)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                O.review_projection(changed)

    def test_no_observation_in_ordinary_mode_or_acquisition_sequence(self):
        with self.assertRaises(ValueError):
            D.phases('observe-helper', lambda *_: self.fail('ordinary launch'), None, None, None, D.Cancellation())
        with self.assertRaises(ValueError):
            D.argv_for({}, [], 1, 2, 'observe-helper')
        result = O.status(True, True)
        for name in ('good', 'readiness', 'verifiedProbe', 'acquisition', 'qualification', 'verifiedRuntimeLineage'):
            self.assertIs(result[name], False)
        self.assertEqual(O.RUBRIC['expectedTemporaryFiles'], 112)
        self.assertFalse(O.policy()['topologyVerificationImplemented'])

    def test_exact_prefix_template_mounts_and_inherited_descriptors(self):
        value = review()
        mounted = [(dict(role='stdlib', target='/runtime/f%d' % i), i + 20) for i in range(111)]
        template = D.argv_for({}, [(r, 'input:%d' % i) for i, (r, _) in enumerate(mounted)],
                              'config', 'output', 'probe')
        value['observer']['helperArgvTemplateSha256'] = hashlib.sha256(C.encode(template)).hexdigest()
        argv = O.invocation(D.argv_for, {}, mounted, 140, 141, value)
        self.assertEqual(argv[:len(O.PREFIX)], list(O.PREFIX))
        helper = argv[len(O.PREFIX):]
        self.assertEqual(helper, D.argv_for({}, mounted, 140, 141, 'probe'))
        self.assertEqual(helper.count('--ro-bind-data'), 112)
        self.assertEqual(helper[-1], '--probe')
        self.assertIn('--unshare-net', helper)
        for option in ('-p', '-D', '-o', '-ff', '-v', '--bind', '--share-net', '--read=all', '--write=all'):
            self.assertNotIn(option, argv)
        self.assertIn('--always-show-pid', argv)
        self.assertIn('read=none', argv); self.assertIn('write=none', argv)
        self.assertNotIn('write', O.DECODE.split(',')); self.assertNotIn('ioctl', O.DECODE.split(','))
        for bad in (mounted[:-1], mounted + [mounted[0]]):
            with self.assertRaises(ValueError):
                O.invocation(D.argv_for, {}, bad, 140, 141, value)
        value['observer']['helperArgvTemplateSha256'] = '0' * 64
        with self.assertRaises(ValueError):
            O.invocation(D.argv_for, {}, mounted, 140, 141, value)

    def test_tracer_pin_rejects_owner_privilege_mode_hash_and_links(self):
        data = b'not an ELF; fake bytes only'
        value = review(); value['observer']['straceSha256'] = hashlib.sha256(data).hexdigest()
        base = dict(st_uid=0, st_gid=0, st_mode=0o100755, st_nlink=1, st_dev=1, st_ino=2,
                    st_size=len(data), st_mtime_ns=3, st_ctime_ns=4)
        fake = NS(**vars(C)); fake.open_file = lambda *_: 88; fake.read_fd = lambda *_: data
        for fields, good in ((base, True), (dict(base, st_uid=42), False),
            (dict(base, st_mode=0o104755), False), (dict(base, st_mode=0o100777), False),
            (dict(base, st_nlink=2), False), (dict(base, st_mode=0o100644), False)):
            fake.regular = lambda *_, fields=fields: NS(**fields)
            with patch.dict(O.pin_tracer.__globals__, C=fake):
                if good:
                    fds = []; self.assertEqual(O.pin_tracer(value, fds), (88, O.executable_metadata(NS(**base))))
                    self.assertEqual(fds, [88])
                else:
                    with self.assertRaises(ValueError): O.pin_tracer(value, [])
        fake.regular = lambda *_: NS(**base)
        value['observer']['straceSha256'] = '0' * 64
        with patch.dict(O.pin_tracer.__globals__, C=fake), self.assertRaises(ValueError):
            O.pin_tracer(value, [])

    def test_tracer_pin_same_inode_metadata_change_during_hash(self):
        data = b'fake tracer bytes'
        value = review(); value['observer']['straceSha256'] = hashlib.sha256(data).hexdigest()
        base = dict(st_uid=0, st_gid=0, st_mode=0o100755, st_nlink=1, st_dev=1, st_ino=2,
                    st_size=len(data), st_mtime_ns=3, st_ctime_ns=4)
        for field in ('st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_uid', 'st_gid', 'st_mode', 'st_nlink'):
            samples = iter((NS(**base), NS(**dict(base, **{field: base[field] + 1}))))
            fake = NS(**vars(C)); fake.open_file = lambda *_: 88; fake.read_fd = lambda *_: data
            fake.regular = lambda *_: next(samples)
            with self.subTest(field=field), patch.dict(O.pin_tracer.__globals__, C=fake), self.assertRaises(ValueError):
                O.pin_tracer(value, [])

    def test_complete_synthetic_lineage_is_never_actual_proof(self):

        result = parse()
        self.assertEqual(result['status'], 'source-dialect-complete')
        self.assertTrue(result['allTerminal']); self.assertTrue(result['allExitZero'])
        self.assertEqual([n['pid'] for n in result['processes']], [100, 101])
        self.assertEqual(result['processes'][1]['parent'], 100)
        self.assertFalse(result['calibrated']); self.assertFalse(result['verifiedRuntimeLineage'])
        self.assertFalse(result['helperReapedByDriver']); self.assertFalse(result['descendantSettlementCertified'])

    def test_unfinished_clone_child_runs_before_parent_resumes(self):
        raw = ROOT + '[pid 100] clone(child_stack=NULL, flags=SIGCHLD, child_tidptr=NULL <unfinished ...>\n'
        raw += WORKER + '[pid 100] <... clone resumed>) = 101\n' + EXITS
        self.assertTrue(parse(raw.encode())['allTerminal'])
        raw = raw.replace('<... clone resumed>', '<... fork resumed>')
        self.assertFalse(parse(raw.encode())['allTerminal'])

    def test_fork_vfork_clone3_and_failed_clone(self):
        variants = ['fork() = 101', 'vfork() = 101', 'clone(child_stack=NULL, flags=SIGCHLD) = 101',
                    'clone3({flags=CLONE_NEWNS, exit_signal=SIGCHLD}, 88) = 101']
        for call in variants:
            raw = ROOT + '[pid 100] clone3({flags=0, exit_signal=SIGCHLD}, 88) = -1 ENOSYS (Function not implemented)\n'
            raw += '[pid 100] ' + call + '\n' + WORKER + EXITS
            with self.subTest(call=call): self.assertTrue(parse(raw.encode())['allTerminal'])

    def test_missing_duplicate_disconnected_terminal_or_exec_refuses(self):
        variants = [TRACE[:-1], TRACE.replace(FORK.encode(), b''),
            TRACE.replace(EXITS.encode(), b'[pid 100] +++ exited with 0 +++\n'),
            TRACE.replace(WORKER.encode(), b''), TRACE.replace(ROOT.encode(), b''),
            TRACE.replace(FORK.encode(), (FORK + FORK).encode()),
            TRACE + b'[pid 101] +++ exited with 0 +++\n',
            TRACE + b'[pid 102] +++ exited with 0 +++\n',
            TRACE.replace(b'= 101\n', b'= 100\n'),
            TRACE.replace(b'"--probe"', b'"--acquire"')]
        for raw in variants:
            with self.subTest(raw=raw[:50]): self.assertFalse(parse(raw)['allTerminal'])
        self.assertFalse(parse(TRACE, complete=False)['allTerminal'])

    def test_unknown_state_detach_escape_diagnostics_and_truncation_refuse(self):
        bad = ['[ Process 101 detached ]', 'strace: Process 101 attached extra', 'helper stderr diagnostic',
            '[pid 100] +++ exited with 999 +++', '[pid 100] +++ killed by SIGUNKNOWN +++',
            '[pid 100] future_fork(0) = 102', '[pid 100] execveat(1, "x", [], [], 0) = 0',
            '[pid 100] clone(child_stack=NULL, flags=CLONE_UNTRACED|SIGCHLD, child_tidptr=NULL) = 102',
            '[pid 100] clone(child_stack=NULL, flags=CLONE_THREAD|SIGCHLD, child_tidptr=NULL) = 102',
            '[pid 100] clone(child_stack=NULL, flags=0x800000, child_tidptr=NULL) = 102',
            '[pid 100] clone(child_stack=NULL, flags=SIGCHLD, child_tidptr=NULL) = 2 /* 102 in strace PID NS */',
            '[pid 100] openat(AT_FDCWD, "truncated"..., O_RDONLY) = 9',
            '[pid 100] +++ superseded by execve in pid 101 +++',
            '[pid 100] <... read resumed>) = 1', '[pid 100] read(0x1, 0x2, 0x3 <unfinished ...>']
        for line in bad:
            raw = (ROOT + line + '\n' + FORK + WORKER + EXITS).encode()
            with self.subTest(line=line): self.assertEqual(parse(raw)['status'], 'inconclusive')

    def test_signals_terminal_status_and_unpaired_fatal_are_conservative(self):
        raw = (ROOT + FORK + WORKER + '[pid 101] --- SIGTERM {si_signo=SIGTERM, si_code=SI_USER} ---\n'
               + '[pid 101] +++ killed by SIGTERM +++\n[pid 100] +++ exited with 1 +++\n').encode()
        result = parse(raw)
        self.assertTrue(result['allTerminal']); self.assertFalse(result['allExitZero'])
        self.assertEqual(result['signals'], 1)
        raw = raw.replace(b'[pid 101] ---', b'[pid 101] read(0x1, 0x2, 0x3 <unfinished ...>\n[pid 101] ---')
        self.assertFalse(parse(raw)['allTerminal'])

    def test_attach_is_not_parentage_and_parser_bounds(self):
        self.assertTrue(parse(b'[ Process 101 attached ]\n' + TRACE)['allTerminal'])
        self.assertFalse(parse(b'[ Process 102 attached ]\n' + TRACE)['allTerminal'])
        self.assertFalse(parse(b'x' * (L.LINE_MAX + 1))['allTerminal'])
        with patch.dict(L.Lineage.line.__globals__, EVENT_MAX=2):
            self.assertFalse(parse()['allTerminal'])
        with patch.dict(L.Lineage.node.__globals__, PID_MAX=1):
            self.assertFalse(parse()['allTerminal'])
        self.assertFalse(parse(TRACE.replace(b'100]', b'2147483648]'))['allTerminal'])

    def test_attach_after_helper_or_worker_terminal_refuses(self):
        for pid in (100, 101):
            with self.subTest(pid=pid):
                self.assertFalse(parse(TRACE + ('[ Process %d attached ]\n' % pid).encode())['allTerminal'])

    def test_repeated_attach_refuses_without_losing_early_child(self):
        attach = '[ Process 101 attached ]\n'
        self.assertFalse(parse((attach + attach).encode() + TRACE)['allTerminal'])
        self.assertFalse(parse((ROOT + attach + FORK + WORKER + attach + EXITS).encode())['allTerminal'])
        raw = ROOT + '[pid 100] clone(child_stack=NULL, flags=SIGCHLD <unfinished ...>\n'
        raw += attach + WORKER + '[pid 101] +++ exited with 0 +++\n'
        raw += '[pid 100] <... clone resumed>) = 101\n[pid 100] +++ exited with 0 +++\n'
        self.assertTrue(parse(raw.encode())['allTerminal'])

    def capture_fixture(self, disk=None):

        disk = disk or FakeDisk()
        fake_os = NS(write=disk.write, fsync=disk.fsync, fstat=disk.fstat)
        return disk, fake_os, S.Capture(90, L.Lineage())

    def test_capture_exact_hard_cap_and_overflow_prefix_hash(self):
        disk, fake_os, capture = self.capture_fixture()
        with patch.dict(S.Capture.append.__globals__, os=fake_os):
            for _ in range(S.TRACE_MAX // S.CHUNK):
                capture.append(b'x' * S.CHUNK)
            self.assertFalse(capture.overflow)
            capture.append(b'not-retained')
            result = capture.finish()
        self.assertEqual(len(disk.data), S.TRACE_MAX)
        self.assertEqual(result['bytes'], S.TRACE_MAX)
        self.assertEqual(result['sha256'], hashlib.sha256(disk.data).hexdigest())
        self.assertTrue(result['overflow']); self.assertFalse(result['writeOrSyncFailed'])
        self.assertEqual(result['observedBytes'], S.TRACE_MAX + len(b'not-retained'))

    def test_partial_writes_disk_failure_and_fsync_keep_exact_prefix(self):
        disk = FakeDisk(); disk.maximum_write = 3; disk.fail_after = 6
        _, fake_os, capture = self.capture_fixture(disk)
        with patch.dict(S.Capture.append.__globals__, os=fake_os):
            with self.assertRaises(OSError): capture.append(b'abcdefghij')
            result = capture.finish()
        self.assertEqual(bytes(disk.data), b'abcdef')
        self.assertEqual(result['sha256'], hashlib.sha256(b'abcdef').hexdigest())
        self.assertEqual(result['bytes'], 6); self.assertTrue(result['writeOrSyncFailed'])
        disk, fake_os, capture = self.capture_fixture(); disk.sync_error = True
        with patch.dict(S.Capture.append.__globals__, os=fake_os):
            capture.append(b'abc'); result = capture.finish()
        self.assertEqual(result['bytes'], 3); self.assertTrue(result['writeOrSyncFailed'])
        self.assertIsNone(result['metadata'])

    def test_capture_rejects_oversized_chunk_and_zero_write(self):
        disk, fake_os, capture = self.capture_fixture()
        with patch.dict(S.Capture.append.__globals__, os=fake_os):
            with self.assertRaises(ValueError): capture.append(b'x' * (S.CHUNK + 1))
            self.assertEqual(disk.data, b'')
            disk.maximum_write = 0
            with self.assertRaises(OSError): capture.append(b'x')
        self.assertTrue(capture.failed); self.assertEqual(capture.used, 0)

    def supervise_fixture(self, *, when=None, configure=None, stderr=None, stdout=None,
                          launch_error=False, pidfd_error=False, read_error=False, pinned=False,
                          tracer_fd_change=None, tracer_path_change=None):
        cancel = D.Cancellation()
        child = FakeChild(cancel, when)
        if configure: configure(child)
        disk, _, capture = self.capture_fixture()
        clock = [0.0]; selector = FakeSelector(clock)
        chunks = {10: list(stdout if stdout is not None else [b'',]),
                  11: list(stderr if stderr is not None else [TRACE, b''])}
        calls, signals = [], []
        def popen(argv, **kwargs):
            calls.append((argv, kwargs))
            if launch_error: raise OSError('fake launch')
            return child
        def read(fd, n):
            self.assertEqual(n, 4096)
            if read_error: raise OSError('fake pipe read')
            if chunks[fd]: return chunks[fd].pop(0)
            raise BlockingIOError('pipe held open')
        def pidfd_open(pid, flags):
            self.assertEqual((pid, flags), (900, 0))
            if pidfd_error: raise OSError('fake pidfd unavailable')
            return 80
        def send(fd, sig):
            self.assertEqual(fd, 80); signals.append((fd, sig)); child.kill()
        base = dict(st_dev=1, st_ino=2, st_size=10, st_mtime_ns=3, st_ctime_ns=4,
                    st_uid=0, st_gid=0, st_mode=0o100755, st_nlink=1)
        current_fd, current_path = dict(base), dict(base)
        snapshot = O.executable_metadata(NS(**base))
        def make_selector():
            current_fd.update(tracer_fd_change or {}); current_path.update(tracer_path_change or {})
            return selector
        def fstat(fd):
            return NS(**current_fd) if fd == 88 else NS(**base) if fd == 24 else disk.fstat(fd)
        def stat(path, *, follow_symlinks):
            self.assertFalse(follow_symlinks); self.assertIn(path, ('/usr/bin/strace', '/usr/bin/bwrap'))
            return NS(**(current_path if path == '/usr/bin/strace' else base))
        fake_os = NS(write=disk.write, fsync=disk.fsync, fstat=fstat, stat=stat, read=read,
                     pidfd_open=pidfd_open, set_blocking=lambda *_: None, close=lambda *_: None)

        fake_time = NS(monotonic=lambda: clock[0], sleep=lambda delay: clock.__setitem__(0, clock[0] + delay))
        with patch.dict(S.supervise.__globals__, os=fake_os, time=fake_time,
                selectors=NS(DefaultSelector=make_selector, EVENT_READ=1),
                subprocess=NS(Popen=popen, DEVNULL=-3, PIPE=-1),
                signal=NS(SIGKILL=9, pidfd_send_signal=send)), patch.dict(O.supervise_pinned.__globals__, os=fake_os):
            args = (['/usr/bin/strace', '--', '/usr/bin/bwrap'], [20, 21, 22], '/fake/approved/tmp', cancel, capture)
            result = O.supervise_pinned(*args, (88, snapshot), 24) if pinned else S.supervise(*args)

        return result, child, calls, signals, disk, clock[0]

    def test_supervised_child_role_stderr_custody_and_no_extra_fds(self):
        result, child, calls, signals, disk, _ = self.supervise_fixture()
        self.assertTrue(result['tracerReaped']); self.assertTrue(result['captureComplete'])
        self.assertEqual(result['childRole'], 'tracer'); self.assertNotIn('childReaped', result)
        self.assertFalse(result['helperReapedByDriver']); self.assertFalse(result['readiness'])
        self.assertEqual(child.waits, [0]); self.assertEqual(signals, [])
        self.assertEqual(bytes(disk.data), TRACE)
        args = calls[0][1]
        self.assertEqual(args['pass_fds'], (20, 21, 22))
        self.assertTrue(args['close_fds']); self.assertTrue(args['start_new_session'])
        self.assertEqual(args['env'], {'TMPDIR': '/fake/approved/tmp'})
        self.assertNotIn(90, args['pass_fds']); self.assertNotIn(80, args['pass_fds'])

    def test_pinned_popen_rechecks_hash_snapshot_after_selector_setup(self):
        result, _, calls, *_ = self.supervise_fixture(pinned=True)
        self.assertTrue(result['captureComplete']); self.assertEqual(len(calls), 1)
        for change in ({'st_mtime_ns': 9}, {'st_ctime_ns': 9}, {'st_size': 11}, {'st_mode': 0o100777},
                       {'st_uid': 42}, {'st_gid': 42}, {'st_nlink': 2}, {'st_ino': 9}, {'st_dev': 9}):
            for fd_change, path_change in ((change, change), (change, None), (None, change)):
                with self.subTest(fd=fd_change, path=path_change):
                    result, _, calls, *_ = self.supervise_fixture(pinned=True,
                        tracer_fd_change=fd_change, tracer_path_change=path_change)
                    self.assertFalse(result['tracerCreated']); self.assertFalse(result['captureComplete'])
                    self.assertEqual(result['reason'], 'launch-failed'); self.assertEqual(calls, [])

    def test_poll_and_wait_cancellation_never_green(self):

        for when in ('poll', 'wait'):
            result, child, _, _, _, _ = self.supervise_fixture(when=when)
            self.assertTrue(result['cancelled']); self.assertEqual(result['reason'], 'interrupted')
            self.assertTrue(result['tracerReaped']); self.assertFalse(result['captureComplete'])
            self.assertFalse(result['lineage']['allTerminal']); self.assertTrue(all(t == 0 for t in child.waits))

    def test_launch_pidfd_poll_wait_kill_and_read_failures_are_bounded(self):
        cases = [dict(launch_error=True), dict(pidfd_error=True), dict(read_error=True),
            dict(configure=lambda c: setattr(c, 'poll_error', True)),
            dict(configure=lambda c: setattr(c, 'wait_error', True)),
            dict(configure=lambda c: (setattr(c, 'exit_status', None), setattr(c, 'kill_error', True)))]
        for case in cases:
            result, child, _, _, _, elapsed = self.supervise_fixture(**case)
            with self.subTest(case=case):
                self.assertFalse(result['captureComplete']); self.assertFalse(result['readiness'])
                self.assertLessEqual(elapsed, S.WALL_SECONDS + S.SETTLE_SECONDS + 1)
                self.assertTrue(all(t == 0 for t in child.waits))
                self.assertFalse(result['descendantSettlementCertified'])

    def test_eof_live_child_and_reaped_child_open_pipes_not_complete(self):
        result, child, _, signals, _, elapsed = self.supervise_fixture(configure=lambda c: setattr(c, 'exit_status', None))
        self.assertFalse(result['captureComplete']); self.assertEqual(result['reason'], 'timeout')
        self.assertEqual(len(signals), 1); self.assertTrue(result['tracerReaped'])
        result, _, _, signals, _, elapsed = self.supervise_fixture(stderr=[TRACE])
        self.assertTrue(result['tracerReaped']); self.assertFalse(result['captureComplete'])
        self.assertEqual(signals, []); self.assertLessEqual(elapsed, S.WALL_SECONDS + S.SETTLE_SECONDS + 1)

    def test_transient_eof_and_reap_order_both_complete(self):
        def delayed(child):
            def poll():
                child.polls += 1
                return None if child.polls < 4 else 0
            child.poll = poll
        for configuration in (dict(configure=delayed), dict(stderr=[TRACE, b''])):
            result, _, _, signals, _, elapsed = self.supervise_fixture(**configuration)
            self.assertTrue(result['captureComplete']); self.assertEqual(result['reason'], 'exited')
            self.assertTrue(all(result['eof'].values())); self.assertTrue(result['tracerReaped'])
            self.assertEqual(signals, []); self.assertLess(elapsed, S.WALL_SECONDS)

    def test_missing_terminal_empty_trace_stdout_and_trace_overflow(self):

        for raw in (b'', (ROOT + FORK + WORKER).encode(), b'unrecognized actual format\n'):
            result, *_ = self.supervise_fixture(stderr=[raw, b''] if raw else [b''])
            self.assertTrue(result['tracerReaped']); self.assertFalse(result['lineage']['allTerminal'])
            self.assertFalse(result['readiness'])
        result, *_ = self.supervise_fixture(stdout=[b'x' * 4096] * 17 + [b''])
        self.assertTrue(result['stdoutOverflow']); self.assertFalse(result['captureComplete'])
        result, _, _, _, disk, _ = self.supervise_fixture(stderr=[b'x' * 4096] * (S.TRACE_MAX // 4096 + 1))
        self.assertEqual(len(disk.data), S.TRACE_MAX); self.assertTrue(result['rawTrace']['overflow'])
        self.assertFalse(result['captureComplete'])

    def test_probe_candidate_never_calls_ordinary_reap_verifier(self):
        for capture, terminal, cancelled in ((False, True, False), (True, False, False), (True, True, True)):
            cancel = D.Cancellation(); cancel.pending = cancelled
            with patch.dict(O.probe_candidate.__globals__, P=NS(verify_output=lambda *_: self.fail('reap adapter'))):
                self.assertIsNone(O.probe_candidate(1, dict(captureComplete=capture,
                                  lineage=dict(allTerminal=terminal)), cancel))

    def test_real_observation_trace_fake_fd_audit(self):
        for raw in (b'', b'abcdefg'):
            with fake_files(self, {'trace.raw': raw}) as disk:
                result = E.observation_trace(2)
                self.assertEqual(result, dict(file='trace.raw', bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                    metadata=dict(dev=1, ino=10, size=len(raw), mtimeNs=3, ctimeNs=4,
                                  uid=42, mode=0o100600, nlink=1)))
                self.assertEqual(disk.closed, [1000])
        cases = [dict(fd_change={'st_mtime_ns': 9}), dict(path_change={'st_ctime_ns': 9}),
                 dict(path_change={'st_ino': 99}), dict(base_change={'st_size': 8 * 1024 * 1024 + 1}),
                 dict(base_change={'st_size': 4}), dict(base_change={'st_uid': 0}),
                 dict(base_change={'st_mode': 0o100644}), dict(base_change={'st_nlink': 2})]
        for changes in cases:
            with self.subTest(changes=changes), fake_files(self, {'trace.raw': b'abc'}, **changes), self.assertRaises(ValueError):
                E.observation_trace(2)

    def test_real_probe_candidate_fake_fd_success_and_validation(self):
        receipt = dict(schema='ak5597-artifact-probe.v1', acquisition=False, qualification=False)
        raw = C.encode(receipt)
        files = {'probe-receipt.json': raw, P.WRITE_NAME: P.WRITE_BYTES}
        supervision = dict(captureComplete=True, lineage=dict(allTerminal=True))
        with fake_files(self, files) as disk:
            row = O.probe_candidate(2, supervision, D.Cancellation())
            self.assertEqual(row, dict(file='probe-receipt.json', bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(), sha512=hashlib.sha512(raw).hexdigest()))
            self.assertEqual([h[0] for h in disk.handles.values()], ['probe-receipt.json', P.WRITE_NAME])
            self.assertEqual(disk.closed, [1000, 1001])
        variants = [dict(files, extra=b''), {'probe-receipt.json': raw},
                    dict(files, **{P.WRITE_NAME: b'x' * len(P.WRITE_BYTES)}),
                    dict(files, **{'probe-receipt.json': b'{'})]
        for change in (dict(schema='wrong'), dict(acquisition=True), dict(qualification=True)):
            variants.append(dict(files, **{'probe-receipt.json': C.encode(dict(receipt, **change))}))
        for files in variants:
            with self.subTest(files=files), fake_files(self, files), self.assertRaises(ValueError):
                O.probe_candidate(2, supervision, D.Cancellation())
        # A valid candidate is custody only: this deliberately minimal receipt is NOT P.verify proof.

    def export_fixture(self, *, fail=None, when=None, candidate=None, extra=False):

        cancel, written, copies = D.Cancellation(), {}, []
        trace = dict(file='trace.raw', bytes=3, sha256=hashlib.sha256(b'abc').hexdigest(), metadata={'size': 3})
        supervision = dict(schema='ak5597-observation-supervisor.v1', childRole='tracer',
            rawTrace=trace, captureComplete=True, tracerReaped=True, settlementPending=False,
            lineage=parse(), reviewSha256='1' * 64, codeSha256=review()['codeSha256'], observer=review()['observer'])
        fake_c = NS(**vars(C)); fake_c.owned_dir = lambda *_: None
        fake_c.directory_names = lambda *_: ['trace.raw'] + (['old'] if extra else [])
        def put(d, name, raw):
            self.assertEqual(d, 2)
            if name in written: raise FileExistsError('exclusive')
            if when == name: cancel.record()
            if fail == name: raise OSError('synthetic write failure')
            written[name] = C.decode(raw)
        fake_c.put = put
        def copy_file(*args):
            copies.append(args)
            if when == 'copy': cancel.record()
            if fail == 'copy': raise OSError('synthetic partial copy')
        def fsync(_):
            if when == 'fsync': cancel.record()
            if fail == 'fsync': raise OSError('synthetic sync failure')
        def audit(_):
            if fail == 'audit': raise ValueError('fake custody mismatch')
            return dict(trace, sha256='0' * 64) if fail == 'binding' else trace
        with patch.dict(E.export_observation.__globals__, C=fake_c, copy_file=copy_file,
                        observation_trace=audit, os=NS(fsync=fsync)):
            result = E.export_observation(1, 2, 3, supervision, candidate, cancel)
        return result, written, copies

    def test_observation_export_typed_receipts_pending_even_when_copy_complete(self):
        result, written, _ = self.export_fixture()
        self.assertTrue(result['exportComplete'])
        self.assertEqual(set(written), {'supervisor-receipt.json', 'probe-receipt.json', 'observation-receipt.json'})
        marker = written['observation-receipt.json']
        self.assertEqual(marker['status'], 'inconclusive'); self.assertEqual(marker['rawTrace']['bytes'], 3)
        for key in ('readiness', 'qualification', 'acquisition', 'verifiedRuntimeLineage', 'probeVerified', 'durabilityCertified'):
            self.assertIs(marker[key], False)
        self.assertEqual(marker['supervisorReceipt']['sha256'],
                         hashlib.sha256(C.encode(written['supervisor-receipt.json'])).hexdigest())

    def test_failed_exports_preserve_partials_no_retry_and_exclusivity(self):
        for fail in ('audit', 'binding', 'supervisor-receipt.json', 'probe-receipt.json',
                     'observation-receipt.json', 'fsync', 'copy'):
            candidate = {'file': 'probe-receipt.json'} if fail == 'copy' else None
            result, written, copies = self.export_fixture(fail=fail, candidate=candidate)
            with self.subTest(fail=fail):
                self.assertFalse(result['exportComplete']); self.assertTrue(result['errors'])
                if fail == 'copy':
                    self.assertEqual(len(copies), 1); self.assertNotIn('probe-receipt.json', written)
                if 'observation-receipt.json' in written:
                    self.assertFalse(written['observation-receipt.json']['readiness'])
        result, written, copies = self.export_fixture(extra=True)
        self.assertFalse(result['exportComplete']); self.assertEqual(written, {}); self.assertEqual(copies, [])

    def test_cancellation_during_copy_receipts_and_export_fsync_nonraising(self):
        for when in ('copy', 'supervisor-receipt.json', 'probe-receipt.json', 'observation-receipt.json', 'fsync'):
            candidate = {'file': 'probe-receipt.json'} if when == 'copy' else None
            result, written, _ = self.export_fixture(when=when, candidate=candidate)
            with self.subTest(when=when):
                self.assertFalse(result['exportComplete'])
                self.assertFalse(written['observation-receipt.json']['readiness'])

    def test_exclusive_begin_failure_never_overwrites_or_cleans(self):
        fake = NS(**vars(C)); fake.owned_dir = lambda *_: None
        fake.new_dir = lambda *_: (_ for _ in ()).throw(FileExistsError('existing evidence'))
        fake.create = lambda *_: self.fail('write in existing directory')
        with patch.dict(E.begin_observation.__globals__, C=fake), self.assertRaises(FileExistsError):
            E.begin_observation(1, 'ak5597-artifacts-observation-old')
        fake.new_dir = lambda *_: 2
        fake.create = lambda *_: (_ for _ in ()).throw(OSError('new trace creation failed'))
        closed = []
        with patch.dict(E.begin_observation.__globals__, C=fake, os=NS(close=closed.append)), self.assertRaises(OSError):
            E.begin_observation(1, 'ak5597-artifacts-observation-new')
        self.assertEqual(closed, [2])

    def operation_fixture(self, *, launch_error=False, cancel_at=None):
        value = review()  # Construct policy while the real S constants are still bound.
        cancel, events, exported = D.Cancellation(), [], []
        fake_c = NS(**vars(C)); fake_c.new_dir = lambda *_: 50
        fake_c.identity = lambda _: (1, 2)
        fake_p = NS(namespace_ids=lambda: {'fixture': [1, 2]})
        fake_e = NS(begin_observation=lambda *_: (80, 90))
        raw = dict(file='trace.raw', bytes=0, sha256=hashlib.sha256(b'').hexdigest(), metadata=None)
        def supervise(argv, inherited, helper_tmp, latch, capture):
            events.append(('tracer', argv, inherited, helper_tmp))
            self.assertIs(latch, cancel)
            if launch_error: raise RuntimeError('synthetic missing supervisor return')
            return dict(schema='ak5597-observation-supervisor.v1', childRole='tracer',
                tracerCreated=True, tracerReaped=True, tracerReturncode=0, reason='exited',
                captureComplete=True, rawTrace=raw, lineage=parse(), settlementPending=False)
        def export(source, destination, parent, supervision, candidate, latch):
            exported.append(supervision)
            events.append(('export', source, destination, parent))
            if cancel_at == 'export': latch.record()
            return {'exportComplete': not latch.pending}
        fake_e.export_observation = export
        fake_s = NS(supervise=supervise, Capture=lambda fd, lineage: NS(finish=lambda: raw, lineage=lineage))
        def close(fd):
            events.append(('close', fd))
            if cancel_at == 'close': cancel.record()
        fake_os = NS(umask=lambda _: None, fstat=lambda _: None, stat=lambda *_, **__: None,
                     lseek=lambda *_: None, SEEK_SET=0, environ={'TMPDIR': '/fake/approved/tmp'}, close=close)
        def preflight(*args):
            args[-1].extend([20, 21, 22, 23])
            return {}, [({}, 20)], 21, {}, 22, 23, 24
        def pin(_, fds):
            fds.append(88); return 88, ('fake-snapshot',)
        with patch.dict(O.operation.__globals__, C=fake_c, E=fake_e, P=fake_p, S=fake_s, os=fake_os,
                review_projection=lambda r: r, pin_tracer=pin,
                supervise_pinned=lambda *args: supervise(*args[:5]),
                invocation=lambda *_: list(O.PREFIX) + ['/usr/bin/bwrap'],
                probe_candidate=lambda *_: None):
            result = O.operation(cancel, (fake_c, fake_e, fake_p, value, {}, '/fixture'),
                                 preflight, None, '7' * 64)
        return result, exported, events, cancel

    def test_operation_routes_one_tracer_then_distinct_export_and_never_acquires(self):
        result, exported, events, _ = self.operation_fixture()
        self.assertFalse(result['good']); self.assertFalse(result['readiness'])
        self.assertEqual([e[0] for e in events if e[0] != 'close'], ['tracer', 'export'])
        self.assertEqual(events[0][2], [20, 21, 50])
        self.assertNotIn(90, events[0][2]); self.assertNotIn(88, events[0][2])
        self.assertEqual(exported[0]['reviewSha256'], '7' * 64)
        self.assertEqual(exported[0]['childRole'], 'tracer')

    def test_unexpected_supervisor_exception_does_not_fabricate_no_child(self):
        result, exported, _, _ = self.operation_fixture(launch_error=True)
        self.assertIsNone(exported[0]['tracerCreated'])
        self.assertTrue(exported[0]['settlementPending']); self.assertFalse(exported[0]['tracerReaped'])
        self.assertFalse(result['captureComplete']); self.assertFalse(result['good'])

    def test_operation_export_and_fd_close_keep_nonraising_cancellation(self):
        for stage in ('export', 'close'):
            result, _, events, cancel = self.operation_fixture(cancel_at=stage)
            self.assertTrue(cancel.pending); self.assertFalse(result['good'])
            self.assertEqual([e[1] for e in events if e[0] == 'close'], [50, 90, 80, 23, 22, 21, 20, 88])


if __name__ == '__main__':
    unittest.main()
