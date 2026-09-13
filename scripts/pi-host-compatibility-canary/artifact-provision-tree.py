"""Trusted seed extraction and inert deterministic tree transport; never host extraction."""
import gzip
import hashlib
import io
import os
import stat
import tarfile

TAR_MAX = 1024 ** 3
MEMBER_MAX = 64 * 1024 ** 2
INVENTORY_MAX = 32 * 1024 ** 2
ENTRY_MAX = 100000
TOP = ('cache', 'config', 'home', 'install', 'logs', 'tmp', 'tooling')


def path(name):
    C.require(type(name) is str and 0 < len(name.encode('utf-8')) <= 1024 and
              '\\' not in name and all(32 <= ord(c) != 127 for c in name), 'tar path')
    parts = name.split('/')
    C.require(len(parts) <= 64 and all(p not in ('', '.', '..') for p in parts), 'tar alias/traversal')
    return parts


def member(m):
    name = m.name[:-1] if m.isdir() and m.name.endswith('/') else m.name
    path(name)
    C.require(m.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE) and
              not m.linkname and not m.issparse() and not m.mode & ~0o777 and
              m.devmajor == m.devminor == 0, 'tar link/special/privileged')
    C.integer(m.size, 0, MEMBER_MAX)
    C.require(not m.isdir() or m.size == 0, 'directory data')
    C.require(set(m.pax_headers) <= {'path'}, 'unexpected PAX')
    if m.pax_headers:
        raw = m.pax_headers['path']
        C.require(type(raw) is str, 'unexpected PAX')
        # tarfile strips directory serialization slashes; validate the raw PAX
        # spelling too, removing at most one slash, never arbitrary separators.
        path(raw[:-1] if m.isdir() and raw.endswith('/') else raw)
        C.require(raw == m.name or (m.isdir() and raw == m.name + '/'), 'unexpected PAX')
    return name


def seed_plan(raw, expanded_max=128 * 1024 ** 2, entries_max=20000):
    """Bound decompression before parsing; no extractall, no collision exception for seed."""
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
        expanded = gz.read(expanded_max + 1)
    C.require(len(expanded) <= expanded_max, 'seed expansion bound')
    tf = tarfile.open(fileobj=io.BytesIO(expanded), mode='r:')
    plan, seen, total = [], {}, 0
    try:
        for m in tf:
            C.require(len(plan) < entries_max, 'seed entry bound')
            name = member(m)
            parts = path(name)
            C.require(parts[0] == 'package' and (len(parts) > 1 or m.isdir()), 'seed root')
            C.require(name not in seen, 'seed normalized collision')
            for i in range(1, len(parts)):
                ancestor = '/'.join(parts[:i])
                C.require(seen.get(ancestor) != 'file', 'seed file ancestor')
            if m.isfile():
                C.require(not any(n.startswith(name + '/') for n in seen), 'seed ancestor replacement')
            seen[name] = 'dir' if m.isdir() else 'file'
            total += m.size
            C.require(total <= expanded_max, 'seed logical bound')
            plan.append((m, parts[1:]))
        C.require('package/bin/npm-cli.js' in seen and seen['package/bin/npm-cli.js'] == 'file', 'seed CLI')
        return tf, plan
    except BaseException:
        tf.close()
        raise


def child_dir(parent, name, create=False):
    path(name); C.require('/' not in name, 'directory component')
    if create:
        try:
            os.mkdir(name, 0o700, dir_fd=parent)
        except FileExistsError:
            pass
    return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)


