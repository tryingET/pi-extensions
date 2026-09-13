"""One trusted stdlib network worker. No subprocess, extraction, DNS or package runtime."""
from contextlib import contextmanager
import hashlib
import http.client
import os
from pathlib import Path
import resource
import re
import runpy
import signal
import socket
import ssl
import sys
import time
from types import SimpleNamespace

C = SimpleNamespace(**runpy.run_path(str(Path(__file__).with_name('artifact-contract.py'))))
P = SimpleNamespace(**runpy.run_path(str(Path(__file__).with_name('artifact-probe.py')), init_globals={'C': C}))
SOCKET_SECONDS = 30
ARCHIVE_SECONDS = 120
JOB_SECONDS = 1800


def strict_read_headers(fp):
    """Private CPython hook: validate physical bytes BEFORE HTTPMessage normalization.

    Worker-process-local replacement, not a public stdlib API. Exact CPython/stdlib
    compatibility must be pinned/reviewed; pure tests exercise the real begin() path.
    The 32-line allowance includes the mandatory terminating blank CRLF line.
    """
    headers = []
    for _ in range(32):
        line = fp.readline(8193)
        C.require(0 < len(line) <= 8192 and line.endswith(b'\r\n'), 'physical header framing')
        headers.append(line)
        if line == b'\r\n':
            return headers
        # token field name, colon, then HTAB/SP/VCHAR/obs-text only. No obs-fold,
        # whitespace before colon, orphan continuation, bare CR/LF, NUL or DEL.
        C.require(re.fullmatch(rb"[!#$%&'*+.^_`|~0-9A-Za-z-]+:[\t\x20-\x7e\x80-\xff]*\r\n", line),
                  'physical header syntax')
    C.require(False, 'physical header count')


# Function-local marker only: importing this module never mutates http.client policy.
strict_read_headers._ak5597_strict = True


@contextmanager
def acquisition_http_policy():
    """Sequential, non-overlapping scope; exact CPython/stdlib source hashes remain required.
    Expected stock private API: _read_headers, _MAXLINE=65536, _MAXHEADERS=100.
    This is not a generic compatibility shim or a thread-safe global policy manager.
    """
    old = (http.client._read_headers, http.client._MAXLINE, http.client._MAXHEADERS)
    C.require(sys.implementation.name == 'cpython'
              and not getattr(old[0], '_ak5597_strict', False)
              and getattr(old[0], '__module__', None) == 'http.client'
              and getattr(old[0], '__name__', None) == '_read_headers'
              and old[1:] == (65536, 100), 'unexpected/overlapping CPython HTTP policy')
    try:
        http.client._read_headers = strict_read_headers
        http.client._MAXLINE, http.client._MAXHEADERS = 8192, 32
        yield
    finally:
        http.client._read_headers, http.client._MAXLINE, http.client._MAXHEADERS = old


class ExactResponse(http.client.HTTPResponse):
    def _read_status(self):
        line = self.fp.readline(8193)
        # Reject 1xx too: no unbounded interim-response loop. Validate CRLF and
        # controls in the status line rather than accepting the lenient parser.
        C.require(len(line) <= 8192 and re.fullmatch(rb'HTTP/1\.1 200 [\t\x20-\x7e\x80-\xff]*\r\n', line),
                  'HTTP status/version/framing')
        return 'HTTP/1.1', 200, line[13:-2].decode('iso-8859-1')

    def begin(self):
        C.require(http.client._read_headers is strict_read_headers, 'physical header hook replaced')
        super().begin()
        C.require(self.headers is not None and not self.headers.defects, 'HTTPMessage parser defects')


