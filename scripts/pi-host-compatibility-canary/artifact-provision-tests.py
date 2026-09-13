"""Focused fixtures/fakes. AUTHORED ONLY; do not run without separate test admission.
No npm, Node, bwrap, network, SDK, or provisioning invocation in this suite.
"""
import copy
import gzip
import hashlib
import io
import os
from pathlib import Path
import signal
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent


def load(name, **extra):
    raw = (HERE / name).read_bytes()
    scope = dict(__name__='fixture_' + name, __file__=str(HERE / name), **extra)
    exec(compile(raw, scope['__file__'], 'exec'), scope)
    return SimpleNamespace(**scope)


C = load('artifact-contract.py')
D = load('artifact-driver.py')
P = load('artifact-provision-contract.py', C=C)
T = load('artifact-provision-tree.py', C=C)
L = load('artifact-provision-lifetime.py', C=C, P=P)
H = load('artifact-provision.py')
W = load('artifact-provision-worker.py')  # non-main: no bootstrap, proc read, or Node launch


def fixture():
    hashes = {name: P.sha((HERE / name).read_bytes()) for name in P.CODE}
    rows = []
    def add(role, target, size=1, digest='a' * 64):
        rows.append(dict(role=role, target=target, bytes=size, sha256=digest, source='/fixture/f' + str(len(rows))))
    for role, (target, digest) in P.ROOTS.items():
        add(role, target, 124679552 if role == 'node' else 1, digest)
    add('python', '/runtime/bin/python3')
    for name in P.WORKER_CODE:
        add('code:' + name, '/code/' + name, 1, hashes[name])
    for i in range(7):
        add('nodelib:lib' + str(i), '/lib/lib' + str(i) + '.so')
    add('stdlib:empty', '/runtime/lib/python3.11/x/__init__.py', 0, P.sha(b''))
    for i in range(165):
        name = 'sha256-' + format(i, '064x') + '.tgz'
        add('archive:' + name, '/inputs/archives/' + name)
    obj = dict(schema='ak5597-offline-provision-inputs.v1', task=5597, label=P.LABEL, rows=rows)
    review = dict(schema='ak5597-offline-provision-review.v1', task=5597, label=P.LABEL, mode='provision',
                  authorizationReference='FUTURE-FIXTURE-NOT-AUTHORITY', predecessorSha256=P.FREEZE,
                  codeSha256=hashes, driverPythonSha256='a'*64, bwrapSha256='b'*64,
                  inventoryPath='/fixture/inventory.json', inventorySha256='c'*64,
                  scratchRunsRoot=dict(path='/fixture/runs', dev=1, ino=2),
                  exportParent=dict(path='/fixture/export', dev=1, ino=3), exportName=P.LABEL + '-fixture')
    return obj, review