def extract_seed(raw, root):
    tf, plan = seed_plan(raw)
    directories = []
    try:
        for m, parts in plan:
            if not parts:
                continue
            d = os.dup(root)
            try:
                for part in parts[:-1]:
                    nxt = child_dir(d, part, True); os.close(d); d = nxt
                if m.isdir():
                    fd = child_dir(d, parts[-1], True)
                    os.close(fd)
                    directories.append((parts, m.mode))
                else:
                    fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW |
                                 os.O_CLOEXEC, 0o600, dir_fd=d)
                    try:
                        stream = tf.extractfile(m)
                        used = 0
                        with stream:
                            while block := stream.read(C.CHUNK):
                                used += len(block); C.require(used <= m.size, 'seed file bound')
                                C.write_all(fd, block)
                        C.require(used == m.size, 'seed truncated')
                        os.fchmod(fd, m.mode)
                    finally:
                        os.close(fd)
            finally:
                os.close(d)
        # Apply directory modes after children, retaining explicit executable/read modes.
        for parts, mode in sorted(directories, key=lambda x: len(x[0]), reverse=True):
            d = os.dup(root)
            try:
                for part in parts:
                    nxt = child_dir(d, part); os.close(d); d = nxt
                os.fchmod(d, mode)
            finally:
                os.close(d)
    finally:
        tf.close()


class BoundedWriter:
    def __init__(self, fd, maximum=TAR_MAX):
        self.fd, self.maximum, self.used = fd, maximum, 0
        self.hash = hashlib.sha256()

    def write(self, raw):
        C.require(self.used + len(raw) <= self.maximum, 'tar size bound')
        C.write_all(self.fd, raw)
        self.used += len(raw); self.hash.update(raw)
        return len(raw)

    def tell(self):
        return self.used

    def flush(self):
        os.fsync(self.fd)


class HashReader:
    def __init__(self, stream):
        self.stream, self.hash, self.used = stream, hashlib.sha256(), 0

    def read(self, n):
        block = self.stream.read(n)
        self.hash.update(block); self.used += len(block)
        return block


def inventory_row(name, mode, directory, size, digest):
    return dict(path=name, mode=mode, type='directory' if directory else 'file', bytes=size, sha256=digest)


def directory_names(fd):
    """Fresh description avoids stale directory cursors; npm modes need not be0700."""
    before = os.fstat(fd)
    fresh = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
    try:
        C.require(C.identity(before) == C.identity(os.fstat(fresh)), 'directory changed before listing')
        names = os.listdir(fresh)
        C.require(C.identity(before) == C.identity(os.fstat(fresh)) == C.identity(os.fstat(fd)),
                  'directory changed during listing')
        return names
    finally:
        os.close(fresh)


def export_tree(root, out, maximum=TAR_MAX):
    """Quiescent PID1-only caller. Failure keeps .partial; never silently skip a member."""
    fd = C.create(out, 'provisioned-tree.tar.partial')
    sink = BoundedWriter(fd, maximum)
    count, inv_bytes, inv_hash = 0, 0, hashlib.sha256()
    tf = tarfile.open(fileobj=sink, mode='w', format=tarfile.PAX_FORMAT)
    try:
        C.require(set(directory_names(root)) == set(TOP), 'unexpected /work roots')
        def walk(d, prefix=''):
            nonlocal count, inv_bytes
            before_dir = os.fstat(d)
            for leaf in sorted(directory_names(d)):
                name = prefix + leaf
                path(name)
                count += 1; C.require(count <= ENTRY_MAX, 'tree entries')
                s = os.stat(leaf, dir_fd=d, follow_symlinks=False)
                directory = stat.S_ISDIR(s.st_mode)
                C.require((directory or stat.S_ISREG(s.st_mode)) and not s.st_mode & 0o7000
                          and (directory or s.st_nlink == 1), 'tree link/special/privileged')
                size = 0 if directory else C.integer(s.st_size, 0, MEMBER_MAX)
                flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
                opened = os.open(leaf, flags | (os.O_DIRECTORY if directory else 0), dir_fd=d)
                try:
                    C.require(C.identity(s) == C.identity(os.fstat(opened)), 'tree open race')
                    m = tarfile.TarInfo(name)
                    m.mode, m.size = stat.S_IMODE(s.st_mode), size
                    m.type = tarfile.DIRTYPE if directory else tarfile.REGTYPE
                    m.uid = m.gid = m.mtime = 0; m.uname = m.gname = ''
                    if directory:
                        tf.addfile(m); digest = None
                    else:
                        with os.fdopen(os.dup(opened), 'rb') as stream:
                            reader = HashReader(stream); tf.addfile(m, reader)
                        C.require(reader.used == size, 'tree short read')
                        digest = reader.hash.hexdigest()
                    line = C.encode(inventory_row(name, m.mode, directory, size, digest))
                    inv_bytes += len(line); C.require(inv_bytes <= INVENTORY_MAX, 'inventory bound')
                    inv_hash.update(line)
                    if directory:
                        walk(opened, name + '/')
                    C.require(C.identity(s) == C.identity(os.fstat(opened)), 'tree changed')
                finally:
                    os.close(opened)
            C.require(C.identity(before_dir) == C.identity(os.fstat(d)), 'tree directory changed')
        walk(root)
        tf.close(); sink.flush()
        result = dict(complete=True, bytes=sink.used, sha256=sink.hash.hexdigest(),
                      entries=count, inventoryBytes=inv_bytes, inventorySha256=inv_hash.hexdigest())
        os.rename('provisioned-tree.tar.partial', 'provisioned-tree.tar', src_dir_fd=out, dst_dir_fd=out)
        os.fsync(out)
        return result
    finally:
        # Do not synthesize a valid terminator after a traversal/write failure.
        os.close(fd)


