"""Trusted readiness observations + pure verifier, NOT hostile-kernel/authorization proof.
No socket API, archive copying, subprocess, cleanup or namespace creation here.
C is supplied only by the reviewed driver/worker (or inert test loader).
"""
import errno
import hashlib
import os
import re
import sys

NAMESPACES = ('user', 'pid', 'mnt', 'ipc', 'uts', 'net')
WRITE_NAME = 'probe-write.bin'
WRITE_BYTES = b'ak5597-readiness-write-v1\n'
DENIED = (errno.EROFS, errno.EACCES, errno.EPERM)


def namespace_ids():
    # Deliberate procfs magic-link introspection, never a source-file resolver.
    result = {}
    for name in NAMESPACES:
        s = os.stat('/proc/self/ns/' + name)
        result[name] = [s.st_dev, s.st_ino]
    return result


def mount_table():
    with open('/proc/self/mountinfo', 'rb') as f:
        raw = f.read(C.JSON_MAX + 1)
    C.require(len(raw) <= C.JSON_MAX, 'mountinfo bound')
    mounts = {}
    for line in raw.decode('utf-8').splitlines():
        left, right = line.split(' - ', 1)
        fields = left.split()
        target = re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), fields[4])
        C.require(target not in mounts, 'stacked probe mounts')
        mounts[target] = (fields[5].split(','), right.split()[0])
    return mounts


def readonly(path, mounts):
    return ('ro' in mounts.get(path, ([], ''))[0]
            and bool(os.statvfs(path).f_flag & os.ST_RDONLY))