class FixedHTTPS(http.client.HTTPSConnection):
    response_class = ExactResponse

    def __init__(self, ip, allowed, context):
        C.require(ip in C.public_ips(list(allowed)), 'unknown endpoint')
        C.require(context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED, 'TLS verification')
        super().__init__(C.HOST, 443, timeout=SOCKET_SECONDS, context=context)
        self.fixed_ip = ip

    def connect(self):
        C.require(self._tunnel_host is None, 'no tunnel')
        raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            raw.settimeout(SOCKET_SECONDS)
            raw.connect((self.fixed_ip, 443))  # numeric AF_INET; never getaddrinfo/create_connection
            C.require(raw.getpeername() == (self.fixed_ip, 443), 'peer mismatch')
            self.sock = self._context.wrap_socket(raw, server_hostname=C.HOST)
            C.require(self.sock.getpeername() == (self.fixed_ip, 443), 'TLS peer mismatch')
            C.require(self.sock.selected_alpn_protocol() in (None, 'http/1.1'), 'ALPN')
        except BaseException:
            raw.close()
            self.close()
            raise


def length(response, remaining):
    C.require(response.status == 200 and response.version == 11, 'HTTP status/version')
    headers = response.getheaders()
    C.require(len(headers) <= 31, 'header count')
    lengths = []
    for name, value in headers:
        C.require(type(name) is str and type(value) is str
                  and len(name) + len(value) + 4 <= 8192
                  and '\r' not in value and '\n' not in value, 'header bound/folding')
        name = name.lower()
        C.require(name not in ('transfer-encoding', 'content-encoding', 'content-range'), 'encoded body')
        if name == 'content-length':
            lengths.append(value)
    C.require(len(lengths) == 1 and re.fullmatch(r'[1-9][0-9]{0,8}', lengths[0]),
              'canonical Content-Length')
    n = int(lengths[0])
    C.require(not response.chunked and response.length == n, 'body framing')
    return C.integer(n, 1, min(C.ARCHIVE_MAX, remaining))


class Budget:
    def __init__(self):
        self.used = 0

    @property
    def remaining(self):
        return C.TOTAL_MAX - self.used

    def charge(self, n):
        C.integer(n, 0, self.remaining)
        self.used += n  # Includes bytes in any subsequently failed/partial file. No retries.


def stream(body, n, expected512, d, filename, budget, expected256=None):
    C.integer(n, 1, min(C.ARCHIVE_MAX, budget.remaining))
    C.digest(expected512, 128)
    if expected256 is not None:
        C.digest(expected256)
    C.leaf(filename)
    h512, h256 = hashlib.sha512(), hashlib.sha256()
    fd = C.create(d, filename)
    try:
        remaining = n
        while remaining:
            block = body.read(min(C.CHUNK, remaining))
            C.require(type(block) is bytes and 0 < len(block) <= min(C.CHUNK, remaining), 'truncated/oversized read')
            budget.charge(len(block))
            C.write_all(fd, block)
            h512.update(block); h256.update(block)
            remaining -= len(block)
        # HTTPResponse stops at declared Content-Length; no extra wire-byte claim.
        C.require(h512.hexdigest() == expected512, 'archive SHA512')
        C.require(expected256 is None or h256.hexdigest() == expected256, 'archive SHA256')
        os.fsync(fd)
        C.require(C.regular(fd, C.ARCHIVE_MAX, owned=True).st_size == n, 'written size')
    finally:
        os.close(fd)
    return dict(file=filename, bytes=n, sha512=h512.hexdigest(), sha256=h256.hexdigest())


def fetch(a, ip, ips, context, d, budget, connection=FixedHTTPS):
    path = C.url(a['url'], a['name'], a['version'])
    C.require(C.sri(a['integrity']) == a['sha512Hex'], 'SRI')
    C.require(ip in C.public_ips(list(ips)), 'unknown endpoint')
    conn = connection(ip, ips, context)
    try:
        conn.putrequest('GET', path, skip_host=True, skip_accept_encoding=True)
        for name, value in (('Host', C.HOST), ('Accept', 'application/octet-stream'),
                            ('Accept-Encoding', 'identity'), ('Connection', 'close'),
                            ('User-Agent', 'ak5597-artifact/1')):
            conn.putheader(name, value)
        conn.endheaders()
        response = conn.getresponse()
        n = length(response, budget.remaining)  # Reject response before creating an archive file.
        return stream(response, n, a['sha512Hex'], d, a['filename'], budget)
    finally:
        conn.close()


def expired(_signum, _frame):
    raise TimeoutError('acquisition deadline')