def seed(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w', format=tarfile.PAX_FORMAT) as tf:
        for name, kind, content, mode in entries:
            m = tarfile.TarInfo(name); m.type = kind; m.mode = mode
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                m.linkname = 'package/bin/npm-cli.js'
            m.size = len(content) if kind == tarfile.REGTYPE else 0
            tf.addfile(m, io.BytesIO(content) if m.size else None)
    return gzip.compress(stream.getvalue())


CLI = ('package/bin/npm-cli.js', tarfile.REGTYPE, b'// trusted fixture\n', 0o755)


class Schemas(unittest.TestCase):
    def test_valid_and_no_old_source_changes(self):
        obj, review = fixture()
        P.review(review); P.inventory(obj, review['codeSha256'])
        for name, digest in P.BASE.items():
            self.assertEqual(P.sha((HERE / name).read_bytes()), digest)

    def test_unknown_keys_modes_and_base_pin(self):
        _, original = fixture()
        for mutation in (lambda r: r.update(extra=1), lambda r: r.update(mode='acquire'),
                         lambda r: r.update(task=True), lambda r: r['codeSha256'].update({'artifact-driver.py': 'a'*64})):
            r = copy.deepcopy(original); mutation(r)
            with self.assertRaises(ValueError):
                P.review(r)
        with self.assertRaises(ValueError):
            C.decode(b'{"same":1,"same":2}')

    def test_input_rejections(self):
        original, r = fixture()
        mutations = [lambda o: o.update(extra=1), lambda o: o['rows'][0].update(extra=1),
                     lambda o: o['rows'][0].update(role='stdlib:../bad'),
                     lambda o: o['rows'][1].update(role=o['rows'][0]['role']),
                     lambda o: o['rows'][1].update(source=o['rows'][0]['source']),
                     lambda o: o['rows'][1].update(source=o['rows'][0]['source'] + '/child'),
                     lambda o: o['rows'][1].update(target=o['rows'][0]['target'] + '/child'),
                     lambda o: o['rows'][1].update(target='/inputs/../escape'),
                     lambda o: o['rows'][1].update(sha256='0'*64),
                     lambda o: o['rows'][1].update(bytes=True),
                     lambda o: o['rows'][1].update(bytes=P.INPUT_MAX),
                     lambda o: o.update(rows=o['rows'] * 3),
                     lambda o: o['rows'].pop()]
        for mutate in mutations:
            obj = copy.deepcopy(original); mutate(obj)
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                P.inventory(obj, r['codeSha256'])

    def test_projection_no_host_paths(self):
        obj, r = fixture()
        ns = {k: k + ':[10]' for k in P.NS}
        projected = P.projection(obj['rows'], 'a'*64, 'b'*64, r['codeSha256'], ns)
        P.data(projected)
        self.assertNotIn(b'/fixture', C.encode(projected))
        projected['rows'][0]['source'] = '/host'
        with self.assertRaises(ValueError):
            P.data(projected)

    def loader_projection(self):
        obj, review = fixture()
        host = '/usr/lib/ld-linux-x86-64.so.2'
        row = next(r for r in obj['rows'] if r['role'].startswith('nodelib:'))
        row.update(source=host, target='/lib64/ld-linux-x86-64.so.2', bytes=263152,
                   sha256='d011113b7054c641c8ca064f58bcc23804fd2654a3dff2444dad06ddeda61bfb')
        obj['rows'].append(dict(row, role='pythonlib:loader-search-alias',
                               source='/private/proposal/aliases/ld-linux-x86-64.so.2', target=host))
        P.inventory(obj, review['codeSha256'])
        projected = P.projection(obj['rows'], 'a'*64, 'b'*64, review['codeSha256'],
                                 {k: k + ':[10]' for k in P.NS})
        return obj['rows'], projected

    def test_projection_loader_alias_namespace_spelling(self):
        rows, projected = self.loader_projection()
        raw = P.private_projection(projected, rows, '/private/proposal/export-parent')
        self.assertIn(b'/usr/lib/ld-linux-x86-64.so.2', raw)
        self.assertNotIn(b'/private/proposal', raw)
        # This exact cross-row alias necessarily failed the old substring guard.
        self.assertFalse(all(r['source'].encode() not in raw
                             for r in rows if r['source'] != r['target']))

    def test_projection_rejects_private_fields_targets_and_export(self):
        rows, original = self.loader_projection()
        mutations = (lambda p: p['rows'][0].update(source='/private/proposal/secret'),
                     lambda p: p.update(exportParent='/private/proposal/export-parent'),
                     lambda p: p['rows'][-1].update(target='/private/proposal/aliases/ld-linux-x86-64.so.2'))
        for mutation in mutations:
            projected = copy.deepcopy(original); mutation(projected)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                P.private_projection(projected, rows, '/private/proposal/export-parent')
        with self.assertRaisesRegex(ValueError, '^export parent disclosed$'):
            P.private_projection(original, rows, '/usr/lib')

    def test_projection_rejects_changed_input_rows(self):
        rows, projected = self.loader_projection()
        projected['rows'][-1]['sha256'] = 'b'*64
        with self.assertRaisesRegex(ValueError, '^projection input mismatch$'):
            P.private_projection(projected, rows, '/private/proposal/export-parent')

    def test_argv_and_serial_commands(self):
        obj, _ = fixture()
        args = P.argv([(r, i + 10) for i, r in enumerate(obj['rows'])], 600, 601)
        for flag in ('--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-net',
                     '--as-pid-1', '--die-with-parent', '--new-session', '--clearenv'):
            self.assertIn(flag, args)
        for forbidden in ('--share-net', '--bind', '--ro-bind', '--dev-bind', '--sync-fd'):
            self.assertNotIn(forbidden, args)
        size = args.index('--size')
        self.assertEqual(args[size:size+4], ['--size', str(P.GIB), '--tmpfs', '/work'])
        self.assertEqual(args.count('--bind-fd'), 1)
        self.assertNotIn('/fixture', ' '.join(args))
        archives = [dict(filename=r['target'].rsplit('/', 1)[-1]) for r in obj['rows'] if r['role'].startswith('archive:')]
        cmds = P.commands(dict(networkArchives=archives))
        self.assertEqual(len(cmds), 166)
        for i, (argv, seconds) in enumerate(cmds):
            self.assertEqual(argv[:3], ['/runtime/bin/node', '--max-old-space-size=512', '/work/tooling/npm/bin/npm-cli.js'])
            self.assertIn('--offline', argv); self.assertIn('--ignore-scripts', argv)
            self.assertEqual(seconds, 120 if i < 165 else 600)
            if i < 165:
                self.assertEqual(argv[3:6], ['cache', 'add', '/inputs/archives/' + archives[i]['filename']])
        self.assertIn('--no-bin-links', cmds[-1][0])
        self.assertNotIn('NODE_OPTIONS', P.ENV)
        self.assertEqual(P.ENV['npm_config_logs_max'], '0')


class TreeFixtures(unittest.TestCase):
    def setUp(self):
        # Deliberately no /tmp fallback for future authorized fixture execution.
        self.tmp = tempfile.TemporaryDirectory(prefix='ak5597-provision-fixture-', dir=os.environ['TMPDIR'])
        self.base = Path(self.tmp.name)
        for name in ('work', 'out', 'copy'):
            (self.base / name).mkdir(mode=0o700)
        self.root = C.open_dir(str(self.base / 'work'))
        self.out = C.open_dir(str(self.base / 'out'))
        self.dest = C.open_dir(str(self.base / 'copy'))

    def tearDown(self):
        for fd in (self.root, self.out, self.dest):
            os.close(fd)
        self.tmp.cleanup()  # Only this fixture's inactive owned scratch.

    def test_seed_preserves_empty_scripts_and_modes(self):
        raw = seed([CLI, ('package/empty', tarfile.REGTYPE, b'', 0o644),
                    ('package/node_modules/bundled/index.js', tarfile.REGTYPE, b'bundled', 0o644)])
        T.extract_seed(raw, self.root)
        self.assertEqual((self.base / 'work/bin/npm-cli.js').read_bytes(), CLI[2])
        self.assertEqual((self.base / 'work/bin/npm-cli.js').stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.base / 'work/empty').stat().st_size, 0)

    def test_seed_rejects_aliases_collisions_links_special_privileged(self):
        bad = [('package/./bin/npm-cli.js', tarfile.REGTYPE, b'', 0o644),
               ('package/../escape', tarfile.REGTYPE, b'', 0o644),
               ('/package/escape', tarfile.REGTYPE, b'', 0o644),
               ('package//escape', tarfile.REGTYPE, b'', 0o644),
               ('package/link', tarfile.SYMTYPE, b'', 0o644),
               ('package/hard', tarfile.LNKTYPE, b'', 0o644),
               ('package/fifo', tarfile.FIFOTYPE, b'', 0o644),
               ('package/privileged', tarfile.REGTYPE, b'', 0o4755), CLI,
               ('package/bin', tarfile.REGTYPE, b'', 0o644)]
        for entry in bad:
            with self.subTest(entry=entry), self.assertRaises(ValueError):
                T.seed_plan(seed([CLI, entry]))

    def test_seed_bounds(self):
        raw = seed([CLI])
        for kwargs in ({'expanded_max': 100}, {'entries_max': 0}):
            with self.assertRaises(ValueError):
                T.seed_plan(raw, **kwargs)
        for name in ('a/' * 64 + 'z', 'x'*1025, 'a\\b', 'a\x00b'):
            with self.assertRaises(ValueError):
                T.path(name)
        m = tarfile.TarInfo('package/big'); m.size = T.MEMBER_MAX + 1
        with self.assertRaises(ValueError):
            T.member(m)

    def populate(self):
        for name in T.TOP:
            (self.base / 'work' / name).mkdir(mode=0o700)
        install = self.base / 'work/install'
        (install / '.package-lock.json').write_bytes(b'')
        (install / 'executable').write_bytes(b'fixture')
        (install / 'executable').chmod(0o755)
        (install / 'package.json').write_bytes(b'root')
        (install / 'package-lock.json').write_bytes(b'lock')

    def test_export_roundtrip_empty_hidden_modes_roots_determinism(self):
        # Opened-before-population root and repeated export exercise fresh cursors.
        self.populate()
        expected = T.export_tree(self.root, self.out)
        fd = C.open_file(str(self.base / 'out/provisioned-tree.tar'), T.TAR_MAX)
        inv = C.create(self.dest, 'inventory.jsonl')
        try:
            roots = {'package.json': {'sha256': P.sha(b'root')}, 'package-lock.json': {'sha256': P.sha(b'lock')}}
            self.assertEqual(T.validate_tar(fd, inv, roots), expected)
        finally:
            os.close(fd); os.close(inv)
        inventory = (self.base / 'copy/inventory.jsonl').read_bytes()
        self.assertIn(b'.package-lock.json', inventory)
        self.assertIn(b'"mode":493', inventory)
        self.assertEqual(T.export_tree(self.root, self.dest), expected)

    def test_tar_limit_preserves_partial_without_success(self):
        self.assertEqual(T.directory_names(self.root), [])
        self.populate()
        with self.assertRaisesRegex(ValueError, '^tar size bound$'):
            T.export_tree(self.root, self.out, maximum=1024)
        self.assertTrue((self.base / 'out/provisioned-tree.tar.partial').exists())
        self.assertFalse((self.base / 'out/provisioned-tree.tar').exists())

    def test_tree_link_failure_does_not_omit(self):
        self.populate()
        (self.base / 'work/install/symlink').symlink_to('executable')
        with self.assertRaisesRegex(ValueError, '^tree link/special/privileged$'):
            T.export_tree(self.root, self.out)
        self.assertFalse((self.base / 'out/provisioned-tree.tar').exists())

    def test_tree_hardlink_failure(self):
        self.populate()
        os.link(self.base / 'work/install/executable', self.base / 'work/install/hardlink')
        with self.assertRaisesRegex(ValueError, '^tree link/special/privileged$'):
            T.export_tree(self.root, self.out)

    def test_partial_host_copy_failure_is_retained(self):
        C.put(self.out, 'worker.json', b'fixture')
        original = C.write_all
        def fail(fd, raw):
            original(fd, raw[:2])
            raise OSError('fixture disk full')
        with patch.object(C, 'write_all', fail), self.assertRaises(OSError):
            H.copy_at(C, self.out, self.dest, 'worker.json', C.JSON_MAX)
        self.assertEqual((self.base / 'copy/worker.json.copy-partial').read_bytes(), b'fi')
        self.assertFalse((self.base / 'copy/worker.json').exists())

    def test_host_rejects_trailing_tar_data(self):
        self.populate(); T.export_tree(self.root, self.out)
        path = self.base / 'out/provisioned-tree.tar'
        with path.open('ab') as stream:
            stream.write(b'X' * 512)
        fd = C.open_file(str(path), T.TAR_MAX); inv = C.create(self.dest, 'bad.jsonl')
        try:
            with self.assertRaisesRegex(ValueError, '^tar terminator/trailing data$'):
                T.validate_tar(fd, inv)
        finally:
            os.close(fd); os.close(inv)


