"""SOURCE-ONLY AK5597 offline provisioning driver. Invocation is NOT execution authority.
Future admitted invocation: pinned Python -I -S -B THIS_FILE REVIEW_PATH REVIEW_SHA256.
"""
import fcntl
import hashlib
import os
import re
import resource
import signal
import stat
import sys
import time
from types import SimpleNamespace

BASE = {'artifact-contract.py': '336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543',
        'artifact-driver.py': 'c4dfc47f1bd97a0bba736097dd839e1745b68713be731adfae54efe9dc11fc82'}


def initial_read(path):
    if type(path) is not str or not path.startswith('/') or any(p in ('', '.', '..') for p in path[1:].split('/')):
        raise ValueError('bootstrap path')
    parts = path[1:].split('/')
    d = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in parts[:-1]:
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
            os.close(d); d = nxt
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=d)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= 50 * 1024:
                raise ValueError('bootstrap regular bound')
            raw = bytearray()
            while block := os.read(fd, 50 * 1024 + 1 - len(raw)):
                raw.extend(block)
                if len(raw) > 50 * 1024:
                    raise ValueError('bootstrap bound')
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            if len(raw) != before.st_size or identity(before) != identity(os.fstat(fd)):
                raise ValueError('bootstrap changed')
            return bytes(raw)
        finally:
            os.close(fd)
    finally:
        os.close(d)


def bootstrap(path, expected):
    directory = os.path.dirname(os.path.abspath(__file__))
    def load(name, raw, extra):
        scope = dict(__name__='reviewed_' + name, __file__=directory + '/' + name, **extra)
        exec(compile(raw, scope['__file__'], 'exec'), scope)
        return SimpleNamespace(**scope)
    raw = initial_read(directory + '/artifact-contract.py')
    if hashlib.sha256(raw).hexdigest() != BASE['artifact-contract.py']:
        raise ValueError('base contract pin')
    C = load('artifact-contract.py', raw, {})
    C.digest(expected)
    raw_review = C.read_file(path)
    C.require(hashlib.sha256(raw_review).hexdigest() == expected, 'review pin')
    obj = C.decode(raw_review)
    names = tuple(BASE) + ('artifact-provision-contract.py', 'artifact-provision-tree.py',
                          'artifact-provision-lifetime.py', 'artifact-provision-worker.py', 'artifact-provision.py')
    C.require(type(obj) is dict and type(obj.get('codeSha256')) is dict and
              set(obj['codeSha256']) == set(names), 'bootstrap source set')
    sources = {}
    for name in names:
        C.digest(obj['codeSha256'][name])
        raw = C.read_file(directory + '/' + name, 50 * 1024)
        C.require(hashlib.sha256(raw).hexdigest() == obj['codeSha256'][name] and
                  (name not in BASE or obj['codeSha256'][name] == BASE[name]), 'source pin')
        sources[name] = raw
    D = load('artifact-driver.py', sources['artifact-driver.py'], {})
    P = load('artifact-provision-contract.py', sources['artifact-provision-contract.py'], {'C': C})
    P.review(obj)
    T = load('artifact-provision-tree.py', sources['artifact-provision-tree.py'], {'C': C})
    L = load('artifact-provision-lifetime.py', sources['artifact-provision-lifetime.py'], {'C': C, 'P': P})
    return C, D, P, T, L, obj, sources, directory


def unused(C, fd, name):
    try:
        os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    raise ValueError('destination already exists')


