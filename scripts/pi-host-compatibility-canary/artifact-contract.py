"""AK5597 inert acquisition data/FD primitives; SOURCE PROPOSAL, not authority."""
import base64
import hashlib
import ipaddress
import json
import os
import re
import stat

INPUT_SHA256 = '1c411d9d51d7ba083ebdd19c35d8c55fc8c3d77ff492071e50bd8eed567f7ce8'
LABEL = 'ak5597-artifact-acquisition'
HOST = 'registry.npmjs.org'
CHUNK = 256 * 1024
ARCHIVE_MAX = 64 * 1024 * 1024
TOTAL_MAX = 512 * 1024 * 1024
JSON_MAX = 1024 * 1024
RECEIPT_MAX = 128 * 1024
TOOLCHAIN_MAX = 256 * 1024 * 1024
CODE = ('artifact-contract.py', 'artifact-worker.py', 'artifact-export.py', 'artifact-driver.py', 'artifact-probe.py')


def require(ok, message='invalid acquisition input'):
    if not ok:
        raise ValueError(message)


def keys(obj, expected):
    require(type(obj) is dict and set(obj) == set(expected.split()), 'schema keys')


def integer(n, low, high):
    require(type(n) is int and low <= n <= high, 'integer bound')
    return n


def digest(value, length=64):
    require(type(value) is str and re.fullmatch('[0-9a-f]{%d}' % length, value), 'digest')
    return value


def pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, 'duplicate JSON key')
        result[key] = value
    return result


def decode(raw):
    require(len(raw) <= JSON_MAX, 'JSON bound')
    return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False, 'nonfinite JSON'))


def encode(obj):
    return (json.dumps(obj, sort_keys=True, separators=(',', ':')) + '\n').encode()


def canonical_path(path):
    require(type(path) is str and path.startswith('/') and path != '/', 'absolute file path')
    require(all(x not in ('', '.', '..') for x in path[1:].split('/')), 'path components')
    require(not any(ord(c) < 32 or ord(c) == 127 for c in path), 'path controls')
    return path


def leaf(name):
    require(type(name) is str and re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,127}', name)
            and name not in ('.', '..'), 'basename')
    return name


def open_dir(path):
    canonical_path(path)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in path[1:].split('/'):
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                          dir_fd=fd)
            os.close(fd)
            fd = nxt
        return fd
    except BaseException:
        os.close(fd)
        raise


def regular(fd, maximum, owned=False):
    s = os.fstat(fd)
    require(stat.S_ISREG(s.st_mode) and s.st_nlink in (0, 1) and 0 <= s.st_size <= maximum,
            'regular file bound/link count')
    if owned:
        require(s.st_nlink == 1 and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o600, 'file owner/mode')
    return s


def identity(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def open_file(path, maximum):
    canonical_path(path)
    parent, name = path.rsplit('/', 1)
    d = open_dir(parent) if parent else os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=d)
    finally:
        os.close(d)
    try:
        regular(fd, maximum)
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_fd(fd, maximum):
    before = regular(fd, maximum)
    os.lseek(fd, 0, os.SEEK_SET)
    raw = bytearray()
    while True:
        block = os.read(fd, min(CHUNK, maximum + 1 - len(raw)))
        if not block:
            break
        raw.extend(block)
        require(len(raw) <= maximum, 'read bound')
    require(identity(before) == identity(os.fstat(fd)) and len(raw) == before.st_size,
            'source changed')
    return bytes(raw)


def read_file(path, maximum=JSON_MAX):
    fd = open_file(path, maximum)
    try:
        return read_fd(fd, maximum)
    finally:
        os.close(fd)


def write_all(fd, raw):
    view = memoryview(raw)
    while view:
        n = os.write(fd, view)
        require(n > 0, 'short write')
        view = view[n:]


def create(d, name):
    return os.open(leaf(name), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                   os.O_CLOEXEC, 0o600, dir_fd=d)


def put(d, name, raw, maximum=RECEIPT_MAX):
    require(len(raw) <= maximum, 'receipt bound')
    fd = create(d, name)
    try:
        write_all(fd, raw)
        os.fsync(fd)
        regular(fd, maximum, owned=True)
    finally:
        os.close(fd)


def owned_dir(fd):
    s = os.fstat(fd)
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
            and stat.S_IMODE(s.st_mode) == 0o700, 'directory owner/mode')
    return s