class LifetimeFakes(unittest.TestCase):
    def test_echild_required_not_one_direct_status(self):
        calls = iter([(17, 0), (0, 0)])
        empty, rows = L.reap_available(lambda *_: next(calls))
        self.assertFalse(empty); self.assertEqual(rows, [(17, 0)])
        def none(*_):
            raise ChildProcessError
        self.assertEqual(L.reap_available(none), (True, []))

    def test_pid1_termination_and_echild(self):
        calls, signals = iter([(42, 0), None]), []
        def wait(*_):
            value = next(calls)
            if value is None:
                raise ChildProcessError
            return value
        with patch.object(os, 'getpid', return_value=1):
            row = L.settle(True, wait=wait, kill=lambda pid, sig: signals.append((pid, sig)))
        self.assertTrue(row['allChildrenSettled']); self.assertEqual(row['reaped'], 1)
        self.assertEqual(signals, [(-1, signal.SIGTERM)])

    def test_unknown_settlement_never_success(self):
        tick, signals = iter(range(100)), []
        with patch.object(os, 'getpid', return_value=1):
            row = L.settle(True, clock=lambda: next(tick), sleep=lambda _: None,
                           wait=lambda *_: (0, 0), kill=lambda *args: signals.append(args))
        self.assertFalse(row['allChildrenSettled'])
        self.assertEqual([sig for _, sig in signals], [signal.SIGTERM, signal.SIGKILL])

    def test_driver_latch_covers_export_and_fd_settlement(self):
        prior = signal.getsignal(signal.SIGTERM)
        with D.Cancellation() as cancel:
            cancel.record()
            self.assertTrue(cancel.pending)
            self.assertEqual(signal.getsignal(signal.SIGTERM), cancel.record)
            # Preservation/finally phases see a latch, not a raising signal handler.
            cancel.record()
            with self.assertRaises(InterruptedError):
                cancel.check()
        self.assertEqual(signal.getsignal(signal.SIGTERM), prior)

    def test_cancel_before_helper_never_spawns(self):
        calls = []
        with D.Cancellation() as cancel:
            cancel.record()
            def forbidden(*args, **kwargs):
                calls.append(True)
                raise AssertionError('must not spawn')
            row = L.helper([], [], '/unused', cancel, 10**20, popen=forbidden)
        self.assertFalse(row['helperReaped']); self.assertTrue(row['cancelled'])
        self.assertEqual(calls, [])

    def test_helper_bounded_wait_unknown(self):
        waits = []
        class Child:
            stdout = SimpleNamespace(fileno=lambda: 99, close=lambda: None)
            def poll(self): return None
            def terminate(self): pass
            def kill(self): pass
            def wait(self, timeout):
                waits.append(timeout)
                raise subprocess.TimeoutExpired('fake', timeout)
        selector = SimpleNamespace(register=lambda *a: None, get_map=lambda: {99: 1}, close=lambda: None)
        cancel = SimpleNamespace(pending=False, check=lambda: None)
        def launch(*a, **kw):
            cancel.pending = True
            return Child()
        with patch.object(os, 'set_blocking'), patch.object(L.selectors, 'DefaultSelector', return_value=selector):
            row = L.helper([], [], '/unused', cancel, 10**20, popen=launch)
        self.assertEqual(waits, [L.GRACE, L.GRACE])
        self.assertFalse(row['helperReaped']); self.assertEqual(row['reason'], 'helper-settlement-unknown')


class ProcStream:
    """Finite scripted reads; exhaustion is an error, never implicit EOF."""
    def __init__(self, chunks):
        self.chunks, self.requests, self.enters, self.closes = iter(chunks), [], 0, 0
    def __enter__(self):
        self.enters += 1; return self
    def __exit__(self, *args):
        self.closes += 1
    def read(self, size):
        self.requests.append(size)
        chunk = next(self.chunks)
        if isinstance(chunk, BaseException): raise chunk
        return chunk


class ProcReadFixtures(unittest.TestCase):
    def read_chunks(self, chunks, maximum, requests):
        stream = ProcStream(chunks)
        def opened(path, mode, *, buffering):
            self.assertEqual((path, mode, buffering), ('/fixture/proc', 'rb', 0))
            self.assertEqual(stream.enters, 0)
            return stream
        with patch.dict(W.proc_read.__globals__, open=opened):
            try:
                return W.proc_read('/fixture/proc', maximum)
            finally:
                self.assertEqual((stream.enters, stream.closes), (1, 1))
                self.assertEqual(stream.requests, requests)
                self.assertTrue(all(0 < n <= maximum + 1 for n in stream.requests))
                self.assertLessEqual(len(stream.requests), maximum + 1)

    def test_midline_short_reads_until_explicit_eof(self):
        self.assertEqual(self.read_chunks([b'row par', b'tial\nnext', b'\n', b''], 32,
                                         [33, 26, 17, 16]), b'row partial\nnext\n')

    def test_empty_and_exact_limit_require_eof(self):
        self.assertEqual(self.read_chunks([b''], 0, [1]), b'')
        self.assertEqual(self.read_chunks([b''], 4, [5]), b'')
        self.assertEqual(self.read_chunks([b'abcd', b''], 4, [5, 1]), b'abcd')

    def test_separate_overflow_byte_and_one_byte_progress_bounds(self):
        for chunks, requests in (([b'abcd', b'e'], [5, 1]), ([b'a'] * 5, [5, 4, 3, 2, 1])):
            with self.assertRaisesRegex(ValueError, '^proc observation bound$'):
                self.read_chunks(chunks, 4, requests)
        self.assertEqual(self.read_chunks([b'a'] * 4 + [b''], 4, [5, 4, 3, 2, 1]), b'aaaa')

    def test_exception_nonbytes_and_no_progress_close_without_retry(self):
        error = OSError('synthetic read failure')
        with self.assertRaises(OSError) as caught:
            self.read_chunks([b'a', error], 4, [5, 4])
        self.assertIs(caught.exception, error)
        for bad in (None, '', bytearray(), memoryview(b''), 0):
            with self.subTest(value=bad), self.assertRaisesRegex(ValueError, '^proc observation bound$'):
                self.read_chunks([b'a', bad], 4, [5, 4])
        self.assertEqual(self.read_chunks([b'a', b'', b'not retried'], 4, [5, 4]), b'a')