def preflight(prepared, review_hash, fds, cancel):
    C, D, P, T, L, review, sources, directory = prepared
    host_setup(C, review, fds)
    C.require(sys.version_info >= (3, 11) and sys.flags.isolated and sys.flags.no_site and
              sys.dont_write_bytecode and not any(k.startswith(('LD_', 'PYTHON', 'NODE_', 'NPM_', 'npm_'))
                                                 for k in os.environ), 'launcher interpreter/environment')
    C.require(C.hash_file(os.path.realpath(sys.executable), P.INPUT_MAX)[1] == review['driverPythonSha256'], 'interpreter pin')
    bwrap = C.open_file('/usr/bin/bwrap', 16 * 1024 ** 2); fds.append(bwrap)
    bs = os.fstat(bwrap)
    C.require(bs.st_uid == 0 and bs.st_mode & 0o7022 == 0 and bs.st_mode & 0o111 and
              P.sha(C.read_fd(bwrap, 16 * 1024 ** 2)) == review['bwrapSha256'], 'installed bwrap pin')
    raw = C.read_file(review['inventoryPath'])
    C.require(P.sha(raw) == review['inventorySha256'], 'inventory pin')
    rows = P.inventory(C.decode(raw), review['codeSha256'])
    C.require(resource.getrlimit(resource.RLIMIT_NOFILE)[0] >= len(rows) + 64, 'host FD budget')
    # Control attribution and both private parent identities are checked before sealing/creation.
    C.require(os.environ.get('AI_SOCIETY_TASK_ID') == '5597' and
              os.environ.get('AI_SOCIETY_HEAVY_JOB_LABEL') == P.LABEL, 'heavy attribution')
    root = D.directory_identity(C, review['scratchRunsRoot']); fds.append(root)
    run = C.canonical_path(os.environ.get('AI_SOCIETY_SCRATCH_RUN'))
    C.require(os.path.dirname(run) == review['scratchRunsRoot']['path'] and
              re.fullmatch(r'run-[0-9]+-[0-9a-f]{16}', os.path.basename(run)), 'fresh run path')
    run_fd = C.open_dir(run); fds.append(run_fd); rs = C.owned_dir(run_fd)
    work = C.open_dir(run + '/work'); fds.append(work); C.owned_dir(work)
    C.require(os.environ.get('TMPDIR') == run + '/work/tmp', 'heavy TMPDIR')
    tmp = C.open_dir(run + '/work/tmp'); fds.append(tmp)
    C.owned_dir(tmp); C.require(not C.directory_names(tmp), 'fresh unused TMPDIR')
    control_observation = control_snapshot(C, D, P, run, rs)
    export = D.directory_identity(C, review['exportParent']); fds.append(export)
    parent = review['exportParent']['path']; runs = review['scratchRunsRoot']['path']
    overlaps = lambda a, b: a == b or a.startswith(b + '/') or b.startswith(a + '/')
    C.require(parent.startswith('/home/tryinget/.local/state/pi-quests/tmp/') and
              not overlaps(parent, runs), 'private export outside owner runs')
    unused(C, export, review['exportName']); unused(C, tmp, 'provision-out')
    C.require(all(not overlaps(r['source'], parent) and not overlaps(r['source'], run) for r in rows), 'source/output overlap')
    mounted = []
    for row in rows:
        cancel.check()
        if row['role'].startswith('code:'):
            name = row['role'][5:]
            C.require(row['source'] == directory + '/' + name and row['bytes'] == len(sources[name]), 'code source path/size')
        fd = D.sealed(C, row['source'], row['sha256'], row['bytes']); fds.append(fd)
        mounted.append((row, fd))
    by_target = {r['target']: fd for r, fd in mounted}
    manifest = P.verify_archives(rows, lambda r: C.read_fd(by_target[r['target']], P.INPUT_MAX))
    projected = P.projection(rows, review_hash, review['inventorySha256'], review['codeSha256'], P.namespaces())
    projection_raw = P.private_projection(projected, rows, parent)
    config = os.memfd_create('ak5597-provision-data', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING); fds.append(config)
    C.write_all(config, projection_raw)
    fcntl.fcntl(config, fcntl.F_ADD_SEALS, fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE)
    for fd in [config] + list(by_target.values()):
        os.lseek(fd, 0, os.SEEK_SET)
    return mounted, config, projected, projection_raw, manifest, tmp, export, bwrap, control_observation


def read_at(C, directory, name, maximum):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory)
    try:
        C.regular(fd, maximum, owned=True)
        return C.read_fd(fd, maximum)
    finally:
        os.close(fd)


