"""Pure fake transport/FD tests; no network/subprocess/lifecycle/cleanup.
After independent review + separate test authorization only, supply an existing private
AK5597_PURE_TEST_PARENT. Each fixture is NEW scratch, deliberately retained, never deleted.
Numeric IP literals below are test data, NOT an operational endpoint freeze.
"""
import base64
import copy
import hashlib
import io
import os
from pathlib import Path
import runpy
import ssl
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

HERE = Path(__file__).parent
C = SimpleNamespace(**runpy.run_path(str(HERE / 'artifact-contract.py')))
W = SimpleNamespace(**runpy.run_path(str(HERE / 'artifact-worker.py')))
E = SimpleNamespace(**runpy.run_path(str(HERE / 'artifact-export.py')))
D = SimpleNamespace(**runpy.run_path(str(HERE / 'artifact-driver.py')))
P = SimpleNamespace(**runpy.run_path(str(HERE / 'artifact-probe.py'), init_globals={'C': C}))
INPUT = '/home/tryinget/.local/state/pi-quests/tmp/ak5597-acquisition-inputs.TAcEcBy8/acquisition-inputs.json'
PAYLOAD = b'inert fixture bytes, not a tar archive\n'


def archive(payload=PAYLOAD):
    return dict(url='https://registry.npmjs.org/test/-/test-1.0.0.tgz', name='test', version='1.0.0',
                filename='test-1.0.0.tgz', sha512Hex=hashlib.sha512(payload).hexdigest(),
                integrity='sha512-' + base64.b64encode(hashlib.sha512(payload).digest()).decode())


def row(name, payload=PAYLOAD):
    return dict(file=name, bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(),
                sha512=hashlib.sha512(payload).hexdigest())


class Response(io.BytesIO):
    def __init__(self, payload=PAYLOAD, headers=None, status=200, version=11, declared=None, chunked=False):
        super().__init__(payload)
        self.status, self.version, self.chunked = status, version, chunked
        self.length = len(payload) if declared is None else declared
        self.headers = [('Content-Length', str(self.length))] if headers is None else headers

    def getheaders(self):
        return self.headers


class Connection:
    def __init__(self, response, failure=False):
        self.response, self.failure, self.calls, self.closed = response, failure, [], False

    def putrequest(self, *args, **kwargs):
        self.calls.append(('request', args, kwargs))

    def putheader(self, *args):
        self.calls.append(('header', args))

    def endheaders(self):
        if self.failure:
            raise OSError('fake connection error; must not be logged')

    def getresponse(self):
        return self.response

    def close(self):
        self.closed = True
        self.response.close()


class RawSocket:
    def __init__(self, peer=('1.1.1.1', 443)):
        self.peer, self.connected, self.timeout, self.closed = peer, None, None, False

    def settimeout(self, timeout):
        self.timeout = timeout

    def connect(self, endpoint):
        self.connected = endpoint

    def getpeername(self):
        return self.peer

    def selected_alpn_protocol(self):
        return 'http/1.1'

    def close(self):
        self.closed = True


class Context:
    check_hostname = True
    verify_mode = ssl.CERT_REQUIRED
    post_handshake_auth = False

    def wrap_socket(self, raw, server_hostname):
        self.server_hostname = server_hostname
        return raw