class FixedFailureCodes(unittest.TestCase):
    def test_literal_guard_codes_bounded(self):
        expected = {
            'PID1 topology': 'OBS_PID1', 'worker interpreter/environment': 'OBS_INTERPRETER_ENV',
            'worker numeric identity': 'OBS_NUMERIC_IDENTITY',
            'private namespaces': 'OBS_NAMESPACES', 'capabilities': 'OBS_CAPABILITIES',
            'unexpected inherited capability': 'OBS_FDS', 'proc observation bound': 'OBS_PROC_BOUND',
            'mount propagation/duplicates': 'OBS_MOUNT_PROPAGATION_DUPLICATES',
            'unexpected mount surface': 'OBS_MOUNT_SET', 'mount writable surface': 'OBS_MOUNT_MODE',
            'private proc/bounded work tmpfs': 'OBS_PROC_WORK_TMPFS', 'worker input pin': 'OBS_INPUT_PIN',
            'mount table syntax': 'OBS_MOUNT_PARSE', 'mount schema': 'OBS_MOUNT_SCHEMA',
            'observed mount mode': 'OBS_MOUNT_MODE', 'observed tmpfs/proc': 'OBS_PROC_WORK_TMPFS',
            'protective proc flags/type': 'OBS_PROC_FLAGS', 'protective proc root': 'OBS_PROC_ROOT',
            'protective proc device syntax': 'OBS_PROC_DEVICE_SYNTAX',
            'protective proc device mismatch': 'OBS_PROC_DEVICE_MISMATCH',
            'unexpected proc filesystem': 'OBS_UNEXPECTED_PROC',
            **{'limit ' + n: 'LIMIT_' + n for n in ('NOFILE', 'AS', 'CPU', 'CORE', 'FSIZE')},
        }
        self.assertEqual(W.GUARD_CODES, expected)
        for message, code in expected.items():
            result = W.failure_code(ValueError(message), 'OBSERVATIONS')
            self.assertEqual(result, 'ValueError:' + code)
            self.assertLessEqual(len(result), 128)

    def test_unknown_multiarg_and_sensitive_text_not_disclosed(self):
        secret = '/private/credential?token=DO_NOT_EXPORT'
        class Sensitive:
            def __str__(self): raise AssertionError('must not stringify exception argument')
        for exc in (ValueError(secret), ValueError('capabilities', secret), ValueError(Sensitive()), ValueError()):
            for phase in ('LIMITS', 'OBSERVATIONS', 'OTHER', secret):
                expected = phase if phase in ('LIMITS', 'OBSERVATIONS', 'OTHER') else 'OTHER'
                result = W.failure_code(exc, phase)
                self.assertEqual(result, 'ValueError:' + expected + '_UNCLASSIFIED')
                self.assertNotIn(secret, result)
        self.assertEqual(W.failure_code(OSError(secret), 'OBSERVATIONS'), 'OSError')
        self.assertEqual(W.failure_code(KeyError(secret), 'LIMITS'), 'KeyError')

    def test_limits_same_order_values_and_fixed_failure_names(self):
        expected = [(L.resource.RLIMIT_NOFILE, (256, 256)),
                    (L.resource.RLIMIT_AS, (16 * 1024 ** 3, 16 * 1024 ** 3)),
                    (L.resource.RLIMIT_CPU, (650, 660)), (L.resource.RLIMIT_CORE, (0, 0)),
                    (L.resource.RLIMIT_FSIZE, (P.GIB, P.GIB))]
        with patch.object(L.resource, 'setrlimit') as fake:
            L.limits()
            self.assertEqual([c.args for c in fake.call_args_list], expected)
        for stop, name in enumerate(('NOFILE', 'AS', 'CPU', 'CORE', 'FSIZE')):
            calls = []
            def fake(kind, value):
                calls.append((kind, value))
                if len(calls) == stop + 1:
                    raise ValueError('/private/ambient/error')
            with patch.object(L.resource, 'setrlimit', fake):
                with self.assertRaisesRegex(ValueError, '^limit ' + name + '$') as caught:
                    L.limits()
            self.assertEqual(calls, expected[:stop + 1])
            self.assertEqual(W.failure_code(caught.exception, 'LIMITS'), 'ValueError:LIMIT_' + name)