def copy_at(C, source, target, name, maximum):
    src = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=source)
    dst = None
    try:
        before = C.regular(src, maximum, owned=True)
        dst = C.create(target, name + '.copy-partial')
        used = 0
        while block := os.read(src, C.CHUNK):
            used += len(block); C.require(used <= maximum, 'export copy limit'); C.write_all(dst, block)
        C.require(used == before.st_size and C.identity(before) == C.identity(os.fstat(src)), 'export copy changed')
        os.fsync(dst)
        os.rename(name + '.copy-partial', name, src_dir_fd=target, dst_dir_fd=target)
        os.fsync(target)
    finally:
        if dst is not None:
            os.close(dst)
        os.close(src)


def export_result(prepared, output, export, supervision, projected, projection_raw, manifest, cancel):
    C, D, P, T, L, review, sources, directory = prepared
    C.require(supervision['helperReaped'] and supervision['reason'] == 'exited', 'helper lifetime unknown')
    pre_raw = read_at(C, output, 'pre-node.json', C.JSON_MAX)
    worker_raw = read_at(C, output, 'worker.json', C.JSON_MAX)
    worker = P.verify_receipts(C.decode(worker_raw), C.decode(pre_raw), pre_raw, projected, projection_raw, manifest)
    C.require(supervision['returncode'] == (0 if worker['good'] else 1), 'helper/worker status mismatch')
    names = set(C.directory_names(output))
    tar_name = 'provisioned-tree.tar' if worker['tree'] else 'provisioned-tree.tar.partial'
    C.require(names <= {'pre-node.json', 'worker.json', tar_name} and
              (worker['tree'] is None or tar_name in names), 'unexpected output files')
    # After normal helper/PID1 all-child settlement, cancellation still permits bounded
    # preservation, but never a success status. No retention promise about the owner run.
    dest = C.new_dir(export, review['exportName'])
    try:
        C.put(dest, 'incomplete.json', C.encode(dict(schema='ak5597-offline-provision-export-start.v1',
                                                   complete=False, reviewSha256=projected['reviewSha256'])))
        for name in ('pre-node.json', 'worker.json'):
            copy_at(C, output, dest, name, C.JSON_MAX)
        tar_summary = None
        if tar_name in names:
            copy_at(C, output, dest, tar_name, T.TAR_MAX)
        if worker['tree']:
            fd = os.open(tar_name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=dest)
            inv = C.create(dest, 'inventory.jsonl.partial')
            try:
                tar_summary = T.validate_tar(fd, inv, worker['rootFiles'])
                C.require(tar_summary == worker['tree'], 'host/worker tar inventory mismatch')
            finally:
                os.close(fd); os.close(inv)
            os.rename('inventory.jsonl.partial', 'inventory.jsonl', src_dir_fd=dest, dst_dir_fd=dest)
        good = worker['good'] and tar_summary is not None and not cancel.pending and not supervision['cancelled']
        receipt = dict(schema='ak5597-offline-provision-export.v1', complete=True, good=good,
                       workerGood=worker['good'], treeComplete=tar_summary is not None,
                       binding=worker['binding'], workerSha256=P.sha(worker_raw), tree=tar_summary,
                       supervision=supervision, cancelled=cancel.pending, qualification=False,
                       acceptancePending=True)
        C.put(dest, 'export.json', C.encode(receipt), C.JSON_MAX); os.fsync(dest)
        return good
    finally:
        # Any exception leaves incomplete.json and exclusive partial copies in place.
        os.close(dest)


def operation(prepared, review_hash, cancel):
    C, D, P, T, L, review, sources, directory = prepared
    fds = []
    start = time.monotonic()
    try:
        mounted, config, projected, projection_raw, manifest, tmp, export, bwrap, control_observation = preflight(prepared, review_hash, fds, cancel)
        cancel.check()
        C.require(time.monotonic() < start + L.WALL, 'preflight deadman')
        C.require(C.identity(os.fstat(bwrap)) == C.identity(os.stat('/usr/bin/bwrap', follow_symlinks=False)), 'bwrap changed')
        os.umask(0o077)
        output = C.new_dir(tmp, 'provision-out'); fds.append(output)
        args = P.argv(mounted, config, output)
        host_setup(C, review, fds)
        args = wrapped(args)
        supervision = L.helper(args, [fd for _, fd in mounted] + [config, output], os.environ['TMPDIR'],
                               cancel, start + L.WALL)
        host_setup(C, review, fds)
        supervision.update(argvSha256=P.sha(C.encode(args)), controlObservation=control_observation,
                           authorizationReference=review['authorizationReference'], predecessorSha256=P.FREEZE)
        return export_result(prepared, output, export, supervision, projected, projection_raw, manifest, cancel)
    finally:
        for fd in reversed(fds):
            os.close(fd)