class Pure(unittest.TestCase):
    def scratch(self):
        parent = C.open_dir(os.environ['AK5597_PURE_TEST_PARENT'])
        try:
            C.owned_dir(parent)
            d = C.new_dir(parent, 'ak5597-artifact-pure-' + uuid.uuid4().hex)
            self.addCleanup(os.close, d)  # FD close only: no filesystem cleanup anywhere.
            return d
        finally:
            os.close(parent)

    def attempt(self, response, a=None, budget=None, failure=False):
        d = self.scratch()
        conn = Connection(response, failure)
        budget = budget or W.Budget()
        factory = lambda *_: conn
        result = W.fetch(a or archive(), '1.1.1.1', ('1.1.1.1',), Context(), d, budget, factory)
        return result, d, conn, budget

    def test_fresh_directory_description_observes_new_entries(self):
        d = self.scratch()
        self.assertEqual(C.directory_names(d), [])
        os.listdir(d)  # Prime the retained description before later writes.
        C.put(d, 'after-empty-list', b'inert cursor fixture')
        position = os.lseek(d, 0, os.SEEK_CUR)
        self.assertEqual(C.directory_names(d), ['after-empty-list'])
        self.assertEqual(os.lseek(d, 0, os.SEEK_CUR), position)
        C.put(d, 'second-entry', b'inert cursor fixture')
        self.assertEqual(set(C.directory_names(d)), {'after-empty-list', 'second-entry'})

    def test_missing_or_broad_toolchain_refuses_as_pure_data(self):
        targets = [("python", "/runtime/bin/python3"), ("ca", "/inputs/ca.pem"),
                   ("manifest", "/inputs/acquisition.json"), ("seed", "/inputs/npm-12.0.2.tgz"),
                   ("code", "/code/artifact-contract.py"), ("code", "/code/artifact-worker.py"),
                   ("stdlib", "/runtime/lib/python3.11/os.py"), ("library", "/lib64/ld-linux-x86-64.so.2"),
                   ("code", "/code/artifact-probe.py")]
        valid = dict(schema="ak5597-artifact-toolchain.v1", task=5597, label=C.LABEL,
                     publicIPv4=["1.1.1.1"], mounts=[dict(role=r, target=t, source="/fixtures/file-" + str(i),
                     sha256="0" * 64, bytes=1) for i, (r, t) in enumerate(targets)])
        C.toolchain(valid)
        empty_init = copy.deepcopy(valid)
        empty_init['mounts'][6].update(target='/runtime/lib/python3.11/urllib/__init__.py',
                                      bytes=0, sha256=hashlib.sha256(b'').hexdigest())
        C.toolchain(empty_init)
        for index in (0, 1, 2, 3, 4, 5, 7, 8):
            bad = copy.deepcopy(valid); bad['mounts'][index]['bytes'] = 0
            with self.subTest(empty_role=index), self.assertRaises(ValueError): C.toolchain(bad)
        for change in ({'target': '/runtime/lib/python3.11/os.py'}, {'sha256': '0' * 64}):
            bad = copy.deepcopy(empty_init); bad['mounts'][6].update(change)
            with self.subTest(empty_init=change), self.assertRaises(ValueError): C.toolchain(bad)
        regular_library = copy.deepcopy(valid)
        regular_library['mounts'][7]['target'] = '/usr/lib/libc.so.6'
        C.toolchain(regular_library)
        # Separate regular-FD positive: inert bytes, never the host libc or an ELF execution.
        library_dir = self.scratch()
        C.put(library_dir, 'libc.so.6', PAYLOAD)
        library_fd = E.open_source(library_dir, 'libc.so.6', C.TOOLCHAIN_MAX)
        try:
            self.assertEqual(C.regular(library_fd, C.TOOLCHAIN_MAX).st_size, len(PAYLOAD))
        finally:
            os.close(library_fd)
        for target in ('/usr', '/usr/lib', '/usr/lib/*.so', '/usr/lib/../libc.so.6',
                       '/usr/lib/site-packages/x.so', '/usr/lib/dist-packages/x.so'):
            bad = copy.deepcopy(regular_library); bad['mounts'][7]['target'] = target
            with self.subTest(target=target), self.assertRaises(ValueError):
                C.toolchain(bad)
        mutations = [lambda m: m.update(publicIPv4=[]), lambda m: m.update(mounts=[]),
                     lambda m: m["mounts"][0].update(target="/usr"),
                     lambda m: m["mounts"][1].update(source="/fixtures/../ca"),
                     lambda m: m["mounts"][4].update(target="/code/unreviewed.py"),
                     lambda m: m["mounts"][6].update(target="/runtime/lib/python3.11/site-packages/x.py"),
                     lambda m: m["mounts"][7].update(bytes=C.TOOLCHAIN_MAX),
                     lambda m: m["mounts"].append(copy.deepcopy(m["mounts"][0]))]
        for mutate in mutations:
            data = copy.deepcopy(valid); mutate(data)
            with self.assertRaises(ValueError):
                C.toolchain(data)

    def test_exact_manifest_and_hash(self):
        raw = C.read_file(INPUT)
        self.assertEqual(len(C.manifest(raw)['networkArchives']), 165)
        with self.assertRaises(ValueError):
            C.manifest(raw + b' ')
        with self.assertRaises(ValueError):
            C.manifest(raw, '0' * 64)

    def test_manifest_schema_sri_duplicates(self):
        original = C.decode(C.read_file(INPUT))
        mutations = [
            lambda m: m.update(extra=True),
            lambda m: m.update(task=5598),
            lambda m: m.update(noQualificationClaim=False),
            lambda m: m['networkArchives'].pop(),
            lambda m: m['networkArchives'].__setitem__(1, copy.deepcopy(m['networkArchives'][0])),
            lambda m: m['networkArchives'][0].update(integrity='sha512-' + 'A' * 86 + '=='),
            lambda m: m['networkArchives'][0].update(url='https://registry.npmjs.org/metadata'),
            lambda m: m['networkArchives'][0].update(filename='../escape.tgz'),
            lambda m: m['seededTooling'][0].update(bytes=0),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                value = copy.deepcopy(original); mutate(value)
                with self.assertRaises(ValueError):
                    C.manifest_schema(value)
        for raw in (b'{"a":1,"a":2}', b'{"a":NaN}', b'{}' * C.JSON_MAX):
            with self.assertRaises(ValueError):
                C.decode(raw)
        for value in ('sha1-aaaa', 'sha512-' + 'A' * 85 + 'B==', archive()['integrity'] + ' '):
            with self.assertRaises(ValueError):
                C.sri(value)

    def test_url_rejects_every_noncanonical_form_before_connection(self):
        good = archive()['url']
        bad = [good + '?q=1', good + '#x', good.replace('https:', 'http:'),
               good.replace(C.HOST, C.HOST + ':443'), good.replace(C.HOST, 'u:p@' + C.HOST),
               good.replace(C.HOST, C.HOST.upper()), good.replace(C.HOST, '1.1.1.1'),
               good.replace('/test/-/', '/test/../'), good.replace('/test/-/', '/test/%2e%2e/'),
               good.replace('/test/-/', '//test/-/'), good + '\r\nAuthorization: test',
               'https://registry.npmjs.org/test', good.replace('test-1.0.0', 'test-2.0.0')]
        d = self.scratch()
        for value in bad:
            a = archive(); a['url'] = value
            with self.subTest(url=value), self.assertRaises(ValueError):
                W.fetch(a, '1.1.1.1', ('1.1.1.1',), Context(), d, W.Budget(),
                        lambda *_: self.fail('connection before URL validation'))
        self.assertEqual(C.directory_names(d), [])

    def test_ip_rejections_and_unknown_ip(self):
        for ips in ([], ['127.0.0.1'], ['10.0.0.1'], ['172.16.0.1'], ['192.168.1.1'],
                    ['169.254.169.254'], ['100.64.0.1'], ['0.0.0.0'], ['224.0.0.1'],
                    ['240.0.0.1'], ['::1'], ['1.1.1.01'], ['1.1.1.1', '1.1.1.1']):
            with self.subTest(ips=ips), self.assertRaises(ValueError):
                C.public_ips(ips)
        d = self.scratch()
        with self.assertRaises(ValueError):
            W.fetch(archive(), '8.8.8.8', ('1.1.1.1',), Context(), d, W.Budget(),
                    lambda *_: self.fail('unknown IP connected'))
        self.assertEqual(C.directory_names(d), [])

    def test_numeric_socket_sni_and_peer_checks_no_dns(self):
        context, raw = Context(), RawSocket()
        with patch.object(W.socket, 'socket', return_value=raw) as socket_factory, \
                patch.object(W.socket, 'getaddrinfo', side_effect=AssertionError('DNS forbidden')):
            conn = W.FixedHTTPS('1.1.1.1', ('1.1.1.1',), context)
            conn.connect()
            socket_factory.assert_called_once_with(W.socket.AF_INET, W.socket.SOCK_STREAM)
            self.assertEqual(raw.connected, ('1.1.1.1', 443))
            self.assertEqual(raw.timeout, 30)
            self.assertEqual(context.server_hostname, C.HOST)
            conn.close()
        raw = RawSocket(('8.8.8.8', 443))
        with patch.object(W.socket, 'socket', return_value=raw), self.assertRaises(ValueError):
            W.FixedHTTPS('1.1.1.1', ('1.1.1.1',), Context()).connect()
        self.assertTrue(raw.closed)
        context = Context(); context.check_hostname = False
        with self.assertRaises(ValueError):
            W.FixedHTTPS('1.1.1.1', ('1.1.1.1',), context)

    def test_fixed_request_and_stream_integrity(self):
        result, d, conn, budget = self.attempt(Response())
        self.assertEqual(result, row(archive()['filename']))
        self.assertEqual(budget.used, len(PAYLOAD))
        self.assertTrue(conn.closed)
        self.assertEqual(conn.calls[0], ('request', ('GET', '/test/-/test-1.0.0.tgz'),
                                         dict(skip_host=True, skip_accept_encoding=True)))
        self.assertEqual(conn.calls[1:], [('header', (k, v)) for k, v in (
            ('Host', C.HOST), ('Accept', 'application/octet-stream'), ('Accept-Encoding', 'identity'),
            ('Connection', 'close'), ('User-Agent', 'ak5597-artifact/1'))])
        fd = E.open_source(d, result['file'], C.ARCHIVE_MAX)
        try:
            self.assertEqual(C.read_fd(fd, C.ARCHIVE_MAX), PAYLOAD)
        finally:
            os.close(fd)

    def test_bad_responses_before_file_creation(self):
        cases = [Response(status=302), Response(status=100), Response(version=10),
                 Response(chunked=True), Response(headers=[('Transfer-Encoding', 'chunked')]),
                 Response(headers=[('Content-Length', str(len(PAYLOAD))), ('Content-Encoding', 'identity')]),
                 Response(headers=[('Content-Length', '01')]), Response(headers=[('Content-Length', '+1')]),
                 Response(headers=[('Content-Length', '1 ')]), Response(headers=[]),
                 Response(headers=[('Content-Length', '1'), ('Content-Length', '1')]),
                 Response(declared=C.ARCHIVE_MAX + 1), Response(declared=0),
                 Response(headers=[('X-Fold', 'x\r\ny'), ('Content-Length', str(len(PAYLOAD)))]),
                 Response(headers=[('X', 'a' * 8192), ('Content-Length', str(len(PAYLOAD)))])]
        for response in cases:
            d = self.scratch(); conn = Connection(response)
            with self.subTest(response=response), self.assertRaises(ValueError):
                W.fetch(archive(), '1.1.1.1', ('1.1.1.1',), Context(), d, W.Budget(), lambda *_: conn)
            self.assertEqual(C.directory_names(d), [])
            self.assertTrue(conn.closed)
        budget = W.Budget(); budget.charge(C.TOTAL_MAX - 1)
        d = self.scratch()
        with self.assertRaises(ValueError):
            W.fetch(archive(), '1.1.1.1', ('1.1.1.1',), Context(), d, budget, lambda *_: Connection(Response()))
        self.assertEqual(C.directory_names(d), [])

    @W.acquisition_http_policy()
    def test_actual_header_parser_caps_status_and_interims(self):
        def parse(raw):
            sock = SimpleNamespace(makefile=lambda *_: io.BytesIO(raw))
            response = W.ExactResponse(sock, method='GET')
            try:
                response.begin()
            finally:
                response.close()
        for raw in (b'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\n\r\n',
                    b'HTTP/1.1 302 Found\r\n\r\n',
                    b'HTTP/1.1 200 ' + b'x' * 8192 + b'\r\n',
                    b'HTTP/1.1 200 OK\r\nX: ' + b'x' * 8192 + b'\r\n\r\n',
                    b'HTTP/1.1 200 OK\r\n' + b'X: a\r\n' * 32 + b'\r\n'):
            with self.subTest(raw=raw[:30]), self.assertRaises((ValueError, W.http.client.HTTPException)):
                parse(raw)

    def test_truncated_hash_error_and_prebody_error_accounting(self):
        for payload in (PAYLOAD[:-1], b'X' * len(PAYLOAD)):
            d = self.scratch(); budget = W.Budget()
            conn = Connection(Response(payload, declared=len(PAYLOAD)))
            with self.assertRaises(ValueError):
                W.fetch(archive(), '1.1.1.1', ('1.1.1.1',), Context(), d, budget, lambda *_: conn)
            self.assertEqual(budget.used, len(payload))
            self.assertEqual(C.directory_names(d), [archive()['filename']])
            self.assertNotIn('worker-receipt.json', C.directory_names(d))
        d = self.scratch(); conn = Connection(Response(), failure=True)
        with self.assertRaises(OSError):
            W.fetch(archive(), '1.1.1.1', ('1.1.1.1',), Context(), d, W.Budget(), lambda *_: conn)
        self.assertEqual(C.directory_names(d), [])
        self.assertTrue(conn.closed)

    def test_chunk_bound_and_seed_counts_toward_total(self):
        data = b'x' * (C.CHUNK + 17)
        reads = []
        class Body(io.BytesIO):
            def read(self, n):
                reads.append(n)
                return super().read(n)
        budget = W.Budget(); budget.charge(3045132)
        W.stream(Body(data), len(data), hashlib.sha512(data).hexdigest(), self.scratch(), 'body.tgz', budget)
        self.assertEqual(reads, [C.CHUNK, 17])
        self.assertEqual(budget.used, 3045132 + len(data))

    def test_copy_integrity_exclusive_alias_and_symlink(self):
        source, destination = self.scratch(), self.scratch()
        C.put(source, 'fixture.tgz', PAYLOAD)
        expected = row('fixture.tgz')
        E.copy_file(source, destination, expected)
        self.assertEqual(E.hash_source(destination, expected).st_size, len(PAYLOAD))
        with self.assertRaises(FileExistsError):
            E.copy_file(source, destination, expected)
        with self.assertRaises(ValueError):
            E.copy_file(source, source, expected)
        self.assertEqual(E.hash_source(destination, expected).st_size, len(PAYLOAD))
        bad = dict(expected, sha512='0' * 128)
        with self.assertRaises(ValueError):
            E.copy_file(source, self.scratch(), bad)
        symlink = self.scratch()
        os.symlink('missing', 'fixture.tgz', dir_fd=symlink)
        with self.assertRaises(OSError):
            E.copy_file(symlink, self.scratch(), expected)
        hardlink = self.scratch()
        os.link('fixture.tgz', 'fixture.tgz', src_dir_fd=source, dst_dir_fd=hardlink)
        with self.assertRaises(ValueError):
            E.hash_source(hardlink, expected)

    def test_failed_output_exports_only_failure_receipts_after_reap(self):
        source, parent = self.scratch(), self.scratch()
        manifest = C.manifest(C.read_file(INPUT))
        supervision = dict(childReaped=False, returncode=0, reason='exited')
        with self.assertRaises(ValueError):
            E.export(source, parent, 'ak5597-artifacts-test', manifest, supervision)
        self.assertEqual(C.directory_names(parent), [])
        supervision['childReaped'] = True
        self.assertFalse(E.export(source, parent, 'ak5597-artifacts-test', manifest, supervision))
        out = os.open('ak5597-artifacts-test', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            self.assertEqual(set(C.directory_names(out)), {'supervisor-receipt.json', 'export-receipt.json'})
        finally:
            os.close(out)

    def test_d154_required_attribution_has_no_default_fallback(self):
        value = dict(schema='ai-society-heavy-job-retention-deferral/v1', mode='named-run-age-only',
                     owner_decision_id='154', deferred_run_id='run-1788137699-9655c994d9827ead',
                     deferred_root_dev=1, deferred_root_ino=2,
                     deferred_manifest_sha256='3048a36f394c095946a69be97f41e225677711cb42170b71d4560beb92efaeba',
                     admission_scan_scope='readable-current-uid', protected_process_count=8)
        # Historical owner output, not current admission/authorization.
        actual = C.decode(C.read_file('/home/tryinget/.local/state/pi-quests/tmp/ak5597-d154-preflight.DXXXXhUE/stdout.json'))
        self.assertTrue(actual['preflight_only']); D.require_d154(C, actual)
        D.require_d154(C, {'retention_deferral': value})
        for control in ({}, {'retention_deferral': None}):
            with self.assertRaises(ValueError):
                D.require_d154(C, control)
        bad = dict(schema='other', mode='default', owner_decision_id=154,
                   deferred_run_id='run-1788137699-0000000000000000', deferred_root_dev=-1,
                   deferred_root_ino=True, deferred_manifest_sha256='0' * 64,
                   admission_scan_scope='all-users', protected_process_count=-1, extra='unknown')
        for key, replacement in bad.items():
            with self.subTest(field=key), self.assertRaises(ValueError):
                D.require_d154(C, {'retention_deferral': dict(value, **{key: replacement})})
        for count in (True, '8', None, 2**64):
            with self.subTest(count=count), self.assertRaises(ValueError):
                D.require_d154(C, {'retention_deferral': dict(value, protected_process_count=count)})
        missing = dict(value); del missing['protected_process_count']
        with self.assertRaises(ValueError): D.require_d154(C, {'retention_deferral': missing})

    @W.acquisition_http_policy()
    def test_physical_headers_cannot_hide_te_ce_before_file_effects(self):
        malformed = [b'Bad header: x\r\n', b'NoColon\r\n', b' orphan\r\n', b'\torphan\r\n',
                     b': empty-name\r\n', b'X : space\r\n', b'X: a\r\n folded\r\n',
                     b'X: nul\x00\r\n', b'X: del\x7f\r\n', b'X: vt\x0b\r\n',
                     b'X: ff\x0c\r\n', b'X: bare\n', b'X: bare\rX: other\r\n']
        class ParsedConnection(Connection):
            def getresponse(self):
                self.response.begin()
                return self.response
        d = self.scratch()
        for prefix in malformed:
            for forbidden in (b'Transfer-Encoding: chunked\r\n', b'Content-Encoding: gzip\r\n'):
                # Put valid Content-Length before a broken line as well as after it:
                # the old HTTPMessage parser could stop there and hide later fields.
                for headers in (prefix + forbidden + b'Content-Length: 1\r\n',
                                b'Content-Length: 1\r\n' + prefix + forbidden):
                    raw = b'HTTP/1.1 200 OK\r\n' + headers + b'\r\nx'
                    response = W.ExactResponse(SimpleNamespace(makefile=lambda *_: io.BytesIO(raw)), method='GET')
                    conn = ParsedConnection(response)
                    with self.subTest(prefix=prefix, forbidden=forbidden), self.assertRaises(ValueError):
                        W.fetch(archive(), '1.1.1.1', ('1.1.1.1',), Context(), d, W.Budget(), lambda *_: conn)
                    self.assertTrue(conn.closed)
                    self.assertEqual(C.directory_names(d), [])
        for raw in (b'HTTP/1.1 200 OK\nContent-Length: 1\r\n\r\nx',
                    b'HTTP/1.1 200 OK\r\nContent-Length: 1\r\n',
                    b'HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\nx'):
            response = W.ExactResponse(SimpleNamespace(makefile=lambda *_: io.BytesIO(raw)), method='GET')
            try:
                with self.assertRaises(ValueError):
                    response.begin()
            finally:
                response.close()

    @W.acquisition_http_policy()
    def test_real_parser_success_sri_and_defects(self):
        raw = b'HTTP/1.1 200 OK\r\nContent-Length: ' + str(len(PAYLOAD)).encode() + b'\r\n\r\n' + PAYLOAD
        def response():
            return W.ExactResponse(SimpleNamespace(makefile=lambda *_: io.BytesIO(raw)), method='GET')
        r = response()
        try:
            r.begin()
            n = W.length(r, C.TOTAL_MAX)
            self.assertEqual(W.stream(r, n, archive()['sha512Hex'], self.scratch(), 'parsed.tgz', W.Budget()),
                             row('parsed.tgz'))
        finally:
            r.close()
        parser = W.http.client.parse_headers
        def defective(*args, **kwargs):
            headers = parser(*args, **kwargs)
            headers.defects.append(ValueError('synthetic parser defect'))
            return headers
        r = response()
        try:
            with patch.object(W.http.client, 'parse_headers', side_effect=defective), self.assertRaises(ValueError):
                r.begin()
        finally:
            r.close()

    def export_fixture(self):
        # Synthetic 166-body exporter unit fixture, NOT the real SDK manifest/seed.
        source, parent = self.scratch(), self.scratch()
        rows = [row('fixture-%03d.tgz' % i) for i in range(165)] + [row('npm-12.0.2.tgz')]
        for item in rows:
            C.put(source, item['file'], PAYLOAD)
        manifest = dict(networkArchives=[dict(filename=r['file'], sha512Hex=r['sha512']) for r in rows[:-1]],
                        seededTooling=[dict(file=rows[-1]['file'], bytes=len(PAYLOAD),
                                           sha256=rows[-1]['sha256'], integrity=archive()['integrity'])])
        C.put(source, 'worker-receipt.json', C.encode(dict(schema='ak5597-artifact-worker.v1', status='complete',
              inputSha256=C.INPUT_SHA256, bodyBytes=len(PAYLOAD) * 166, archives=rows, qualification=False)))
        return source, parent, manifest, rows

    def exported_marker(self, parent):
        out = os.open('ak5597-artifacts-test', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        self.addCleanup(os.close, out)
        fd = E.open_source(out, 'export-receipt.json', C.RECEIPT_MAX)
        try:
            return out, C.decode(C.read_fd(fd, C.RECEIPT_MAX))
        finally:
            os.close(fd)

    def test_full_export_success_is_not_durability_or_wrapper_proof(self):
        source, parent, manifest, rows = self.export_fixture()
        self.assertTrue(E.export(source, parent, 'ak5597-artifacts-test', manifest,
                                 dict(childReaped=True, returncode=0, reason='exited')))
        out, marker = self.exported_marker(parent)
        self.assertEqual(marker['status'], 'complete')
        self.assertFalse(marker['durabilityCertified'])
        self.assertEqual(marker['acceptanceRequires'],
                         ['driver-exit-0', 'owner-wrapper-exit-0', 'independent-export-verification'])
        self.assertEqual(marker['archives'], rows)
        self.assertEqual(set(C.directory_names(out)), {r['file'] for r in rows} |
                         {'worker-receipt.json', 'supervisor-receipt.json', 'export-receipt.json'})
        for r in rows + [marker['workerReceipt']]:
            E.hash_source(out, r)
        fd = E.open_source(out, 'supervisor-receipt.json', C.RECEIPT_MAX)
        try:
            self.assertEqual(hashlib.sha256(C.read_fd(fd, C.RECEIPT_MAX)).hexdigest(), marker['supervisorSha256'])
        finally:
            os.close(fd)

    def test_full_export_copy_failure_leaves_only_failed_acceptance(self):
        source, parent, manifest, rows = self.export_fixture()
        original, calls = E.copy_file, []
        def fail_second(*args, **kwargs):
            calls.append(args[2]['file'])
            if len(calls) == 2:
                raise OSError('synthetic copy error')
            return original(*args, **kwargs)
        with patch.dict(E.export.__globals__, copy_file=fail_second):
            self.assertFalse(E.export(source, parent, 'ak5597-artifacts-test', manifest,
                                      dict(childReaped=True, returncode=0, reason='exited')))
        out, marker = self.exported_marker(parent)
        self.assertEqual(marker['status'], 'failed')
        self.assertTrue(marker['copyFailed'])
        self.assertEqual(marker['archives'], [])
        self.assertEqual(set(C.directory_names(out)), {rows[0]['file'], 'supervisor-receipt.json', 'export-receipt.json'})
        E.hash_source(out, rows[0])

    def test_post_marker_directory_fsync_error_propagates_failure(self):
        source, parent, manifest, _ = self.export_fixture()
        original = os.fsync
        def fail_parent(fd):
            if fd == parent:
                raise OSError('synthetic post-marker fsync error')
            return original(fd)
        with patch.object(E.os, 'fsync', side_effect=fail_parent), self.assertRaises(OSError):
            E.export(source, parent, 'ak5597-artifacts-test', manifest,
                     dict(childReaped=True, returncode=0, reason='exited'))
        _, marker = self.exported_marker(parent)
        self.assertEqual(marker['status'], 'complete')  # Presence cannot contradict the raised failure.
        self.assertFalse(marker['durabilityCertified'])

    def test_same_hash_metadata_race_rejected_by_source_identity(self):
        source = self.scratch()
        C.put(source, 'fixture.tgz', PAYLOAD)
        identity = E.C.identity
        for operation in (lambda: E.hash_source(source, row('fixture.tgz')),
                          lambda: E.copy_file(source, self.scratch(), row('fixture.tgz'))):
            calls = []
            def changed(stat_result):
                result = identity(stat_result)
                calls.append(result)
                # Simulate a changed ctime with identical bytes/length. No actual race,
                # rewrite or process: this tests the metadata comparison, not OS proof.
                return result if len(calls) == 1 else result[:-1] + (result[-1] + 1,)
            with patch.object(E.C, 'identity', side_effect=changed), self.assertRaises(ValueError):
                operation()
            self.assertEqual(len(calls), 2)

    def test_argv_is_data_only_and_has_no_ambient_mounts(self):
        argv = D.argv_for({}, [(dict(role='python', target='/runtime/bin/python3'), 10)], 11, 12, 'acquire')
        self.assertEqual(argv[0], '/usr/bin/bwrap')
        for flag in ('--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
                     '--share-net', '--new-session', '--die-with-parent', '--clearenv'):
            self.assertIn(flag, argv)
        self.assertEqual(argv[-6:], ['/runtime/bin/python3', '-I', '-S', '-B', '/code/artifact-worker.py', '--acquire'])
        self.assertNotIn('--proc', argv)
        self.assertNotIn('--setenv', argv)
        self.assertNotIn('--dev-bind', argv)
        self.assertEqual(argv[argv.index('--bind-fd') + 1:argv.index('--bind-fd') + 3], ['12', '/out'])
        self.assertNotIn('--bind', argv); self.assertNotIn('/proc/self/fd/12', argv)
        probe = D.argv_for({}, [(dict(role='python', target='/runtime/bin/python3'), 10)], 11, 12, 'probe')
        self.assertEqual(probe[probe.index('--bind-fd') + 1:probe.index('--bind-fd') + 3], ['12', '/out'])
        self.assertNotIn('--bind', probe); self.assertNotIn('/proc/self/fd/12', probe)


    def probe_fixture(self):
        # Entirely synthetic data; neither /proc nor runtime files are consulted.
        targets = [('python', '/runtime/bin/python3'), ('ca', '/inputs/ca.pem'),
                   ('manifest', '/inputs/acquisition.json'), ('seed', '/inputs/npm-12.0.2.tgz'),
                   ('code', '/code/artifact-contract.py'), ('code', '/code/artifact-worker.py'),
                   ('code', '/code/artifact-probe.py'), ('stdlib', '/runtime/lib/python3.14/os.py'),
                   ('library', '/usr/lib/libc.so.6')]
        tool = C.toolchain(dict(schema='ak5597-artifact-toolchain.v1', task=5597, label=C.LABEL,
               publicIPv4=['1.1.1.1'], mounts=[dict(role=r, target=t, source='/fixture/f%d' % i,
               sha256='1' * 64, bytes=1) for i, (r, t) in enumerate(targets)]))
        parent = {name: [1, i + 1] for i, name in enumerate(P.NAMESPACES)}
        rows = [dict(target=r['target'], bytes=r['bytes'], sha256=r['sha256'], readonly=True,
                     deniedWriteOpen=P.errno.EROFS) for r in tool['mounts']]
        rows.append(dict(target='/inputs/toolchain.json', bytes=100, sha256='2' * 64,
                         readonly=True, deniedWriteOpen=P.errno.EACCES))
        receipt = dict(schema='ak5597-artifact-probe.v1', status='observed', qualification=False,
                       acquisition=False, networkAttempted=False, inputSha256=C.INPUT_SHA256,
                       toolchainSha256='2' * 64, mounts=rows,
                       namespaces={name: [1, 100 + i] for i, name in enumerate(P.NAMESPACES)},
                       fds=[0, 1, 2, 4], allowedFds=[0, 1, 2, 4],
                       python=dict(executable='/runtime/bin/python3', sha256='1' * 64, version=[3, 14, 7],
                                   versionText='synthetic Python', prefix='/runtime', basePrefix='/runtime',
                                   isolated=True, noSite=True, noBytecode=True),
                       ca=dict(x509=121, x509_ca=121, crl=0), rootReadonly=True, privateProc=True,
                       outWritable=True, outputWrite=dict(file=P.WRITE_NAME, bytes=len(P.WRITE_BYTES),
                       sha256=hashlib.sha256(P.WRITE_BYTES).hexdigest(), fileFsync=True, dirFsync=True))
        supervision = dict(childCreated=True, childReaped=True, returncode=0, reason='exited')
        return receipt, supervision, tool, '2' * 64, 100, parent

    def test_probe_pure_verifier_positive_and_forged_identity(self):
        values = self.probe_fixture()
        self.assertTrue(P.verify(*values))
        empty = self.probe_fixture()
        fields = dict(target='/runtime/lib/python3.14/urllib/__init__.py', bytes=0,
                      sha256=hashlib.sha256(b'').hexdigest())
        empty[2]['mounts'][7].update(fields); empty[0]['mounts'][7].update(fields)
        C.toolchain(empty[2]); self.assertTrue(P.verify(*empty))
        empty[0]['mounts'][0]['bytes'] = 0
        with self.assertRaises(ValueError): P.verify(*empty)
        config = list(self.probe_fixture()); config[4] = 0; config[0]['mounts'][-1]['bytes'] = 0
        with self.assertRaises(ValueError): P.verify(*config)
        config = list(self.probe_fixture()); config[3] = 'not-a-digest'
        with self.assertRaises(ValueError): P.verify(*config)
        for change in (dict(schema='ak5597-artifact-worker.v1'), dict(status='complete'),
                       dict(acquisition=True), dict(qualification=True), dict(networkAttempted=True),
                       dict(inputSha256='0' * 64), dict(toolchainSha256='0' * 64), dict(extra=True)):
            with self.subTest(change=change), self.assertRaises(ValueError):
                P.verify(dict(values[0], **change), *values[1:])
        for absent in (None, {}, False):
            with self.assertRaises(ValueError):
                P.verify(absent, *values[1:])

    def test_probe_all_namespaces_must_change(self):
        for name in P.NAMESPACES:
            values = self.probe_fixture()
            values[0]['namespaces'][name] = values[-1][name]
            with self.subTest(namespace=name), self.assertRaises(ValueError):
                P.verify(*values)

    def test_probe_readonly_denied_open_and_input_digest_failures(self):
        for field, value in (('readonly', False), ('deniedWriteOpen', 0), ('deniedWriteOpen', P.errno.ENOENT),
                             ('deniedWriteOpen', True), ('sha256', '0' * 64), ('bytes', 2), ('target', '/other')):
            for index in range(len(self.probe_fixture()[0]['mounts'])):
                values = self.probe_fixture(); values[0]['mounts'][index][field] = value
                with self.subTest(field=field, index=index), self.assertRaises(ValueError):
                    P.verify(*values)
        for key in ('rootReadonly', 'privateProc', 'outWritable'):
            values = self.probe_fixture(); values[0][key] = False
            with self.assertRaises(ValueError):
                P.verify(*values)

    def test_probe_output_python_ca_and_fd_failures(self):
        mutations = [lambda r: r['outputWrite'].update(fileFsync=False),
                     lambda r: r['outputWrite'].update(dirFsync=False),
                     lambda r: r['outputWrite'].update(sha256='0' * 64),
                     lambda r: r['outputWrite'].update(bytes=True),
                     lambda r: r['python'].update(sha256='0' * 64),
                     lambda r: r['python'].update(prefix='/usr'),
                     lambda r: r['python'].update(version=[3, 11, 0]),
                     lambda r: r['python'].update(isolated=False),
                     lambda r: r['ca'].update(x509_ca=0),
                     lambda r: r['fds'].append(5), lambda r: r['allowedFds'].append(5)]
        for mutate in mutations:
            values = self.probe_fixture(); mutate(values[0])
            with self.assertRaises(ValueError):
                P.verify(*values)

    def test_probe_child_failure_and_no_reap_refuse(self):
        for change in (dict(childCreated=False), dict(childReaped=False), dict(returncode=1),
                       dict(returncode=False), dict(returncode=None), dict(reason='timeout')):
            values = self.probe_fixture(); values[1].update(change)
            with self.assertRaises(ValueError):
                P.verify(*values)

    def test_driver_sequence_no_network_before_verified_exported_readiness(self):
        for mode in ('probe', 'acquire'):
            events = []
            def run(phase):
                events.extend([phase, 'reaped']); return 99, {'childReaped': True}
            def verify(*_):
                self.assertEqual(events, ['probe', 'reaped'])
                events.append('verified'); return {'sha256': '1' * 64}
            def export(*_):
                events.append('exported'); return True
            def acquire():
                self.assertEqual(events, ['probe', 'reaped', 'verified', 'exported'])
                events.append('acquire-new-output'); return True
            self.assertTrue(D.phases(mode, run, verify, export, acquire, D.Cancellation()))
            self.assertEqual(events[-1], 'exported' if mode == 'probe' else 'acquire-new-output')

    def test_driver_sequence_missing_forged_failed_probe_never_acquires(self):
        for failure in ('missing', 'forged', 'child', 'none', 'false'):
            events = []
            def run(_):
                values = self.probe_fixture()
                if failure == 'child':
                    values[1]['returncode'] = 1
                if failure == 'forged':
                    values[0]['mounts'][0]['sha256'] = '0' * 64
                return values, values[1]
            def verify(values, _):
                if failure == 'missing':
                    raise FileNotFoundError('synthetic missing receipt')
                if failure in ('none', 'false'):
                    return None if failure == 'none' else False
                P.verify(*values)
                return {'sha256': '1' * 64}
            def export(_, supervision, row):
                self.assertIsNone(row)
                self.assertEqual(supervision['probeValidation'], 'failed')
                events.append('bounded-failure-export'); return True
            self.assertFalse(D.phases('acquire', run, verify, export,
                             lambda: self.fail('network child before readiness'), D.Cancellation()))
            self.assertEqual(events, ['bounded-failure-export'])
        self.assertFalse(D.phases('acquire', lambda _: (0, {}), lambda *_: {}, lambda *_: False,
                         lambda: self.fail('network child after export failure'), D.Cancellation()))

    def test_explicit_modes_refuse_before_effects_and_probe_argv(self):
        for mode in (None, '', 'auto', 'PROBE', True):
            with self.assertRaises(ValueError):
                D.phases(mode, lambda _: self.fail('effect before mode check'), None, None, None, D.Cancellation())
            with self.assertRaises(ValueError):
                D.argv_for({}, [], 11, 12, mode)
        mounted = [(dict(role='python', target='/runtime/bin/python3'), 10)]
        probe = D.argv_for({}, mounted, 11, 12, 'probe')
        acquire = D.argv_for({}, mounted, 11, 13, 'acquire')
        self.assertIn('--unshare-net', probe); self.assertNotIn('--share-net', probe)
        self.assertEqual(probe[probe.index('--proc'):probe.index('--proc') + 4],
                         ['--proc', '/proc', '--remount-ro', '/proc'])
        self.assertEqual(probe[-1], '--probe')
        self.assertNotIn('--proc', acquire); self.assertIn('--share-net', acquire)
        self.assertEqual(probe[probe.index('--ro-bind-data'):probe.index('--ro-bind-data') + 3],
                         acquire[acquire.index('--ro-bind-data'):acquire.index('--ro-bind-data') + 3])

    def test_denied_write_open_never_writes_input_bytes(self):
        for error in (P.errno.EROFS, P.errno.EACCES, P.errno.EPERM):
            with patch.object(P.os, 'open', side_effect=OSError(error, 'synthetic')) as opened, \
                    patch.object(P.os, 'write', side_effect=AssertionError('input write forbidden')):
                self.assertEqual(P.denied_write_open('/frozen/file'), error)
                flags = opened.call_args.args[1]
                self.assertFalse(flags & (os.O_CREAT | os.O_TRUNC))
        with patch.object(P.os, 'open', return_value=60), patch.object(P.os, 'close') as closed, \
                patch.object(P.os, 'write', side_effect=AssertionError('input write forbidden')):
            self.assertEqual(P.denied_write_open('/frozen/file'), 0)
            closed.assert_called_once_with(60)

    def test_probe_receipt_export_and_missing_specimen_fail_closed(self):
        values = self.probe_fixture()
        source, parent = self.scratch(), self.scratch()
        C.put(source, 'probe-receipt.json', C.encode(values[0]))
        with self.assertRaises(ValueError):
            P.verify_output(E, source, *values[1:])
        C.put(source, P.WRITE_NAME, P.WRITE_BYTES)
        receipt_row = P.verify_output(E, source, *values[1:])
        out = E.export_probe(source, parent, 'ak5597-artifacts-probe', values[1], receipt_row)
        try:
            self.assertEqual(set(C.directory_names(out)), {'probe-receipt.json', 'supervisor-receipt.json'})
            E.hash_source(out, receipt_row, C.RECEIPT_MAX)
        finally:
            os.close(out)
        # A failed probe exports only a bounded, distinct failure and supervision.
        failed = E.export_probe(source, parent, 'ak5597-artifacts-failed', dict(values[1], returncode=1), None)
        try:
            fd = E.open_source(failed, 'probe-receipt.json', C.RECEIPT_MAX)
            try:
                failure = C.decode(C.read_fd(fd, C.RECEIPT_MAX))
            finally:
                os.close(fd)
            self.assertEqual(failure['schema'], 'ak5597-artifact-probe-failure.v1')
            self.assertFalse(failure['acquisition'])
            self.assertEqual(set(C.directory_names(failed)), {'probe-receipt.json', 'supervisor-receipt.json'})
        finally:
            os.close(failed)


    def test_worker_probe_verifies_inputs_and_ca_without_archive_or_socket(self):
        tool = self.probe_fixture()[2]
        seed = dict(bytes=len(PAYLOAD), sha256=hashlib.sha256(PAYLOAD).hexdigest(),
                    integrity=archive()['integrity'])
        events = []
        fake_c = SimpleNamespace(**vars(W.C))
        fake_c.read_file = lambda path: events.append(('read', path)) or b'{}'
        fake_c.decode = lambda _: tool
        fake_c.toolchain = lambda value: value
        fake_c.hash_file = lambda path, _: events.append(('hash', path)) or (1, '1' * 64, '')
        fake_c.manifest = lambda _: dict(seededTooling=[seed])
        fake_c.open_file = lambda *_: 3
        fake_c.open_dir = lambda *_: 4
        fake_c.regular = lambda *_: None
        fake_c.read_fd = lambda *_: PAYLOAD
        fake_c.owned_dir = lambda *_: None
        fake_c.directory_names = lambda *_: []
        context = SimpleNamespace(load_verify_locations=lambda **_: events.append('CA-loaded'),
                                  set_alpn_protocols=lambda _: None,
                                  cert_store_stats=lambda: dict(x509=121, x509_ca=121, crl=0))
        def probe(observed_tool, raw, output, ca):
            self.assertIs(observed_tool, tool)
            self.assertIn('CA-loaded', events)
            self.assertEqual([e[1] for e in events if isinstance(e, tuple) and e[0] == 'hash'],
                             [r['target'] for r in tool['mounts']])
            self.assertEqual(output, 4); self.assertEqual(ca['x509_ca'], 121)
            events.append('probe')
        with patch.dict(W.main.__globals__, C=fake_c, P=SimpleNamespace(probe=probe),
                        limits=lambda: events.append('fake-limits'),
                        acquisition_http_policy=lambda: self.fail('probe installed HTTP policy'),
                        stream=lambda *_: self.fail('archive copy in probe'),
                        fetch=lambda *_: self.fail('fetch in probe')), \
                patch.object(W.sys, 'argv', ['artifact-worker.py', '--probe']), \
                patch.object(W.os, 'getcwd', return_value='/out'), patch.object(W.os, 'close') as closed, \
                patch.object(W.ssl, 'SSLContext', return_value=context), \
                patch.object(W.socket, 'socket', side_effect=AssertionError('socket creation in probe')), \
                patch.object(W.socket, 'getaddrinfo', side_effect=AssertionError('DNS in probe')):
            W.main()
            self.assertEqual([call.args[0] for call in closed.call_args_list], [3, 4])
        self.assertEqual(events[-1], 'probe')

    def test_worker_unknown_or_missing_mode_precedes_limits(self):
        for args in (['worker.py'], ['worker.py', '--auto'], ['worker.py', '--probe', 'extra']):
            with patch.object(W.sys, 'argv', args), \
                    patch.dict(W.main.__globals__, limits=lambda: self.fail('limits before mode validation'),
                               acquisition_http_policy=lambda: self.fail('hook before mode validation')), \
                    self.assertRaises(ValueError):
                W.main()


    def test_probe_observer_with_only_fake_proc_fds_hashes_and_writes(self):
        values = list(self.probe_fixture())
        expected, _, tool, _, _, _ = values
        tool_raw = b'x' * 100
        values[3] = expected['toolchainSha256'] = hashlib.sha256(tool_raw).hexdigest()
        expected['mounts'][-1]['sha256'] = values[3]
        mounts = {r['target']: (['ro'], 'tmpfs') for r in expected['mounts']}
        mounts.update({'/': (['ro'], 'tmpfs'), '/proc': (['ro'], 'proc'), '/out': (['rw'], 'btrfs')})
        written, synced, denied = {}, [], []
        fake_c = SimpleNamespace(**vars(C))
        fake_c.put = lambda d, name, raw: written.update({name: raw})
        def hash_file(path, _):
            if path == '/out/' + P.WRITE_NAME:
                raw = written[P.WRITE_NAME]
                return len(raw), hashlib.sha256(raw).hexdigest(), ''
            r = next(r for r in expected['mounts'] if r['target'] == path)
            return r['bytes'], r['sha256'], ''
        fake_c.hash_file = hash_file
        fake_os = SimpleNamespace(ST_RDONLY=os.ST_RDONLY, fsync=lambda d: synced.append(d),
                                  statvfs=lambda p: SimpleNamespace(f_flag=0 if p == '/out' else os.ST_RDONLY))
        fake_sys = SimpleNamespace(executable='/runtime/bin/python3', version_info=(3, 14, 7),
                                   version='synthetic Python', prefix='/runtime', base_prefix='/runtime',
                                   flags=SimpleNamespace(isolated=1, no_site=1), dont_write_bytecode=True)
        with patch.dict(P.probe.__globals__, C=fake_c, os=fake_os, sys=fake_sys,
                        mount_table=lambda: mounts, namespace_ids=lambda: expected['namespaces'],
                        observed_fds=lambda: [0, 1, 2, 4], executable_hash=lambda: '1' * 64,
                        denied_write_open=lambda path: denied.append(path) or P.errno.EROFS), \
                patch('builtins.print'), \
                patch.object(W.socket, 'socket', side_effect=AssertionError('probe socket')):
            P.probe(tool, tool_raw, 4, expected['ca'])
        self.assertEqual(synced, [4, 4])
        self.assertEqual(denied, [r['target'] for r in expected['mounts']])
        self.assertEqual(set(written), {P.WRITE_NAME, 'probe-receipt.json'})
        values[0] = C.decode(written['probe-receipt.json'])
        self.assertTrue(P.verify(*values))


    def test_observed_fds_closed_transient_live_extra_and_unexpected_error(self):
        def stat(fd):
            if fd == 6:
                raise OSError(P.errno.EBADF, 'closed readdir duplicate')
            return object()
        with patch.object(P.os, 'open', return_value=5), patch.object(P.os, 'close'), \
                patch.object(P.os, 'listdir', return_value=['0', '1', '2', '4', '5', '6', '7']), \
                patch.object(P.os, 'fstat', side_effect=stat):
            observed = P.observed_fds()
            self.assertEqual(observed, [0, 1, 2, 4, 7])
            values = self.probe_fixture(); values[0]['fds'] = observed
            with self.assertRaises(ValueError):
                P.verify(*values)  # Arbitrary extra live descriptor is NOT hidden.
        with patch.object(P.os, 'open', return_value=5), patch.object(P.os, 'close'), \
                patch.object(P.os, 'listdir', return_value=['5', '6']), \
                patch.object(P.os, 'fstat', side_effect=OSError(P.errno.EIO, 'unexpected')):
            with self.assertRaises(OSError):
                P.observed_fds()

    def test_worker_import_and_scoped_parser_policy_do_not_leak_or_overlap(self):
        def policy():
            return (W.http.client._read_headers, W.http.client._MAXLINE, W.http.client._MAXHEADERS)
        before = policy()
        def work(mode):
            self.assertEqual(mode, '--acquire')
            self.assertIs(policy()[0], W.strict_read_headers)
        with patch.object(W.sys, 'argv', ['worker', '--acquire']), \
                patch.dict(W.main.__globals__, work=work):
            W.main()  # Fake work only: no limits, files, CA, socket or lifecycle.
        self.assertEqual(policy(), before)
        other = SimpleNamespace(**runpy.run_path(str(HERE / 'artifact-worker.py')))
        self.assertEqual(policy(), before)
        for worker in (W, other):
            with worker.acquisition_http_policy():
                self.assertIs(policy()[0], worker.strict_read_headers)
                self.assertEqual(policy()[1:], (8192, 32))
                with self.assertRaises(ValueError):
                    with other.acquisition_http_policy():
                        self.fail('overlapping policy accepted')
                self.assertIs(policy()[0], worker.strict_read_headers)
            self.assertEqual(policy(), before)
        with self.assertRaises(RuntimeError):
            with W.acquisition_http_policy():
                raise RuntimeError('synthetic parser failure')
        self.assertEqual(policy(), before)

    def test_supervisor_late_cancellation_at_final_poll_and_reap(self):
        for when in ('poll', 'wait'):
            cancel, events = D.Cancellation(), []
            pipe = lambda n: SimpleNamespace(fileno=lambda: n, close=lambda: events.append('closed'))
            def poll():
                events.append('poll')
                if when == 'poll':
                    cancel.record()
                return 0  # Final EOF/final condition: loop body never observes pending.
            def wait():
                events.append('wait')
                if when == 'wait':
                    cancel.record()
                return 0
            child = SimpleNamespace(stdout=pipe(10), stderr=pipe(11), poll=poll, wait=wait,
                                    kill=lambda: self.fail('kill of exited fake child'))
            selector = SimpleNamespace(register=lambda *_: None, get_map=lambda: {},
                                       close=lambda: events.append('selector-closed'))
            with patch.object(D.selectors, 'DefaultSelector', return_value=selector), \
                    patch.object(D.subprocess, 'Popen', return_value=child), \
                    patch.object(D.os, 'set_blocking'), \
                    patch.object(D.signal, 'signal', side_effect=AssertionError('supervisor replaced handler')):
                receipt = D.supervise(['fake-bwrap'], [], '/fake/approved/tmp', cancel)
            self.assertEqual(receipt['reason'], 'interrupted')
            self.assertTrue(receipt['cancelled']); self.assertTrue(receipt['childReaped'])
            self.assertEqual(events.count('wait'), 1)
            self.assertFalse(D.phases('acquire', lambda _: self.fail('later child'), None, None,
                                     lambda: self.fail('acquisition after cancellation'), cancel))
            values = list(self.probe_fixture()); values[1] = receipt
            with self.assertRaises(ValueError):
                P.verify(*values)

    def test_cancellation_during_verify_export_and_acquisition_prevents_acceptance(self):
        for when in ('verify', 'export', 'acquire'):
            cancel, acquired = D.Cancellation(), []
            def verify(*_):
                if when == 'verify':
                    cancel.record()
                return {'sha256': '1' * 64}
            def export(*_):
                if when == 'export':
                    cancel.record()
                return True
            def acquire():
                acquired.append(True); cancel.record(); return True
            self.assertFalse(D.phases('acquire', lambda _: (0, {}), verify, export, acquire, cancel))
            self.assertEqual(acquired, [True] if when == 'acquire' else [])

    def test_driver_handlers_cover_settlement_and_final_status(self):
        for when in ('settlement', 'status'):
            handlers, old = {}, object()
            def install(signum, handler):
                previous = handlers.get(signum, old); handlers[signum] = handler
                self.assertIsNot(handler, D.signal.SIG_IGN)
                return previous
            def operation(cancel, _):
                if when == 'settlement':
                    handlers[D.signal.SIGTERM](D.signal.SIGTERM, None)
                return {'good': True}
            def output(*_, **__):
                if when == 'status':
                    handlers[D.signal.SIGINT](D.signal.SIGINT, None)
            with patch.object(D.signal, 'signal', side_effect=install), \
                    patch.object(D.sys, 'argv', ['driver', '/fake/review', '0' * 64]), \
                    patch.dict(D.main.__globals__, bootstrap=lambda *_: (C,), operation=operation), \
                    patch('builtins.print', side_effect=output), self.assertRaises(InterruptedError):
                D.main()
            self.assertTrue(all(value is old for value in handlers.values()))


    def test_export_cancellation_during_copy_or_post_marker_fsync_is_not_acceptance(self):
        for when in ('copy', 'fsync'):
            cancel, written = D.Cancellation(), {}
            fake_c = SimpleNamespace(**vars(E.C))
            fake_c.owned_dir = lambda _: None
            fake_c.new_dir = lambda *_: 5
            fake_c.put = lambda d, name, raw: written.update({name: C.decode(raw)})
            def copy_file(*_):
                if when == 'copy':
                    cancel.record()
            def fsync(_):
                if when == 'fsync':
                    cancel.record()
            with patch.dict(E.export.__globals__, C=fake_c, inventory=lambda *_: ([row('a')], row('worker')),
                            copy_file=copy_file), patch.object(E.os, 'close'), patch.object(E.os, 'fsync', fsync):
                self.assertFalse(E.export(1, 2, 'export', {},
                                 dict(childReaped=True, returncode=0, reason='exited'), cancel))
            self.assertEqual(written['export-receipt.json']['status'],
                             'failed' if when == 'copy' else 'complete')
            self.assertFalse(written['export-receipt.json']['durabilityCertified'])


if __name__ == '__main__':
    unittest.main()
