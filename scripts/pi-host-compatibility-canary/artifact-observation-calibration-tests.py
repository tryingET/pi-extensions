"""AUTHORED, UNEXECUTED. Sanitized finite-dialect fixtures, never actual-trace replay.
No external inputs, real FD/process/network/fixture writes, or old41 test import.
After independent review/freeze/test admission only: reads four project siblings.
"""
import hashlib
from pathlib import Path
import runpy
from types import SimpleNamespace as NS
import unittest

HERE = Path(__file__).parent
C = NS(**runpy.run_path(str(HERE / 'artifact-contract.py')))
D = NS(**runpy.run_path(str(HERE / 'artifact-driver.py')))
L = NS(**runpy.run_path(str(HERE / 'artifact-observation-lineage.py')))
O = NS(**runpy.run_path(str(HERE / 'artifact-observation.py'), init_globals=dict(C=C, L=L)))

# Only public sandbox role/target names, in exact current 111-row order. No host
# source paths, bytes, IPs, trace PIDs, timestamps, buffers or actual TMPDIR values.
# Projection: SHA256(C.encode([[role, target], ...])), independently text-hashed.
TARGETS_SHA256 = '2ce0971fa0f88b7ffdd28085c1693f64f2de0dbccc79e189e5a1d1c1f7cb955f'
TARGETS = (
    ("python", "/runtime/bin/python3"),
    ("ca", "/inputs/ca.pem"),
    ("manifest", "/inputs/acquisition.json"),
    ("seed", "/inputs/npm-12.0.2.tgz"),
    ("code", "/code/artifact-contract.py"),
    ("code", "/code/artifact-worker.py"),
    ("code", "/code/artifact-probe.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/_blake2.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/_collections_abc.py"),
    ("stdlib", "/runtime/lib/python3.14/importlib/_bootstrap.py"),
    ("stdlib", "/runtime/lib/python3.14/importlib/_bootstrap_external.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/_hashlib.cpython-314-x86_64-linux-gnu.so"),
    ("library", "/runtime/lib/python3.14/lib-dynload/_json.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/_py_warnings.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/_socket.cpython-314-x86_64-linux-gnu.so"),
    ("library", "/runtime/lib/python3.14/lib-dynload/_ssl.cpython-314-x86_64-linux-gnu.so"),
    ("library", "/runtime/lib/python3.14/lib-dynload/_struct.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/_weakrefset.py"),
    ("stdlib", "/runtime/lib/python3.14/abc.py"),
    ("stdlib", "/runtime/lib/python3.14/base64.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/binascii.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/codecs.py"),
    ("stdlib", "/runtime/lib/python3.14/collections/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/contextlib.py"),
    ("stdlib", "/runtime/lib/python3.14/copyreg.py"),
    ("stdlib", "/runtime/lib/python3.14/datetime.py"),
    ("stdlib", "/runtime/lib/python3.14/email/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/email/_encoded_words.py"),
    ("stdlib", "/runtime/lib/python3.14/email/_parseaddr.py"),
    ("stdlib", "/runtime/lib/python3.14/email/_policybase.py"),
    ("stdlib", "/runtime/lib/python3.14/email/base64mime.py"),
    ("stdlib", "/runtime/lib/python3.14/email/charset.py"),
    ("stdlib", "/runtime/lib/python3.14/email/encoders.py"),
    ("stdlib", "/runtime/lib/python3.14/email/errors.py"),
    ("stdlib", "/runtime/lib/python3.14/email/feedparser.py"),
    ("stdlib", "/runtime/lib/python3.14/email/header.py"),
    ("stdlib", "/runtime/lib/python3.14/email/iterators.py"),
    ("stdlib", "/runtime/lib/python3.14/email/message.py"),
    ("stdlib", "/runtime/lib/python3.14/email/parser.py"),
    ("stdlib", "/runtime/lib/python3.14/email/quoprimime.py"),
    ("stdlib", "/runtime/lib/python3.14/email/utils.py"),
    ("stdlib", "/runtime/lib/python3.14/encodings/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/encodings/aliases.py"),
    ("stdlib", "/runtime/lib/python3.14/encodings/ascii.py"),
    ("stdlib", "/runtime/lib/python3.14/encodings/idna.py"),
    ("stdlib", "/runtime/lib/python3.14/encodings/latin_1.py"),
    ("stdlib", "/runtime/lib/python3.14/encodings/utf_8.py"),
    ("stdlib", "/runtime/lib/python3.14/enum.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/fcntl.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/fnmatch.py"),
    ("stdlib", "/runtime/lib/python3.14/functools.py"),
    ("stdlib", "/runtime/lib/python3.14/genericpath.py"),
    ("stdlib", "/runtime/lib/python3.14/glob.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/grp.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/hashlib.py"),
    ("stdlib", "/runtime/lib/python3.14/http/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/http/client.py"),
    ("stdlib", "/runtime/lib/python3.14/importlib/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/importlib/_abc.py"),
    ("stdlib", "/runtime/lib/python3.14/importlib/machinery.py"),
    ("stdlib", "/runtime/lib/python3.14/importlib/util.py"),
    ("stdlib", "/runtime/lib/python3.14/io.py"),
    ("stdlib", "/runtime/lib/python3.14/ipaddress.py"),
    ("stdlib", "/runtime/lib/python3.14/json/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/json/decoder.py"),
    ("stdlib", "/runtime/lib/python3.14/json/encoder.py"),
    ("stdlib", "/runtime/lib/python3.14/json/scanner.py"),
    ("stdlib", "/runtime/lib/python3.14/keyword.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/math.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/ntpath.py"),
    ("stdlib", "/runtime/lib/python3.14/operator.py"),
    ("stdlib", "/runtime/lib/python3.14/os.py"),
    ("stdlib", "/runtime/lib/python3.14/posixpath.py"),
    ("stdlib", "/runtime/lib/python3.14/pathlib/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/pathlib/_os.py"),
    ("stdlib", "/runtime/lib/python3.14/pkgutil.py"),
    ("stdlib", "/runtime/lib/python3.14/quopri.py"),
    ("stdlib", "/runtime/lib/python3.14/re/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/re/_casefix.py"),
    ("stdlib", "/runtime/lib/python3.14/re/_compiler.py"),
    ("stdlib", "/runtime/lib/python3.14/re/_constants.py"),
    ("stdlib", "/runtime/lib/python3.14/re/_parser.py"),
    ("stdlib", "/runtime/lib/python3.14/reprlib.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/resource.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/runpy.py"),
    ("stdlib", "/runtime/lib/python3.14/signal.py"),
    ("stdlib", "/runtime/lib/python3.14/socket.py"),
    ("stdlib", "/runtime/lib/python3.14/ssl.py"),
    ("stdlib", "/runtime/lib/python3.14/stat.py"),
    ("stdlib", "/runtime/lib/python3.14/string/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/stringprep.py"),
    ("stdlib", "/runtime/lib/python3.14/struct.py"),
    ("stdlib", "/runtime/lib/python3.14/types.py"),
    ("library", "/runtime/lib/python3.14/lib-dynload/unicodedata.cpython-314-x86_64-linux-gnu.so"),
    ("stdlib", "/runtime/lib/python3.14/urllib/__init__.py"),
    ("stdlib", "/runtime/lib/python3.14/urllib/parse.py"),
    ("stdlib", "/runtime/lib/python3.14/warnings.py"),
    ("stdlib", "/runtime/lib/python3.14/weakref.py"),
    ("stdlib", "/runtime/lib/python3.14/zipimport.py"),
    ("library", "/lib64/ld-linux-x86-64.so.2"),
    ("library", "/usr/lib/ld-linux-x86-64.so.2"),
    ("library", "/usr/lib/libbrotlicommon.so.1"),
    ("library", "/usr/lib/libbrotlidec.so.1"),
    ("library", "/usr/lib/libbrotlienc.so.1"),
    ("library", "/usr/lib/libc.so.6"),
    ("library", "/usr/lib/libcrypto.so.3"),
    ("library", "/usr/lib/libm.so.6"),
    ("library", "/usr/lib/libpython3.14.so.1.0"),
    ("library", "/usr/lib/libssl.so.3"),
    ("library", "/usr/lib/libz.so.1"),
    ("library", "/usr/lib/libzstd.so.1"),
)
ROOT = '100 execve("/usr/bin/bwrap", ["/usr/bin/bwrap"], ["TMPDIR=/fixture/tmp"]) = 0\n'
FIRST = ('100 clone(child_stack=NULL, flags=CLONE_NEWNS|CLONE_NEWPID|SIGCHLD'
         'strace: Process 101 attached\n) = 101\n')