def main():
    if len(sys.argv) != 3:
        raise ValueError('require exact review path and owner-reviewed digest')
    prepared = bootstrap(sys.argv[1], sys.argv[2])
    with prepared[1].Cancellation() as cancel:
        # Latch remains installed through helper settlement, preservation and FD closure.
        old_alarm = signal.signal(signal.SIGALRM, cancel.record)
        signal.alarm(prepared[4].WALL)
        try:
            good = operation(prepared, sys.argv[2], cancel)
            cancel.check()
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_alarm)
    return 0 if good and not cancel.pending else 1


def control_snapshot(C, D, P, run, rs, wrapper_pid=None, child_pid=None):
    """One coherent runtime observation, never a predeclared pin or authority.
    A later admitted -> running transition is allowed; no reopen/retry at export.
    """
    wrapper_pid = os.getppid() if wrapper_pid is None else wrapper_pid
    child_pid = os.getpid() if child_pid is None else child_pid
    fd = C.open_file(run + '/control/manifest.json', C.JSON_MAX)
    try:
        def identity(s):
            return dict(dev=s.st_dev, ino=s.st_ino, bytes=s.st_size, mtimeNs=s.st_mtime_ns,
                        ctimeNs=s.st_ctime_ns, uid=s.st_uid, mode=s.st_mode, nlink=s.st_nlink)
        before = identity(C.regular(fd, C.JSON_MAX))
        raw = C.read_fd(fd, C.JSON_MAX)  # One bounded read operation; also checks stability.
        after = identity(C.regular(fd, C.JSON_MAX))
        C.require(before == after and len(raw) == before['bytes'], 'control changed during read')
        control = C.decode(raw); D.require_d154(C, control)
        C.require(control.get('schema') == 'ai-society-heavy-job/v1' and
                  control.get('wrapper_pid') == wrapper_pid and control.get('task_id') == '5597' and
                  control.get('label') == P.LABEL and control.get('scratch_path') == run and
                  control.get('run_id') == os.path.basename(run) and control.get('root_dev') == rs.st_dev and
                  control.get('root_ino') == rs.st_ino and control.get('state') in ('admitted', 'running') and
                  control.get('child_pid') in (None, child_pid), 'control attribution')
        return dict(schema='ak5597-offline-provision-control-observation.v1', sha256=P.sha(raw),
                    identity=before, state=control['state'], authority=False)
    finally:
        os.close(fd)