def directory_names(fd):
    """Fresh open-file description: retained dirfd enumeration can cache EOF on Btrfs."""
    before = owned_dir(fd)
    fresh = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
    try:
        opened = owned_dir(fresh)
        require(identity(before) == identity(opened), 'directory changed before listing')
        names = os.listdir(fresh)
        require(identity(opened) == identity(os.fstat(fresh)) == identity(os.fstat(fd)),
                'directory changed during listing')
        return names
    finally:
        os.close(fresh)


def new_dir(parent, name):
    os.mkdir(leaf(name), 0o700, dir_fd=parent)
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
    owned_dir(fd)
    require(not directory_names(fd), 'new directory not empty')
    return fd


def sri(value):
    require(type(value) is str and re.fullmatch(r'sha512-[A-Za-z0-9+/]{86}==', value), 'SRI')
    raw = base64.b64decode(value[7:], validate=True)
    require(len(raw) == 64 and base64.b64encode(raw).decode() == value[7:], 'canonical SRI')
    return raw.hex()


def url(value, name, version):
    require(type(name) is str and re.fullmatch(r'(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*', name), 'package name')
    require(type(version) is str and re.fullmatch(r'[0-9][A-Za-z0-9.+-]*', version), 'version')
    expected = f'https://{HOST}/{name}/-/{name.rsplit("/", 1)[-1]}-{version}.tgz'
    require(value == expected and len(value) <= 1024, 'noncanonical registry URL')
    return value[len('https://' + HOST):]


def public_ips(values):
    require(type(values) is list and 1 <= len(values) <= 32, 'frozen IP list missing')
    require(all(type(v) is str for v in values) and len(set(values)) == len(values), 'IP duplicates')
    for value in values:
        ip = ipaddress.IPv4Address(value)
        require(str(ip) == value and ip.is_global and not (ip.is_private or ip.is_link_local
                or ip.is_loopback or ip.is_multicast or ip.is_reserved or ip.is_unspecified), 'nonpublic IP')
    return tuple(values)


def manifest(raw, expected=INPUT_SHA256):
    require(hashlib.sha256(raw).hexdigest() == INPUT_SHA256 == expected, 'exact manifest hash')
    return manifest_schema(decode(raw))


def manifest_schema(obj):
    keys(obj, 'artifactIdentityStatus counts networkArchives noQualificationClaim predecessor purpose '
         'remainingGates schema sdkManifestSha256 seededTooling sourceLockSha256 task')
    require(obj['schema'] == 'ak5597-archive-acquisition-inputs.v1' and type(obj['task']) is int
            and obj['task'] == 5597 and obj['noQualificationClaim'] is True
            and obj['purpose'] == 'PROPOSED_INERT_ACQUISITION_INPUTS_NOT_LAUNCH_AUTHORITY', 'manifest purpose')
    require(obj['counts'] == dict(networkArchives=165, sdkLocations=167, seededTooling=1,
                                 totalArchiveInputs=166), 'counts')
    for k in ('sdkManifestSha256', 'sourceLockSha256'):
        digest(obj[k])
    for k in ('artifactIdentityStatus', 'predecessor'):
        require(type(obj[k]) is str and 0 < len(obj[k]) <= 4096, 'annotation')
    require(type(obj['remainingGates']) is list and all(type(x) is str for x in obj['remainingGates']), 'gates')
    archives = obj['networkArchives']
    require(type(archives) is list and len(archives) == 165, 'archive count')
    urls, filenames, locations = set(), set(), set()
    for a in archives:
        keys(a, 'filename id integrity locations name sha512Hex url version')
        url(a['url'], a['name'], a['version'])
        require(sri(a['integrity']) == digest(a['sha512Hex'], 128), 'SRI mismatch')
        require(type(a['id']) is str and re.fullmatch('sha256-[0-9a-f]{64}', a['id']), 'archive id')
        require(a['filename'] == a['id'] + '.tgz', 'archive filename')
        leaf(a['filename'])
        require(a['url'] not in urls and a['filename'] not in filenames, 'duplicate archive')
        urls.add(a['url']); filenames.add(a['filename'])
        require(type(a['locations']) is list and len(a['locations']) > 0, 'locations')
        for loc in a['locations']:
            require(type(loc) is str and loc.startswith('node_modules/')
                    and all(x not in ('', '.', '..') for x in loc.split('/'))
                    and loc not in locations, 'duplicate/invalid location')
            locations.add(loc)
    require(len(locations) == 167, 'location count')
    require(type(obj['seededTooling']) is list and len(obj['seededTooling']) == 1, 'seed count')
    seed = obj['seededTooling'][0]
    keys(seed, 'bytes contentAudit file integrity name role sha256 signatureScope sourceEvidence url version')
    require((seed['name'], seed['version'], seed['file'], seed['role'], seed['bytes'], seed['sha256']) ==
            ('npm', '12.0.2', 'npm-12.0.2.tgz', 'tooling_archive', 3045132,
             '5dbb86c71d07a1957f2e90734092dd6a58bdcd9ebc2d8d41ca1c6e6a21d364e1'), 'exact seed')
    url(seed['url'], seed['name'], seed['version']); sri(seed['integrity'])
    for k in ('contentAudit', 'signatureScope', 'sourceEvidence'):
        require(type(seed[k]) is str, 'seed annotation')
    return obj