def limits():
    C.require(sys.version_info >= (3, 11) and sys.flags.isolated and sys.flags.no_site
              and sys.dont_write_bytecode, 'Python -I -S -B >=3.11 required')
    os.umask(0o077)
    for which, bound in ((resource.RLIMIT_CPU, 300), (resource.RLIMIT_AS, 512 * 1024 * 1024),
                         (resource.RLIMIT_FSIZE, C.ARCHIVE_MAX), (resource.RLIMIT_NOFILE, 64),
                         (resource.RLIMIT_CORE, 0)):
        _, hard = resource.getrlimit(which)
        value = bound if hard == resource.RLIM_INFINITY else min(bound, hard)
        resource.setrlimit(which, (value, value))
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(JOB_SECONDS)


def main():
    C.require(len(sys.argv) == 2 and sys.argv[1] in ('--probe', '--acquire'), 'explicit worker mode')
    if sys.argv[1] == '--acquire':
        with acquisition_http_policy():
            return work('--acquire')
    return work('--probe')


def work(mode):
    limits()
    deadline = time.monotonic() + JOB_SECONDS
    C.require(os.getcwd() == '/out', 'worker invocation')
    tool_raw = C.read_file('/inputs/toolchain.json')
    tool = C.toolchain(C.decode(tool_raw))
    # Every installed mount is an owner-frozen file, never discovered by this worker.
    for row in tool['mounts']:
        size, digest, _ = C.hash_file(row['target'], C.TOOLCHAIN_MAX)
        C.require(size == row['bytes'] and digest == row['sha256'], 'mounted input changed')
    manifest = C.manifest(C.read_file('/inputs/acquisition.json'))
    seed = manifest['seededTooling'][0]
    seed_fd = C.open_file('/inputs/npm-12.0.2.tgz', C.ARCHIVE_MAX)
    d = C.open_dir('/out')
    try:
        seed_stat = C.regular(seed_fd, C.ARCHIVE_MAX)
        raw = C.read_fd(seed_fd, C.ARCHIVE_MAX)
        C.require(len(raw) == seed['bytes'] and hashlib.sha256(raw).hexdigest() == seed['sha256']
                  and hashlib.sha512(raw).hexdigest() == C.sri(seed['integrity']), 'seed integrity')
        del raw
        C.owned_dir(d)
        C.require(not C.directory_names(d), 'output must be new/empty')
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_verify_locations(cafile='/inputs/ca.pem')  # No default trust paths/environment.
        context.set_alpn_protocols(['http/1.1'])
        if mode == '--probe':
            os.close(seed_fd); seed_fd = None
            P.probe(tool, tool_raw, d, context.cert_store_stats())
            return  # No seed copy, archive creation, socket construction or fetch.
        budget = Budget()
        os.lseek(seed_fd, 0, os.SEEK_SET)
        with os.fdopen(os.dup(seed_fd), 'rb') as body:
            rows = [stream(body, seed['bytes'], C.sri(seed['integrity']), d, seed['file'],
                           budget, seed['sha256'])]
        C.require(C.identity(seed_stat) == C.identity(os.fstat(seed_fd)), 'seed changed')
        ips = C.public_ips(tool['publicIPv4'])
        for i, a in enumerate(manifest['networkArchives']):
            seconds = int(deadline - time.monotonic())
            C.require(seconds > 0, 'job deadline')
            signal.alarm(min(ARCHIVE_SECONDS, seconds))
            rows.append(fetch(a, ips[i % len(ips)], ips, context, d, budget))
        signal.alarm(max(1, int(deadline - time.monotonic())))
        C.put(d, 'worker-receipt.json', C.encode(dict(schema='ak5597-artifact-worker.v1',
              status='complete', inputSha256=C.INPUT_SHA256, bodyBytes=budget.used, archives=rows,
              qualification=False)))
        os.fsync(d)
        print('{"schema":"ak5597-artifact-status.v1","status":"complete"}', flush=True)
    finally:
        if seed_fd is not None:
            os.close(seed_fd)
        os.close(d)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        # No traceback, URL, headers, environment, TLS diagnostics or downloaded bytes.
        os.write(2, b'{"schema":"ak5597-artifact-status.v1","status":"failed"}\n')
        sys.exit(1)