# Exact additional HOST-only metadata pins. No new guest mounts or executable search path.
HOST_PINS = [{'path': '/usr/bin/unshare', 'resolved': '/usr/bin/unshare', 'bytes': 43408, 'sha256': '3793bf769672a0ef1d82e4a7012f209d06312ee3851f384051fe15d610015415', 'identity': [37, 53218076, 43408, 1781614488000000000, 1786267023033914876], 'chain': {'/': {'dev': 37, 'ino': 256, 'mode': 16749, 'uid': 0, 'gid': 0, 'link': None}, '/usr': {'dev': 37, 'ino': 663, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/usr/bin': {'dev': 37, 'ino': 708, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/usr/bin/unshare': {'dev': 37, 'ino': 53218076, 'mode': 33261, 'uid': 0, 'gid': 0, 'link': None}}}, {'path': '/lib64/ld-linux-x86-64.so.2', 'resolved': '/usr/lib/ld-linux-x86-64.so.2', 'bytes': 263152, 'sha256': 'd011113b7054c641c8ca064f58bcc23804fd2654a3dff2444dad06ddeda61bfb', 'identity': [37, 54451039, 263152, 1786390742000000000, 1786954012275149548], 'chain': {'/': {'dev': 37, 'ino': 256, 'mode': 16749, 'uid': 0, 'gid': 0, 'link': None}, '/lib64': {'dev': 37, 'ino': 700, 'mode': 41471, 'uid': 0, 'gid': 0, 'link': 'usr/lib'}, '/lib64/ld-linux-x86-64.so.2': {'dev': 37, 'ino': 54451039, 'mode': 33261, 'uid': 0, 'gid': 0, 'link': None}, '/usr': {'dev': 37, 'ino': 663, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/usr/lib': {'dev': 37, 'ino': 710, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/usr/lib/ld-linux-x86-64.so.2': {'dev': 37, 'ino': 54451039, 'mode': 33261, 'uid': 0, 'gid': 0, 'link': None}}}, {'path': '/usr/lib/libc.so.6', 'resolved': '/usr/lib/libc.so.6', 'bytes': 2215072, 'sha256': 'e221b10fee9ee4776d8f0f1701253bc06817f7a4dbe6c5292487277d0bf8ffff', 'identity': [37, 54451048, 2215072, 1786390742000000000, 1786954012288149746], 'chain': {'/': {'dev': 37, 'ino': 256, 'mode': 16749, 'uid': 0, 'gid': 0, 'link': None}, '/usr': {'dev': 37, 'ino': 663, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/usr/lib': {'dev': 37, 'ino': 710, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/usr/lib/libc.so.6': {'dev': 37, 'ino': 54451048, 'mode': 33261, 'uid': 0, 'gid': 0, 'link': None}}}, {'path': '/etc/ld.so.cache', 'resolved': '/etc/ld.so.cache', 'bytes': 138819, 'sha256': '0c30c7df89d6a2921b37a4e8d0de837391727aca633f423049385a45109d4751', 'identity': [37, 59326662, 138819, 1789051767480015012, 1789051767643017674], 'chain': {'/': {'dev': 37, 'ino': 256, 'mode': 16749, 'uid': 0, 'gid': 0, 'link': None}, '/etc': {'dev': 37, 'ino': 265, 'mode': 16877, 'uid': 0, 'gid': 0, 'link': None}, '/etc/ld.so.cache': {'dev': 37, 'ino': 59326662, 'mode': 33188, 'uid': 0, 'gid': 0, 'link': None}}}]


def wrapped(args):
    if not args or args[0] != '/usr/bin/bwrap':
        raise ValueError('exact bwrap helper required')
    return ['/usr/bin/unshare', '--user', '--map-current-user', '--mount',
            '--propagation', 'private', '--'] + args


def host_setup(C, review, fds):
    C.require(os.getuid() == os.geteuid() == 1000 and os.getgid() == os.getegid() == 1000,
              'numeric launcher identity')
    C.require(not os.path.lexists('/etc/ld.so.preload'), 'unexpected system preload')
    for pin in HOST_PINS:
        C.require(os.path.realpath(pin['path']) == pin['resolved'], 'host alias resolution')
        for path, expected in pin['chain'].items():
            s = os.lstat(path)
            row = dict(dev=s.st_dev, ino=s.st_ino, mode=s.st_mode, uid=s.st_uid, gid=s.st_gid,
                       link=os.readlink(path) if stat.S_ISLNK(s.st_mode) else None)
            C.require(row == expected and s.st_uid == 0 and
                      (stat.S_ISLNK(s.st_mode) or not s.st_mode & 0o022), 'trusted host path')
        fd = C.open_file(pin['resolved'], 16 * 1024 ** 2); fds.append(fd)
        s = os.fstat(fd)
        C.require(s.st_uid == 0 and not s.st_mode & 0o7022 and s.st_size == pin['bytes'] and
                  list(C.identity(s)) == pin['identity'] and
                  hashlib.sha256(C.read_fd(fd, 16 * 1024 ** 2)).hexdigest() == pin['sha256'] and
                  C.identity(s) == C.identity(os.stat(pin['resolved'], follow_symlinks=False)),
                  'host ELF/cache pin/identity')


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        os.write(2, b'provision refused/incomplete; no automatic cleanup or retry\n')
        sys.exit(1)