def toolchain(obj):
    keys(obj, 'schema task label publicIPv4 mounts')
    require(obj['schema'] == 'ak5597-artifact-toolchain.v1' and type(obj['task']) is int
            and obj['task'] == 5597 and obj['label'] == LABEL, 'toolchain identity')
    public_ips(obj['publicIPv4'])
    rows = obj['mounts']
    require(type(rows) is list and 9 <= len(rows) <= 256, 'frozen mounts missing')
    required = {'python': '/runtime/bin/python3', 'ca': '/inputs/ca.pem',
                'manifest': '/inputs/acquisition.json', 'seed': '/inputs/npm-12.0.2.tgz'}
    seen, roles, total = set(), {}, 0
    for row in rows:
        keys(row, 'source target sha256 bytes role')
        canonical_path(row['source']); canonical_path(row['target']); digest(row['sha256'])
        target, role = row['target'], row['role']
        # Real stdlib packages can have an empty initializer (e.g. urllib).
        minimum = 0 if role == 'stdlib' and target.endswith('/__init__.py') else 1
        total += integer(row['bytes'], minimum, TOOLCHAIN_MAX)
        if row['bytes'] == 0:
            require(row['sha256'] == hashlib.sha256(b'').hexdigest(), 'empty initializer hash')
        require(len(target) <= 256, 'mount target bound')
        require(target not in seen and all(not target.startswith(t + '/') and not t.startswith(target + '/')
                                          for t in seen), 'overlapping mounts')
        seen.add(target); roles[role] = roles.get(role, 0) + 1
        if role in required:
            require(target == required[role], 'required mount target')
        elif role == 'code':
            require(target in ('/code/artifact-contract.py', '/code/artifact-worker.py', '/code/artifact-probe.py'), 'code mount')
        elif role == 'stdlib':
            require(re.fullmatch(r'/runtime/lib/python3\.[0-9]+/(?:[A-Za-z0-9_.+-]+/)*[A-Za-z0-9_.+-]+', target)
                    and ('/site-packages/' not in target) and ('/dist-packages/' not in target), 'stdlib target')
        elif role == 'library':
            require(re.fullmatch(r'/(?:lib|lib64|usr/lib|runtime/lib)/(?:[A-Za-z0-9_.+-]+/)*[A-Za-z0-9_.+-]+', target)
                    and '.so' in target.rsplit('/', 1)[-1]
                    and not any(p in ('site-packages', 'dist-packages') for p in target.split('/')),
                    'shared library target')
        else:
            require(False, 'unknown mount role')
    require(total <= TOOLCHAIN_MAX and all(roles.get(r) == 1 for r in required)
            and roles.get('code') == 3 and roles.get('stdlib', 0) > 0
            and roles.get('library', 0) > 0, 'incomplete toolchain')
    return obj


def hash_file(path, maximum):
    fd = open_file(path, maximum)
    try:
        before = regular(fd, maximum)
        h256, h512, used = hashlib.sha256(), hashlib.sha512(), 0
        while block := os.read(fd, CHUNK):
            used += len(block)
            require(used <= maximum, 'input hash bound')
            h256.update(block); h512.update(block)
        require(used == before.st_size and identity(before) == identity(os.fstat(fd)), 'input changed')
        return used, h256.hexdigest(), h512.hexdigest()
    finally:
        os.close(fd)