SECOND = ("101 clone(child_stack=NULL, flags=SIGCHLD) = 2 /* 102 in strace's PID NS */\n")
WORKER = ('102 execve("/runtime/bin/python3", ["/runtime/bin/python3", "-I", "-S", "-B", '
          '"/code/artifact-worker.py", "--probe"], []) = 0\n')
EXITS = ('102 exit_group(0) = ?\n102 +++ exited with 0 +++\n'
         '101 +++ exited with 0 +++\n100 +++ exited with 0 +++\n')
TRACE = ROOT + FIRST + SECOND + WORKER + EXITS


def parse(text=TRACE, chunk=7, complete=True):
    raw = text.encode('ascii')
    parser = L.Lineage()
    for offset in range(0, len(raw), chunk):
        parser.feed(raw[offset:offset + chunk])
    return parser.finish(complete)


def root_exec(argv, env):
    # Current fixture strings are ASCII and need no strace escaping. This is an
    # authored representation, NOT executing strace or proving its native decoder.
    quoted = lambda values: '[' + ', '.join('"' + v + '"' for v in values) + ']'
    return '100 execve("/usr/bin/bwrap", ' + quoted(argv) + ', ' + quoted(env) + ') = 0\n'


class Calibration(unittest.TestCase):
    def assert_inconclusive(self, text):
        result = parse(text)
        self.assertEqual(result['status'], 'inconclusive')
        self.assertFalse(result['allTerminal'])
        self.assertFalse(result['verifiedRuntimeLineage'])
        return result

    def test_three_pid_native_graph_chunks_and_scoped_namespace_mapping(self):
        for chunk in (1, 7, 4096):
            with self.subTest(chunk=chunk):
                result = parse(chunk=chunk)
                self.assertEqual(result['status'], 'source-dialect-complete')
                self.assertEqual(result['rootPid'], 100)
                self.assertEqual(result['workerPid'], 102)
                self.assertEqual([(p['pid'], p['parent']) for p in result['processes']],
                                 [(100, None), (101, 100), (102, 101)])
                self.assertEqual(result['namespaceChildren'],
                                 [dict(parentPid=101, namespacePid=2, tracePid=102)])
                self.assertTrue(result['allExitZero'])
                self.assertEqual(result['signals'], 0)
                for key in ('calibrated', 'verifiedRuntimeLineage', 'helperReapedByDriver',
                            'descendantSettlementCertified'):
                    self.assertIs(result[key], False)

    def test_both_standalone_attach_forms_are_not_parentage(self):
        for notice in ('strace: Process 101 attached\n', '[ Process 101 attached ]\n'):
            fork = '100 clone(child_stack=NULL, flags=SIGCHLD) = 101\n'
            with self.subTest(notice=notice):
                self.assertTrue(parse(TRACE.replace(FIRST, notice + fork))['allTerminal'])
                self.assert_inconclusive(TRACE.replace(FIRST, notice))
                self.assert_inconclusive(TRACE.replace(FIRST, notice + notice + fork))
                self.assert_inconclusive(TRACE + notice)
        self.assert_inconclusive(TRACE.replace(FIRST, 'strace: Process 103 attached\n' + FIRST))

    def test_embedded_attach_allows_child_before_unprefixed_tail(self):
        start, tail = FIRST.split('\n', 1)
        text = ROOT + start + '\n' + SECOND + WORKER
        text += '102 +++ exited with 0 +++\n101 +++ exited with 0 +++\n'
        text += tail + '100 +++ exited with 0 +++\n'
        self.assertTrue(parse(text)['allTerminal'])
        for altered in (text.replace(tail, ''), text.replace(tail, ') = 103\n'),
                        text.replace(tail, ') = -1 EAGAIN (Resource temporarily unavailable)\n'),
                        text.replace(tail, '100 <... clone resumed>) = 101\n'),
                        text.replace(tail, 'garbage) = 101\n'),
                        text.replace(tail, '100 +++ exited with 0 +++\n')):
            self.assert_inconclusive(altered)
        nested = SECOND.replace(') = 2', 'strace: Process 102 attached\n) = 2')
        self.assert_inconclusive(text.replace(SECOND, nested))

    def test_namespace_pid_annotation_is_exact_and_bounded(self):
        annotation = "2 /* 102 in strace's PID NS */"
        for bad in ('2 /* 102 in strace PID NS */', "0 /* 102 in strace's PID NS */",
                    "2 /* 0 in strace's PID NS */", "2147483648 /* 102 in strace's PID NS */",
                    "2 /* 2147483648 in strace's PID NS */", "2 /* 100 in strace's PID NS */",
                    "2 /* 101 in strace's PID NS */", "2 /* 103 in strace's PID NS */",
                    "2 /* 102 in strace's PID NS */ /* unknown */"):
            with self.subTest(bad=bad):
                self.assert_inconclusive(TRACE.replace(annotation, bad))
        scoped = TRACE.replace(') = 101\n', ") = 2 /* 101 in strace's PID NS */\n")
        self.assertTrue(parse(scoped)['allTerminal'])
        self.assertEqual(len(parse(scoped)['namespaceChildren']), 2)
        reused = SECOND.replace('102 in', '103 in')
        self.assert_inconclusive(TRACE.replace(WORKER, reused + WORKER))
        self.assert_inconclusive(TRACE.replace(WORKER, SECOND + WORKER))
        # The printed local 2 never replaces trace PID 102 in subsequent framing.
        self.assert_inconclusive(TRACE.replace('102 execve', '2 execve'))

    def test_resumed_exec_and_raw_io_records(self):
        worker = WORKER.replace(') = 0\n', ' <unfinished ...>\n')
        worker += '100 getpid() = 0x64\n102 <... execve resumed>) = 0\n'
        calls = ('101 sendto(0x3, 0x1000, 0x20, 0, 0x2000, 0xc <unfinished ...>\n'
                 '100 getpid() = 0x64\n101 <... sendto resumed>)            = 0x20\n'
                 '101 recvfrom(0x3, 0x1000, 0x20, 0, 0, 0 <unfinished ...>\n'
                 '101 <... recvfrom resumed>)          = 0x20\n'
                 '100 sethostname(0x1000, 0x10) = 0\n'
                 '100 sched_getaffinity(0, 0x80, 0x1000) = 0x8\n')
        text = TRACE.replace(WORKER, calls + worker)
        self.assertTrue(parse(text)['allTerminal'])
        for altered in (text.replace('<... execve resumed>', '<... read resumed>'),
                        text.replace('<... sendto resumed>', '<... recvfrom resumed>'),
                        text.replace('<... execve resumed>) = 0', '<... execve resumed> <unfinished ...>'),
                        text.replace('101 <... recvfrom resumed>)          = 0x20\n', ''),
                        text.replace('0x3, 0x1000, 0x20, 0, 0, 0', '0x3, "buffer", 0x20, 0, 0, 0'),
                        text.replace('sethostname(0x1000, 0x10)', 'sethostname(0x1000)'),
                        text.replace('getpid()', 'future_syscall()')):
            self.assert_inconclusive(altered)

    def test_stat_comments_only_observed_fields_and_spelling(self):
        fields = ('st_mode=S_IFREG|0400, st_size=1, '
                  'st_atime=1 /* 2000-01-01T00:00:00+0000 */, '
                  'st_mtime=1 /* 2000-01-01T00:00:00.000000001+0000 */, '
                  'st_ctime=1 /* 2000-01-01T00:00:00.000000001+0000 */')
        calls = ['stat("/fixture/file", {%s})', 'lstat("/fixture/file", {%s})',
                 'fstat(3</fixture/file>, {%s})', 'newfstatat(3</fixture>, "file", {%s}, 0)']
        for call in calls:
            line = '101 ' + (call % fields) + ' = 0\n'
            with self.subTest(call=call):
                self.assertTrue(parse(TRACE.replace(WORKER, line + WORKER))['allTerminal'])
                for bad in (line.replace('st_atime=', 'future_time='),
                            line.replace('+0000', 'Z'), line.replace('+0000', '-0100'),
                            line.replace('.000000001', '.1'), line.replace('2000-01-01T', 'unknown '),
                            line.replace(' = 0', ' = 0 /* unknown */'),
                            line.replace('st_size=1', 'st_size=1 /* unknown */')):
                    self.assert_inconclusive(TRACE.replace(WORKER, bad + WORKER))
        # Never use quote contents as removable metadata; unknown comments still refuse.
        quoted = '101 openat(AT_FDCWD, "st_atime=1 /* 2000-01-01T00:00:00+0000 */", O_RDONLY) = 3\n'
        self.assert_inconclusive(TRACE.replace(WORKER, quoted + WORKER))
        quoted_stat = quoted.replace('openat(AT_FDCWD, ', 'stat(').replace(', O_RDONLY) = 3', ', {st_size=1}) = 0')
        self.assert_inconclusive(TRACE.replace(WORKER, quoted_stat + WORKER))

    def test_raw_network_recognition_cannot_be_policy_approval(self):
        # Families 1/16 are sanitized helper-local/netlink forms. Deliberately add a
        # connect record: passive lineage recognition alone cannot approve ANY egress.
        calls = ('100 socket(0x1, 0x1, 0) = 0x3\n100 socket(0x10, 0x3, 0) = 0x4\n'
                 '100 connect(0x3, 0x1000, 0x10) = 0\n')
        result = parse(TRACE.replace(FIRST, calls + FIRST))
        self.assertTrue(result['allTerminal'])
        self.assertFalse(result['verifiedRuntimeLineage'])
        status = O.status(True, True)
        for key in ('good', 'verifiedProbe', 'verifiedRuntimeLineage', 'calibrated',
                    'acquisition', 'qualification', 'readiness'):
            self.assertIs(status[key], False)
        self.assertNotIn('networkApproved', result)

    def test_native_signals_abi_unknown_detach_and_escape_refuse(self):
        bad = ('100 --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED} ---\n',
               '100 +++ killed by SIGTERM +++\n', '100 [ Process runs in 32 bit mode. ]\n',
               'strace: Process 101 detached\n', 'strace: Process 101 attached extra\n',
               '100 clone(child_stack=NULL, flags=CLONE_UNTRACED|SIGCHLD) = 103\n',
               '100 clone(child_stack=NULL, flags=CLONE_THREAD|SIGCHLD) = 103\n',
               '100 clone(child_stack=NULL, flags=CLONE_PARENT|SIGCHLD) = 103\n',
               '100 future_syscall(0) = 0\n', '100 <... read resumed>) = 0\n',
               '100 openat(AT_FDCWD, "x"..., O_RDONLY) = 3\n', 'helper diagnostic\n')
        for line in bad:
            with self.subTest(line=line):
                self.assert_inconclusive(TRACE.replace(FIRST, line + FIRST))

    def test_pid_reuse_invalid_pid_unpaired_and_missing_terminals_refuse(self):
        for text in (TRACE + '102 execve("/runtime/bin/python3", [], []) = 0\n',
                     TRACE + 'strace: Process 102 attached\n', TRACE + SECOND,
                     TRACE.replace('100 ', '0 '), TRACE.replace('100 ', '2147483648 '),
                     TRACE.replace('100 ', '01 '), TRACE.replace('100 ', '-1 '),
                     TRACE.replace('101 attached', '2147483648 attached'),
                     TRACE.replace('101 +++ exited with 0 +++\n', ''), TRACE[:-1],
                     TRACE.replace(SECOND, ''), TRACE.replace(WORKER, ''),
                     TRACE.replace(WORKER, '102 read(0, 0, 0 <unfinished ...>\n' + WORKER)):
            self.assert_inconclusive(text)
        self.assertFalse(parse(complete=False)['allTerminal'])

    def test_prefix_only_exec_abbreviation_and_string_bound_change(self):
        self.assertEqual(O.PREFIX, ('/usr/bin/strace', '-f', '--kill-on-exit', '-I', '1', '--always-show-pid',
            '-e', 'trace=all', '-e', 'raw=!' + O.DECODE, '-e', 'read=none', '-e', 'write=none',
            '-e', 'abbrev=!execve,clone,clone3,stat,lstat,fstat,newfstatat,statx',
            '--decode-fds=path,dev', '--decode-pids=pidns', '--quiet=none', '-s', '512', '--'))
        self.assertEqual(L.LINE_MAX, 32768)
        for syscall in ('read', 'write', 'ioctl', 'getdents', 'readlink', 'socket',
                        'sendto', 'recvfrom', 'sethostname', 'sched_getaffinity'):
            self.assertNotIn(syscall, O.DECODE.split(','))
        self.assertNotIn('-v', O.PREFIX)
        self.assertNotIn('-p', O.PREFIX)

    def test_full_current_111_template_and_worst_fd_tmpdir_string_envelope(self):
        self.assertEqual(len(TARGETS), 111)
        self.assertEqual(hashlib.sha256(C.encode(TARGETS)).hexdigest(), TARGETS_SHA256)
        # Ten-digit positive FD envelope, not a claim about actual future allocations.
        mounted = [(dict(role=role, target=target), 2147483647 - i)
                   for i, (role, target) in enumerate(TARGETS)]
        template = D.argv_for({}, [(r, 'input:%d' % i) for i, (r, _) in enumerate(mounted)],
                              'config', 'output', 'probe')
        review = dict(observer=dict(helperArgvTemplateSha256=hashlib.sha256(C.encode(template)).hexdigest()))
        argv = O.invocation(D.argv_for, {}, mounted, 2147483536, 2147483535, review)
        helper = argv[len(O.PREFIX):]
        self.assertEqual(helper, D.argv_for({}, mounted, 2147483536, 2147483535, 'probe'))
        self.assertEqual(len(helper), 591)
        self.assertEqual(helper.count('--ro-bind-data'), 112)
        self.assertEqual(helper.count('--bind-fd'), 1)
        self.assertEqual(helper[-6:], ['/runtime/bin/python3', '-I', '-S', '-B', '/code/artifact-worker.py', '--probe'])
        self.assertLessEqual(max(map(len, helper)), 256)
        # Entire env string, including key and '=', is 511 bytes; no ambient env read.
        env = ['TMPDIR=/' + 't' * 503]
        self.assertEqual(len(env[0]), 511)
        self.assertTrue(all(len(s.encode('ascii')) < 512 for s in helper + env))
        full = root_exec(helper, env)
        self.assertLessEqual(len(full.rstrip('\n').encode('ascii')), L.LINE_MAX)
        self.assertNotIn('...', full)
        self.assertTrue(parse(full + FIRST + SECOND + WORKER + EXITS)['allTerminal'])
        # Exact reviewed order/targets, not merely 111 rows, binds the invocation.
        changed = list(mounted); changed[0], changed[1] = changed[1], changed[0]
        with self.assertRaises(ValueError):
            O.invocation(D.argv_for, {}, changed, 1, 2, review)
        with self.assertRaises(ValueError):
            O.invocation(D.argv_for, {}, mounted[:-1], 1, 2, review)

    def test_current_truncated_exec_never_qualifies_even_with_complete_graph(self):
        for root in ('100 execve("/usr/bin/bwrap", ["/usr/bin/bwrap", "--unshare-user", ...], 0x1000 /* 1 var */) = 0\n',
                     '100 execve("/usr/bin/bwrap", ["/usr/bin/bwrap", "long"...], ["TMPDIR=/fixture/tmp"]) = 0\n',
                     ROOT.replace('/fixture/tmp"', '/fixture/tmp"...'),
                     ROOT.replace('["TMPDIR=/fixture/tmp"]', '0x1000 /* unknown */')):
            self.assert_inconclusive(root + FIRST + SECOND + WORKER + EXITS)
        # Previous finite env-count form stays readable, but no full argv is invented.
        old = ROOT.replace('["TMPDIR=/fixture/tmp"]', '0x1000 /* 1 var */')
        self.assertTrue(parse(old + FIRST + SECOND + WORKER + EXITS)['allTerminal'])

    def test_generated_oversize_full_argv_and_paired_lines_refuse(self):
        # 111 targets of 256 bytes fit the per-target contract but not necessarily the
        # aggregate printed line. Do not increase LINE_MAX or drop argv to force success.
        mounted = [(dict(role='stdlib', target='/runtime/' + str(i).zfill(3) + 'x' * 244), i + 10)
                   for i in range(111)]
        self.assertTrue(all(len(r['target']) == 256 for r, _ in mounted))
        full = root_exec(D.argv_for({}, mounted, 123, 124, 'probe'), ['TMPDIR=/fixture/tmp'])
        self.assertGreater(len(full.rstrip('\n')), L.LINE_MAX)
        self.assertEqual(self.assert_inconclusive(full + FIRST + SECOND + WORKER + EXITS)['error'], 'line-overflow')
        self.assertEqual(self.assert_inconclusive('x' * (L.LINE_MAX + 1))['error'], 'line-overflow')
        self.assert_inconclusive('x' * L.LINE_MAX + '\n')  # Bounded unknown is still unknown.
        prefix = '100 read(0x1, 0x' + 'a' * 17000
        suffix = 'b' * 17000 + ', 0x1) = 0x1\n'
        text = ROOT + prefix + ' <unfinished ...>\n100 <... read resumed>' + suffix
        self.assert_inconclusive(text + FIRST + SECOND + WORKER + EXITS)


if __name__ == '__main__':
    unittest.main()