def validate_tar(fd, inventory_fd, root_files=None):
    """Host streams a bounded inert tar; writes inventory only, never materializes members."""
    before = C.regular(fd, TAR_MAX, owned=True)
    C.require(before.st_size % 512 == 0, 'tar alignment')
    os.lseek(fd, 0, os.SEEK_SET)
    seen, count, used, digest, last = {}, 0, 0, hashlib.sha256(), 0
    previous, roots = (), {}
    with os.fdopen(os.dup(fd), 'rb') as stream:
        with tarfile.open(fileobj=stream, mode='r:') as tf:
            for m in tf:
                name = member(m); parts = path(name)
                C.require(tuple(parts) > previous, 'deterministic traversal order')
                previous = tuple(parts)
                C.require(parts[0] in TOP and name not in seen and
                          m.uid == m.gid == m.mtime == 0 and m.uname == m.gname == '', 'export metadata')
                C.require(all(seen.get('/'.join(parts[:i])) == 'dir' for i in range(1, len(parts))), 'ordered ancestors')
                seen[name] = 'dir' if m.isdir() else 'file'
                count += 1; C.require(count <= ENTRY_MAX, 'export entry count')
                h, n = hashlib.sha256(), 0
                if m.isfile():
                    with tf.extractfile(m) as content:
                        while block := content.read(C.CHUNK):
                            n += len(block); C.require(n <= m.size, 'export payload bound'); h.update(block)
                    C.require(n == m.size, 'truncated payload')
                if name in ('install/package.json', 'install/package-lock.json'):
                    C.require(m.isfile(), 'root file type')
                    roots[name.split('/')[1]] = h.hexdigest()
                line = C.encode(inventory_row(name, m.mode, m.isdir(), m.size, None if m.isdir() else h.hexdigest()))
                used += len(line); C.require(used <= INVENTORY_MAX, 'export inventory bound')
                C.write_all(inventory_fd, line); digest.update(line)
                last = m.offset_data + ((m.size + 511) // 512) * 512
        stream.seek(last)
        tail = stream.read(10241)
        C.require(1024 <= len(tail) <= 10240 and not any(tail) and last + len(tail) == before.st_size,
                  'tar terminator/trailing data')
    C.require({n for n in seen if '/' not in n} == set(TOP) and
              C.identity(before) == C.identity(os.fstat(fd)), 'tar root/stability')
    if root_files is not None:
        C.require(all(roots.get(name) == row['sha256'] for name, row in root_files.items()), 'host root byte verification')
    os.fsync(inventory_fd)
    os.lseek(fd, 0, os.SEEK_SET)
    h, hashed = hashlib.sha256(), 0
    while block := os.read(fd, C.CHUNK):
        hashed += len(block); C.require(hashed <= before.st_size, 'tar hash bound')
        h.update(block)
    C.require(hashed == before.st_size and C.identity(before) == C.identity(os.fstat(fd)), 'tar hash stability')
    return dict(complete=True, bytes=before.st_size, sha256=h.hexdigest(), entries=count,
                inventoryBytes=used, inventorySha256=digest.hexdigest())