class ReceiptSchemas(unittest.TestCase):
    def test_double_check_observations_and_unknown_settlement(self):
        obj, review = fixture()
        projected = P.projection(obj['rows'], 'a'*64, 'b'*64, review['codeSha256'],
                                 {k: k + ':[10]' for k in P.NS})
        projection_raw = C.encode(projected)
        points = {'/', '/proc', '/work', '/out', '/inputs/provision.json'} | {r['target'] for r in obj['rows']}
        mounts = {p: dict(fs='tmpfs', options=['rw' if p in ('/work', '/out') else 'ro'], super=[])
                  for p in points}
        mounts['/proc'].update(fs='proc', options=['ro', 'nosuid', 'nodev', 'noexec'],
                               super=['rw'], procRoot='/', procDevice='0:42')
        mounts['/work'].update(options=['rw', 'nosuid', 'nodev'], super=['size=1048576k'])
        obs = dict(pid=1, ppid=0, uid=1000, euid=1000, gid=1000, egid=1000, namespaces={k: k + ':[20]' for k in P.NS},
                   capabilities={k: '0'*16 for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')},
                   fds={'0': '/dev/null', '1': 'pipe:[1]', '2': 'pipe:[1]'}, mounts=mounts,
                   inputs=projected['rows'], environment=P.ENV, beforeNode=True)
        binding = dict(reviewSha256=projected['reviewSha256'], inventorySha256=projected['inventorySha256'],
                       projectionSha256=P.sha(projection_raw), codeSha256=projected['codeSha256'],
                       inputSha256=C.INPUT_SHA256, proposedSha256={k: P.ROOTS[k][1] for k in ('package', 'lock')})
        pre = dict(schema='ak5597-offline-provision-pre-node.v2', binding=binding, observation=obs)
        pre_raw = C.encode(pre)
        archives = [dict(filename=r['target'].rsplit('/', 1)[-1]) for r in obj['rows'] if r['role'].startswith('archive:')]
        manifest = dict(networkArchives=archives)
        settled = dict(allChildrenSettled=True, reaped=0, termination=False)
        rows = [dict(argvSha256=P.sha(C.encode(args)), reason='exited', returncode=0, adoptedReaped=0,
                     directStatusObserved=True, settlement=settled) for args, _ in P.commands(manifest)]
        worker = dict(schema='ak5597-offline-provision-worker.v1', binding=binding, good=True, error=None,
                      cancelled=False, settlement=settled,
                      rootFiles={P.ROOTS[k][0].rsplit('/', 1)[-1]: dict(sha256=P.ROOTS[k][1], unchanged=True)
                                 for k in ('package', 'lock')}, commands=rows, commandLogBytes=0,
                      preNodeSha256=P.sha(pre_raw), qualification=False,
                      tree=dict(complete=True, bytes=10240, entries=7, sha256='a'*64,
                                inventoryBytes=7, inventorySha256='b'*64))
        P.verify_receipts(worker, pre, pre_raw, projected, projection_raw, manifest)
        for mutation in (lambda w: w.update(extra=1), lambda w: w['settlement'].update(allChildrenSettled=False),
                         lambda w: w.update(commands=w['commands'][:-1]),
                         lambda w: w['commands'][0].update(argvSha256='e'*64),
                         lambda w: w['rootFiles']['package.json'].update(sha256='e'*64)):
            wrong = copy.deepcopy(worker); mutation(wrong)
            with self.assertRaises(ValueError):
                P.verify_receipts(wrong, pre, pre_raw, projected, projection_raw, manifest)
        for mutation in (lambda o: o.update(beforeNode=False), lambda o: o['fds'].update({'3': '/host'}),
                         lambda o: o['namespaces'].update(net='net:[10]'),
                         lambda o: o['mounts']['/'].update(options=['rw'])):
            wrong = copy.deepcopy(obs); mutation(wrong)
            with self.assertRaises(ValueError):
                P.validate_observation(wrong, projected)


def orchestration_fixture():
    obj, review = fixture()
    manifest = dict(networkArchives=[dict(filename=r['target'].rsplit('/', 1)[-1])
                                    for r in obj['rows'] if r['role'].startswith('archive:')])
    return manifest, review


def command_receipt(args=None):
    return dict(argvSha256=P.sha(C.encode(args or [])), reason='exited', returncode=0,
                directStatusObserved=True, adoptedReaped=0,
                settlement=dict(allChildrenSettled=True, termination=False, reaped=0))


class WorkerOrchestration(unittest.TestCase):
    def test_actual_sequence_exact_165_plus_ci(self):
        manifest, _ = orchestration_fixture()
        calls, rows, latch = [], [], L.Latch()
        def execute(args, seconds):
            calls.append((args, seconds)); return command_receipt(args)
        W.sequence(C, P, manifest, latch, execute, rows)
        self.assertEqual(calls, P.commands(manifest)); self.assertEqual(len(rows), 166)
        self.assertEqual([a[3:5] for a, _ in calls[:165]], [['cache', 'add']] * 165)
        self.assertEqual(calls[-1][0][3], 'ci')

    def test_first_final_cache_and_ci_failure_stop_exact_prefix(self):
        manifest, _ = orchestration_fixture()
        expected = P.commands(manifest)
        for failed in (0, 164, 165):
            calls, rows = [], []
            def execute(args, seconds):
                calls.append((args, seconds)); row = command_receipt(args)
                if len(calls) - 1 == failed:
                    row['returncode'] = 1
                return row
            with self.subTest(failed=failed), self.assertRaises(ValueError):
                W.sequence(C, P, manifest, L.Latch(), execute, rows)
            self.assertEqual(calls, expected[:failed+1]); self.assertEqual(len(rows), failed+1)

    def test_cancel_missing_direct_and_unknown_settlement_stop(self):
        manifest, _ = orchestration_fixture()
        for failure in ('cancel', 'direct', 'settlement'):
            latch, calls, rows = L.Latch(), [], []
            def execute(args, seconds):
                calls.append((args, seconds)); row = command_receipt(args)
                if len(calls) == 3:
                    if failure == 'cancel': latch.record()
                    if failure == 'direct': row['directStatusObserved'] = False
                    if failure == 'settlement': row['settlement']['allChildrenSettled'] = False
                return row
            with self.subTest(failure=failure), self.assertRaises(ValueError):
                W.sequence(C, P, manifest, latch, execute, rows)
            self.assertEqual(calls, P.commands(manifest)[:3]); self.assertEqual(len(rows), 3)
        latch = L.Latch(); latch.record(); calls = []
        with self.assertRaises(ValueError):
            W.sequence(C, P, manifest, latch, lambda *a: calls.append(a), [])
        self.assertEqual(calls, [])

    def test_actual_finalization_settlement_before_preservation(self):
        events, latch = [], L.Latch()
        def settle(terminate):
            events.append(('settle', terminate))
            return dict(allChildrenSettled=True, termination=terminate, reaped=1)
        def roots():
            events.append('roots'); return {'package.json': {'unchanged': True}}
        def export():
            events.append('export'); return {'complete': True}
        result = W.finalize(C, [command_receipt()], 'CommandFailure', latch, settle, roots, export)
        self.assertEqual(events, [('settle', True), 'roots', 'export'])
        self.assertFalse(result['good']); self.assertIsNotNone(result['tree'])

    def test_finalization_unknown_prohibits_export(self):
        events = []
        result = W.finalize(C, [], 'CommandFailure', L.Latch(),
                            lambda _: dict(allChildrenSettled=False, termination=True, reaped=0),
                            lambda: {'package.json': {'unchanged': True}}, lambda: events.append('export'))
        self.assertEqual(events, []); self.assertIsNone(result['tree']); self.assertFalse(result['good'])

    def test_finalization_root_mutation_cancel_and_export_failure(self):
        rows = [command_receipt() for _ in range(166)]
        for failure in (None, 'root', 'cancel', 'export'):
            latch, calls = L.Latch(), []
            def export():
                calls.append('export')
                if failure == 'cancel': latch.record()
                if failure == 'export': raise OSError('fake full disk')
                return {'complete': True}
            result = W.finalize(C, rows, None, latch,
                                lambda _: dict(allChildrenSettled=True, termination=False, reaped=0),
                                lambda: {'package.json': {'unchanged': failure != 'root'}}, export)
            self.assertEqual(calls, ['export']); self.assertEqual(result['good'], failure is None)


def control_fixture(run, rs):
    return dict(schema='ai-society-heavy-job/v1', wrapper_pid=101, child_pid=None,
                task_id='5597', label=P.LABEL, scratch_path=run, run_id=os.path.basename(run),
                root_dev=rs.st_dev, root_ino=rs.st_ino, state='admitted',
                retention_deferral=dict(schema='ai-society-heavy-job-retention-deferral/v1',
                    mode='named-run-age-only', owner_decision_id='154',
                    deferred_run_id='run-1788137699-9655c994d9827ead',
                    deferred_root_dev=1, deferred_root_ino=2,
                    deferred_manifest_sha256='3048a36f394c095946a69be97f41e225677711cb42170b71d4560beb92efaeba',
                    admission_scan_scope='readable-current-uid', protected_process_count=0))


class ControlSnapshots(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ak5597-control-fixture-', dir=os.environ['TMPDIR'])
        self.run = self.tmp.name
        (Path(self.run) / 'control').mkdir(mode=0o700)
        self.path = Path(self.run) / 'control/manifest.json'
        self.rs = os.stat(self.run)

    def tearDown(self):
        self.tmp.cleanup()

    def snapshot(self):
        return H.control_snapshot(C, D, P, self.run, self.rs, wrapper_pid=101, child_pid=202)

    def test_admitted_running_one_read_matching_hash_identity_no_pin(self):
        _, review = fixture(); P.review(review)
        self.assertNotIn('controlSha256', review)
        with self.assertRaises(ValueError):
            P.review(dict(review, controlSha256='d'*64))
        for state, child in (('admitted', None), ('running', 202)):
            control = control_fixture(self.run, self.rs); control.update(state=state, child_pid=child)
            raw = C.encode(control); self.path.write_bytes(raw); before = self.path.stat()
            with patch.object(C, 'open_file', wraps=C.open_file) as opened, patch.object(C, 'read_fd', wraps=C.read_fd) as read:
                observation = self.snapshot()
            self.assertEqual(opened.call_count, 1); self.assertEqual(read.call_count, 1)
            self.assertEqual(observation['sha256'], P.sha(raw)); self.assertFalse(observation['authority'])
            self.assertEqual(observation['identity'], dict(dev=before.st_dev, ino=before.st_ino,
                bytes=len(raw), mtimeNs=before.st_mtime_ns, ctimeNs=before.st_ctime_ns,
                uid=before.st_uid, mode=before.st_mode, nlink=before.st_nlink))
            control['state'] = 'running'; self.path.write_bytes(C.encode(control))
            self.assertEqual(observation['state'], state)  # No whole-job immutability requirement.
            self.assertEqual(observation['sha256'], P.sha(raw))

    def test_every_attribution_rejected(self):
        original = control_fixture(self.run, self.rs)
        bad = dict(schema='wrong', wrapper_pid=303, child_pid=303, task_id='1', label='wrong',
                   scratch_path='/wrong', run_id='wrong', root_dev=self.rs.st_dev+1,
                   root_ino=self.rs.st_ino+1, state='finished')
        for key, value in bad.items():
            control = copy.deepcopy(original); control[key] = value
            self.path.write_bytes(C.encode(control))
            with self.subTest(field=key), self.assertRaises(ValueError): self.snapshot()
        for key, value in original['retention_deferral'].items():
            control = copy.deepcopy(original)
            control['retention_deferral'][key] = -1 if type(value) is int else 'wrong'
            self.path.write_bytes(C.encode(control))
            with self.subTest(d154=key), self.assertRaises(ValueError): self.snapshot()

    def test_changed_read_rejected_once_and_fd_closed(self):
        self.path.write_bytes(C.encode(control_fixture(self.run, self.rs)))
        original_read, descriptors = C.read_fd, []
        def changing(fd, maximum):
            descriptors.append(fd); raw = original_read(fd, maximum)
            s = os.fstat(fd); os.utime(self.path, ns=(s.st_atime_ns, s.st_mtime_ns + 1000000000))
            return raw
        with patch.object(C, 'read_fd', changing), self.assertRaises(ValueError): self.snapshot()
        self.assertEqual(len(descriptors), 1)
        with self.assertRaises(OSError): os.fstat(descriptors[0])


def export_fixture(good=False):
    """Synthetic receipts only, no production archives or live namespace observations."""
    obj, review = fixture(); manifest, _ = orchestration_fixture()
    projected = P.projection(obj['rows'], 'a'*64, 'b'*64, review['codeSha256'], {k: k + ':[10]' for k in P.NS})
    projection_raw = C.encode(projected)
    points = {'/', '/proc', '/work', '/out', '/inputs/provision.json'} | {r['target'] for r in obj['rows']}
    mounts = {p: dict(fs='tmpfs', options=['rw' if p in ('/work', '/out') else 'ro'], super=[]) for p in points}
    mounts['/proc'].update(fs='proc', options=['ro', 'nosuid', 'nodev', 'noexec'],
                           super=['rw'], procRoot='/', procDevice='0:42')
    mounts['/work'].update(options=['rw', 'nosuid', 'nodev'], super=['size=1048576k'])
    obs = dict(pid=1, ppid=0, uid=1000, euid=1000, gid=1000, egid=1000, namespaces={k: k + ':[20]' for k in P.NS},
               capabilities={k: '0'*16 for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')},
               fds={'0': '/dev/null', '1': 'pipe:[1]', '2': 'pipe:[1]'}, mounts=mounts,
               inputs=projected['rows'], environment=P.ENV, beforeNode=True)
    binding = dict(reviewSha256=projected['reviewSha256'], inventorySha256=projected['inventorySha256'],
                   projectionSha256=P.sha(projection_raw), codeSha256=projected['codeSha256'],
                   inputSha256=C.INPUT_SHA256, proposedSha256={k: P.ROOTS[k][1] for k in ('package', 'lock')})
    pre = dict(schema='ak5597-offline-provision-pre-node.v2', binding=binding, observation=obs)
    rows = [command_receipt(args) for args, _ in P.commands(manifest)]
    if not good:
        rows = rows[:1]; rows[0]['returncode'] = 1
    worker = dict(schema='ak5597-offline-provision-worker.v1', binding=binding, good=good,
                  error=None if good else 'CommandFailure', cancelled=False,
                  settlement=dict(allChildrenSettled=True, termination=not good, reaped=0),
                  rootFiles={P.ROOTS[k][0].rsplit('/', 1)[-1]: dict(sha256=P.ROOTS[k][1], unchanged=True)
                             for k in ('package', 'lock')}, commands=rows, commandLogBytes=0,
                  preNodeSha256=P.sha(C.encode(pre)), qualification=False, tree=None)
    supervision = dict(helperReaped=True, reason='exited', returncode=0 if good else 1, cancelled=False,
                       controlObservation=dict(schema='ak5597-offline-provision-control-observation.v1',
                           sha256='f'*64, identity={'dev': 1, 'ino': 2}, state='admitted', authority=False))
    return review, projected, projection_raw, manifest, pre, worker, supervision


class ProtectiveProcMounts(unittest.TestCase):
    def specimen(self, bits=15):
        _, projected, _, _, pre, _, _ = export_fixture()
        obs = pre['observation']
        for i, point in enumerate(P.PROC_COVERS):
            if bits & (1 << i):
                obs['mounts'][point] = dict(copy.deepcopy(obs['mounts']['/proc']), procRoot=point[5:])
        return projected, obs

    def raw(self, mounts):
        lines = []
        for i, (point, m) in enumerate(sorted(mounts.items()), 10):
            root, device = m.get('procRoot', '/'), m.get('procDevice', '0:99')
            options, super_options = ','.join(m['options']), ','.join(m['super']) or 'rw'
            lines.append(f'{i} 1 {device} {root} {point} {options} - {m["fs"]} none {super_options}\n')
        return ''.join(lines).encode()

    def worker(self, projected, raw, opener=None):
        rows = {r['target']: r for r in projected['rows']}
        status = ''.join(k + ':\t' + '0'*16 + '\n' for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')).encode()
        reads = []
        def forbidden_open(*args, **kwargs):
            raise AssertionError('fixture forbids worker file open')
        def read(path, maximum):
            self.assertIn(path, ('/proc/self/status', '/proc/self/mountinfo'))
            reads.append((path, maximum))
            return W.proc_read(path, maximum) if opener else (status if path.endswith('/status') else raw)
        def fd_target(path):
            return {'/proc/self/fd/0': '/dev/null', '/proc/self/fd/1': 'pipe:[1]', '/proc/self/fd/2': 'pipe:[1]'}[path]
        def hashed(path, maximum):
            r = rows[path]; return r['bytes'], r['sha256'], '0'*128
        with patch.object(W.os, 'getpid', return_value=1), patch.object(W.os, 'getppid', return_value=0), \
             patch.object(W.os, 'getuid', return_value=1000), patch.object(W.os, 'geteuid', return_value=1000), \
             patch.object(W.os, 'getgid', return_value=1000), patch.object(W.os, 'getegid', return_value=1000), \
             patch.object(W.os, 'getcwd', return_value='/work'), patch.dict(W.os.environ, P.ENV, clear=True), \
             patch.object(P, 'namespaces', return_value={k: k + ':[20]' for k in P.NS}), \
             patch.object(W.os, 'listdir', return_value=['0', '1', '2']), patch.object(W.os, 'readlink', fd_target), \
             patch.dict(W.observations.__globals__, proc_read=read, open=opener or forbidden_open), \
             patch.object(C, 'hash_file', hashed):
            try:
                return W.observations(C, P, projected)
            finally:
                self.assertEqual(reads, [('/proc/self/status', 16384), ('/proc/self/mountinfo', 512 * 1024)])

    def test_real_reader_full_267_mounts_split_after_27_and_refusals(self):
        projected, obs = self.specimen(0)
        for i in range(267 - len(obs['mounts'])):
            point = f'/runtime/lib/python3.11/synthetic{i}.py'
            projected['rows'].append(dict(target=point, role=f'stdlib:synthetic{i}', bytes=1, sha256='a'*64))
            obs['mounts'][point] = dict(fs='tmpfs', options=['ro'], super=['rw'])
        P.data(projected)
        raw = self.raw(obs['mounts']); lines = raw.splitlines(keepends=True)
        self.assertEqual(len(lines), 267); self.assertEqual(len(projected['rows']), 262)
        first, rest = b''.join(lines[:27]), b''.join(lines[27:])
        with self.assertRaises(ValueError) as truncated:
            P.validate_mounts(W.parse_mounts(C, first), projected['rows'])
        self.assertEqual(truncated.exception.args, ('mount surface', 0, 0, 240))
        status = b''.join(k.encode() + b':\t' + b'0'*16 + b'\n'
                          for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'))
        for payload, error in ((raw, None), (raw + b'bad\n', 'mount table syntax'),
                               (b''.join(lines[:-1]), 'mount surface'),
                               (raw + b'999 1 0:99 / /unknown ro - tmpfs none rw\n', 'mount surface')):
            streams = [ProcStream([status, b'']), ProcStream([first, payload[len(first):], b''])]
            opened = []
            def opener(path, mode, *, buffering):
                self.assertEqual((mode, buffering), ('rb', 0)); opened.append(path)
                return streams[len(opened) - 1]
            try:
                if error:
                    with self.assertRaises(ValueError) as caught: self.worker(projected, payload, opener)
                    self.assertEqual(caught.exception.args[0], error)
                else:
                    actual = self.worker(projected, raw, opener)
                    self.assertEqual(actual['mounts'], W.parse_mounts(C, first + rest))
                    P.validate_observation(actual, projected)
            finally:
                self.assertEqual(opened, ['/proc/self/status', '/proc/self/mountinfo'])
                self.assertEqual([(s.enters, s.closes) for s in streams], [(1, 1), (1, 1)])
                self.assertEqual(streams[0].requests, [16385, 16385 - len(status)])
                self.assertEqual(streams[1].requests, [524289, 524289 - len(first), 524289 - len(payload)])

    def test_all_sixteen_subsets_worker_and_host_superblock_rw(self):
        self.assertEqual(P.PROC_COVERS, ('/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus'))
        for bits in range(16):
            projected, obs = self.specimen(bits)
            raw = self.raw(obs['mounts'])
            with self.subTest(bits=bits):
                actual = self.worker(projected, raw)
                self.assertEqual(actual['mounts'], W.parse_mounts(C, raw))
                P.validate_observation(actual, projected)
                self.assertEqual(actual['mounts']['/proc']['super'], ['rw'])

    def test_negative_surfaces_worker_and_host(self):
        cases = [
            (lambda m: m.update({'/proc/kcore': copy.deepcopy(m['/proc'])}), 'mount surface', 'mount surface'),
            (lambda m: m.update({'/proc/sys/kernel': copy.deepcopy(m['/proc/sys'])}), 'mount surface', 'mount surface'),
            (lambda m: m.pop('/inputs/provision.json'), 'mount surface', 'mount surface'),
            (lambda m: m['/proc/sys'].update(options=['rw', 'nosuid', 'nodev', 'noexec']), 'observed mount mode', 'observed mount mode'),
            (lambda m: m['/proc/sys']['options'].append('rw'), 'observed mount mode', 'observed mount mode'),
            (lambda m: m['/proc/sys']['options'].remove('noexec'), 'protective proc flags/type', 'protective proc flags/type'),
            (lambda m: m['/proc/sys']['options'].append('exec'), 'protective proc flags/type', 'protective proc flags/type'),
            (lambda m: m['/proc/sys'].update(fs='tmpfs'), 'protective proc flags/type', 'schema keys'),
            (lambda m: m['/proc/sys'].update(procRoot='/'), 'protective proc root', 'protective proc root'),
            (lambda m: m['/proc/sys'].update(procDevice='0:43'), 'protective proc device mismatch', 'protective proc device mismatch'),
            (lambda m: m['/proc/sys'].update(procDevice='bad'), 'protective proc device syntax', 'protective proc device syntax'),
            (lambda m: m['/proc/sys'].update(procDevice='0:9999999999'), 'protective proc device syntax', 'protective proc device syntax'),
            (lambda m: m['/proc'].update(procRoot='/sys'), 'protective proc root', 'protective proc root'),
            (lambda m: m['/proc']['options'].remove('nodev'), 'protective proc flags/type', 'protective proc flags/type'),
        ]
        for change, host_error, worker_error in cases:
            projected, obs = self.specimen(); change(obs['mounts'])
            with self.subTest(change=change):
                with self.assertRaises(ValueError) as host: P.validate_observation(obs, projected)
                self.assertEqual(host.exception.args[0], host_error)
                with self.assertRaises(ValueError) as worker: self.worker(projected, self.raw(obs['mounts']))
                self.assertEqual(worker.exception.args[0], worker_error)

    def test_proc_metadata_strict_host_schema(self):
        changes = (lambda m: m['/proc/sys'].pop('procRoot'), lambda m: m['/proc'].pop('procDevice'),
                   lambda m: m['/out'].update(procRoot='/'), lambda m: m['/proc/sys'].update(procDevice=True),
                   lambda m: m['/proc'].update(procDevice='00:42'))
        for change in changes:
            projected, obs = self.specimen(); change(obs['mounts'])
            with self.subTest(change=change), self.assertRaises(ValueError): P.validate_observation(obs, projected)

    def test_raw_parser_duplicate_propagation_and_syntax(self):
        projected, obs = self.specimen(); raw = self.raw(obs['mounts'])
        for altered in (raw + raw.splitlines(keepends=True)[0],
                        raw.replace(b' - ', b' shared:7 - ', 1), raw.replace(b' - ', b' master:7 - ', 1),
                        raw.replace(b' - ', b' propagate_from:7 - ', 1)):
            with self.assertRaisesRegex(ValueError, '^mount propagation/duplicates$'): self.worker(projected, altered)
        for altered in (b'bad\n', b'1 2 - proc none rw\n'):
            with self.assertRaisesRegex(ValueError, '^mount table syntax$'): self.worker(projected, altered)

    def test_mount_difference_codes_no_paths_and_bounded_counts(self):
        projected, obs = self.specimen(5)
        secret = '/private/unknown/DO_NOT_EXPORT'
        obs['mounts'][secret] = copy.deepcopy(obs['mounts']['/proc']); del obs['mounts']['/out']
        with self.assertRaises(ValueError) as caught: P.validate_observation(obs, projected)
        self.assertEqual(caught.exception.args, ('mount surface', 5, 1, 1))
        self.assertEqual(W.failure_code(caught.exception, 'OBSERVATIONS'), 'ValueError:OBS_MOUNT_SET:P5:U1:M1')
        obs['mounts'].update({f'/synthetic-extra-{i}': {} for i in range(1000)})
        with self.assertRaises(ValueError) as saturated: P.validate_observation(obs, projected)
        self.assertEqual(saturated.exception.args, ('mount surface', 5, 999, 1))
        for args in (('mount surface', True, 1, 1), ('mount surface', 16, 0, 0),
                     ('mount surface', 0, -1, 0), ('mount surface', 0, 1000, 0), ('mount surface', 0, secret, 0)):
            result = W.failure_code(ValueError(*args), 'OBSERVATIONS')
            self.assertEqual(result, 'ValueError:OBSERVATIONS_UNCLASSIFIED')
            self.assertNotIn(secret, result)
        result = W.failure_code(ValueError('mount surface', 15, 999, 999), 'OBSERVATIONS')
        self.assertLessEqual(len(result), 128)


class HostExportIntegration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ak5597-export-fixture-', dir=os.environ['TMPDIR'])
        self.base = Path(self.tmp.name)
        for name in ('output', 'parent'): (self.base / name).mkdir(mode=0o700)
        self.output = C.open_dir(str(self.base / 'output')); self.parent = C.open_dir(str(self.base / 'parent'))
        self.review, self.projected, self.raw, self.manifest, self.pre, self.worker, self.supervision = export_fixture()
        self.cancel = L.Latch()
        self.prepared = (C, D, P, T, L, self.review, {}, '/unused-source')
        self.destination = self.base / 'parent' / self.review['exportName']

    def tearDown(self):
        os.close(self.output); os.close(self.parent); self.tmp.cleanup()

    def write_receipts(self):
        C.put(self.output, 'pre-node.json', C.encode(self.pre), C.JSON_MAX)
        C.put(self.output, 'worker.json', C.encode(self.worker), C.JSON_MAX)

    def export(self):
        return H.export_result(self.prepared, self.output, self.parent, self.supervision,
                               self.projected, self.raw, self.manifest, self.cancel)

    def test_actual_export_settled_failure_partial_tree_and_attribution(self):
        self.write_receipts(); C.put(self.output, 'provisioned-tree.tar.partial', b'inert partial')
        with patch.object(C, 'open_file', side_effect=AssertionError('no control reopen')):
            self.assertFalse(self.export())
        final = C.decode((self.destination / 'export.json').read_bytes())
        self.assertTrue(final['complete']); self.assertFalse(final['good']); self.assertFalse(final['treeComplete'])
        self.assertEqual(final['supervision']['controlObservation'], self.supervision['controlObservation'])
        self.assertNotIn(b'controlObservation', self.raw)
        self.assertEqual((self.destination / 'provisioned-tree.tar.partial').read_bytes(), b'inert partial')

    def test_actual_export_missing_receipt_rejected_before_destination(self):
        C.put(self.output, 'pre-node.json', C.encode(self.pre), C.JSON_MAX)
        with self.assertRaises(FileNotFoundError): self.export()
        self.assertFalse(self.destination.exists())

    def test_actual_export_mismatched_receipt_rejected(self):
        self.worker['preNodeSha256'] = 'e'*64; self.write_receipts()
        with self.assertRaises(ValueError): self.export()
        self.assertFalse(self.destination.exists())

    def test_actual_export_unknown_helper_rejected_before_reads(self):
        self.supervision['helperReaped'] = False
        with patch.dict(H.export_result.__globals__, read_at=lambda *a: self.fail('must not read')):
            with self.assertRaises(ValueError): self.export()
        self.assertFalse(self.destination.exists())

    def test_actual_export_copy_failure_retains_incomplete(self):
        self.write_receipts()
        original = C.write_all
        def write(fd, raw):
            if raw == C.encode(self.pre):
                original(fd, raw[:10]); raise OSError('fake disk full')
            original(fd, raw)
        with patch.object(C, 'write_all', write), self.assertRaises(OSError): self.export()
        self.assertTrue((self.destination / 'incomplete.json').exists())
        self.assertEqual((self.destination / 'pre-node.json.copy-partial').stat().st_size, 10)
        self.assertFalse((self.destination / 'export.json').exists())

    def test_actual_export_cancel_during_preservation(self):
        self.write_receipts(); C.put(self.output, 'provisioned-tree.tar.partial', b'partial')
        original = H.copy_at
        def copying(*args):
            original(*args); self.cancel.record()
        with patch.dict(H.export_result.__globals__, copy_at=copying): self.assertFalse(self.export())
        final = C.decode((self.destination / 'export.json').read_bytes())
        self.assertTrue(final['cancelled']); self.assertFalse(final['good']); self.assertTrue(final['complete'])
        self.assertEqual((self.destination / 'provisioned-tree.tar.partial').read_bytes(), b'partial')

    def test_actual_export_cancel_vetoes_otherwise_good(self):
        _, _, _, _, self.pre, self.worker, self.supervision = export_fixture(good=True)
        payload, inventory = b'fixture'.ljust(10240, b'\0'), b'fixture\n'
        summary = dict(complete=True, bytes=len(payload), entries=7, sha256=P.sha(payload),
                       inventoryBytes=len(inventory), inventorySha256=P.sha(inventory))
        self.worker['tree'] = summary
        self.write_receipts(); C.put(self.output, 'provisioned-tree.tar', payload)
        validated, original = [], H.copy_at
        def validator(fd, inv, roots):
            # Explicit validator double: this test proves export cancellation, NOT tar validity.
            self.assertEqual(roots, self.worker['rootFiles'])
            validated.append(True); C.write_all(inv, inventory); return summary
        def copying(*args):
            original(*args); self.cancel.record()
        with patch.object(T, 'validate_tar', validator), patch.dict(H.export_result.__globals__, copy_at=copying):
            self.assertFalse(self.export())
        self.assertEqual(validated, [True])
        final = C.decode((self.destination / 'export.json').read_bytes())
        self.assertTrue(final['workerGood']); self.assertTrue(final['treeComplete'])
        self.assertTrue(final['cancelled']); self.assertFalse(final['good'])


if __name__ == '__main__':
    unittest.main()