def denied_write_open(path):
    # Never O_TRUNC/O_CREAT; even an unexpectedly accepted open writes NO input bytes.
    try:
        fd = os.open(path, os.O_WRONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
    except OSError as e:
        return e.errno
    else:
        os.close(fd)
        return 0


def observed_fds():
    d = os.open('/proc/self/fd', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        names = os.listdir(d)
        C.require(len(names) <= 64 and all(n.isdecimal() for n in names), 'FD bound')
        live = []
        for n in names:
            fd = int(n)
            if fd == d:
                continue
            try:
                os.fstat(fd)  # listdir may have reported its now-closed readdir duplicate.
            except OSError as e:
                if e.errno != errno.EBADF:
                    raise
            else:
                live.append(fd)  # Never hide an arbitrary extra LIVE descriptor.
        return sorted(live)
    finally:
        os.close(d)


def executable_hash():
    # /proc/self/exe identifies the executing ELF, not just the mounted pathname.
    with open('/proc/self/exe', 'rb') as f:
        h, used = hashlib.sha256(), 0
        while block := f.read(C.CHUNK):
            used += len(block)
            C.require(used <= C.TOOLCHAIN_MAX, 'executing Python bound')
            h.update(block)
    return h.hexdigest()


def probe(tool, tool_raw, output, ca_stats):
    mounts = mount_table()
    rows = []
    for item in tool['mounts'] + [dict(target='/inputs/toolchain.json')]:
        path = item['target']
        size, digest, _ = C.hash_file(path, C.TOOLCHAIN_MAX)
        rows.append(dict(target=path, bytes=size, sha256=digest,
                         readonly=readonly(path, mounts), deniedWriteOpen=denied_write_open(path)))
    C.put(output, WRITE_NAME, WRITE_BYTES)
    os.fsync(output)
    size, digest, _ = C.hash_file('/out/' + WRITE_NAME, len(WRITE_BYTES))
    receipt = dict(schema='ak5597-artifact-probe.v1', status='observed', qualification=False,
                   acquisition=False, networkAttempted=False, inputSha256=C.INPUT_SHA256,
                   toolchainSha256=hashlib.sha256(tool_raw).hexdigest(), mounts=rows,
                   namespaces=namespace_ids(), fds=observed_fds(), allowedFds=[0, 1, 2, output],
                   python=dict(executable=sys.executable, sha256=executable_hash(),
                               version=list(sys.version_info[:3]), versionText=sys.version,
                               prefix=sys.prefix, basePrefix=sys.base_prefix,
                               isolated=bool(sys.flags.isolated), noSite=bool(sys.flags.no_site),
                               noBytecode=sys.dont_write_bytecode), ca=ca_stats,
                   rootReadonly=readonly('/', mounts),
                   privateProc=mounts.get('/proc', ([], ''))[1] == 'proc' and readonly('/proc', mounts),
                   outWritable=('rw' in mounts.get('/out', ([], ''))[0]
                                and not os.statvfs('/out').f_flag & os.ST_RDONLY),
                   outputWrite=dict(file=WRITE_NAME, bytes=size, sha256=digest, fileFsync=True, dirFsync=True))
    C.put(output, 'probe-receipt.json', C.encode(receipt))
    os.fsync(output)
    print('{"schema":"ak5597-artifact-probe-status.v1","status":"observed","acquisition":false}', flush=True)


def verify(receipt, supervision, tool, tool_sha, tool_bytes, parent_ns):
    """Pure strict comparison. Self-reported observations require a trusted frozen worker."""
    C.toolchain(tool)  # Includes the narrowly permitted, hash-bound empty stdlib initializer.
    C.integer(tool_bytes, 1, C.JSON_MAX); C.digest(tool_sha)  # Configuration is never an empty initializer.
    C.require(supervision.get('childCreated') is True and supervision.get('childReaped') is True
              and type(supervision.get('returncode')) is int and supervision['returncode'] == 0
              and supervision.get('reason') == 'exited' and supervision.get('cancelled', False) is False,
              'probe child failed/not reaped/cancelled')
    C.keys(receipt, 'schema status qualification acquisition networkAttempted inputSha256 toolchainSha256 '
           'mounts namespaces fds allowedFds python ca rootReadonly privateProc outWritable outputWrite')
    C.require(receipt['schema'] == 'ak5597-artifact-probe.v1' and receipt['status'] == 'observed'
              and all(receipt[k] is False for k in ('qualification', 'acquisition', 'networkAttempted'))
              and receipt['inputSha256'] == C.INPUT_SHA256 and receipt['toolchainSha256'] == tool_sha,
              'probe identity')
    C.keys(receipt['namespaces'], ' '.join(NAMESPACES)); C.keys(parent_ns, ' '.join(NAMESPACES))
    for name in NAMESPACES:
        for value in (receipt['namespaces'][name], parent_ns[name]):
            C.require(type(value) is list and len(value) == 2, 'namespace identity')
            C.integer(value[0], 0, 2**64 - 1); C.integer(value[1], 1, 2**64 - 1)
        C.require(receipt['namespaces'][name] != parent_ns[name], 'unchanged namespace')
    allowed = receipt['allowedFds']
    C.require(type(allowed) is list and len(allowed) == 4 and allowed[:3] == [0, 1, 2], 'allowed FDs')
    for n in allowed:
        C.integer(n, 0, 63)
    C.require(allowed[3] >= 3 and type(receipt['fds']) is list
              and all(type(n) is int for n in receipt['fds']) and receipt['fds'] == allowed, 'leaked FDs')
    python = receipt['python']
    C.keys(python, 'executable sha256 version versionText prefix basePrefix isolated noSite noBytecode')
    frozen_python = next(row for row in tool['mounts'] if row['role'] == 'python')
    C.require(python['sha256'] == frozen_python['sha256']
              and python['executable'] == frozen_python['target']
              and python['prefix'] == python['basePrefix'] == '/runtime'
              and all(python[k] is True for k in ('isolated', 'noSite', 'noBytecode')), 'actual Python')
    v = python['version']
    C.require(type(v) is list and len(v) == 3, 'Python version')
    for n in v:
        C.integer(n, 0, 999)
    C.require(v[0] == 3 and v[1] >= 11 and type(python['versionText']) is str
              and 0 < len(python['versionText']) <= 1024, 'Python version')
    C.require(all(row['target'].startswith('/runtime/lib/python3.%d/' % v[1])
                  for row in tool['mounts'] if row['role'] == 'stdlib'), 'stdlib version')
    C.keys(receipt['ca'], 'x509 x509_ca crl')
    for value in receipt['ca'].values():
        C.integer(value, 0, 10000)
    C.require(receipt['ca']['x509_ca'] > 0, 'CA not loaded')
    C.require(all(receipt[k] is True for k in ('rootReadonly', 'privateProc', 'outWritable')), 'mount posture')
    expected = tool['mounts'] + [dict(target='/inputs/toolchain.json', bytes=tool_bytes, sha256=tool_sha)]
    rows = receipt['mounts']
    C.require(type(rows) is list and len(rows) == len(expected), 'probe mount count')
    for row, wanted in zip(rows, expected):
        C.keys(row, 'target bytes sha256 readonly deniedWriteOpen')
        C.integer(row['bytes'], 0 if wanted['bytes'] == 0 else 1, C.TOOLCHAIN_MAX)
        C.require(all(row[k] == wanted[k] for k in ('target', 'bytes', 'sha256'))
                  and row['readonly'] is True and type(row['deniedWriteOpen']) is int
                  and row['deniedWriteOpen'] in DENIED, 'probe mount/input/write check')
    C.keys(receipt['outputWrite'], 'file bytes sha256 fileFsync dirFsync')
    C.require(C.encode(receipt['outputWrite']) == C.encode(dict(file=WRITE_NAME, bytes=len(WRITE_BYTES),
              sha256=hashlib.sha256(WRITE_BYTES).hexdigest(), fileFsync=True, dirFsync=True)), 'out write proof')
    return True


def verify_output(E, source, supervision, tool, tool_sha, tool_bytes, parent_ns):
    C.require(set(C.directory_names(source)) == {WRITE_NAME, 'probe-receipt.json'}, 'probe output entries')
    fd = E.open_source(source, 'probe-receipt.json', C.RECEIPT_MAX)
    try:
        raw = C.read_fd(fd, C.RECEIPT_MAX)
    finally:
        os.close(fd)
    verify(C.decode(raw), supervision, tool, tool_sha, tool_bytes, parent_ns)
    E.hash_source(source, dict(file=WRITE_NAME, bytes=len(WRITE_BYTES),
                  sha256=hashlib.sha256(WRITE_BYTES).hexdigest(), sha512=hashlib.sha512(WRITE_BYTES).hexdigest()))
    return dict(file='probe-receipt.json', bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                sha512=hashlib.sha512(raw).hexdigest())
