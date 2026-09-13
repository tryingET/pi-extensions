"""Trusted provision-only namespace PID1. No Node is started before verified observations."""
import hashlib
import os
import re
import signal
import stat
import sys
import time
from types import SimpleNamespace


GUARD_CODES = {
    'PID1 topology': 'OBS_PID1',
    'worker numeric identity': 'OBS_NUMERIC_IDENTITY',
    'worker interpreter/environment': 'OBS_INTERPRETER_ENV',
    'private namespaces': 'OBS_NAMESPACES',
    'capabilities': 'OBS_CAPABILITIES',
    'unexpected inherited capability': 'OBS_FDS',
    'proc observation bound': 'OBS_PROC_BOUND',
    'mount propagation/duplicates': 'OBS_MOUNT_PROPAGATION_DUPLICATES',
    'unexpected mount surface': 'OBS_MOUNT_SET',
    'mount writable surface': 'OBS_MOUNT_MODE',
    'private proc/bounded work tmpfs': 'OBS_PROC_WORK_TMPFS',
    'worker input pin': 'OBS_INPUT_PIN',
    'mount table syntax': 'OBS_MOUNT_PARSE',
    'mount schema': 'OBS_MOUNT_SCHEMA',
    'observed mount mode': 'OBS_MOUNT_MODE',
    'observed tmpfs/proc': 'OBS_PROC_WORK_TMPFS',
    'protective proc flags/type': 'OBS_PROC_FLAGS',
    'protective proc root': 'OBS_PROC_ROOT',
    'protective proc device syntax': 'OBS_PROC_DEVICE_SYNTAX',
    'protective proc device mismatch': 'OBS_PROC_DEVICE_MISMATCH',
    'unexpected proc filesystem': 'OBS_UNEXPECTED_PROC',
    **{'limit ' + name: 'LIMIT_' + name for name in ('NOFILE', 'AS', 'CPU', 'CORE', 'FSIZE')},
}


def failure_code(exc, phase):
    """Fixed diagnostics only: never serialize exception text, paths or ambient data."""
    phase = phase if phase in ('LIMITS', 'OBSERVATIONS', 'OTHER') else 'OTHER'
    if type(exc) is ValueError:
        if (len(exc.args) == 4 and type(exc.args[0]) is str and exc.args[0] == 'mount surface' and
                all(type(v) is int for v in exc.args[1:]) and 0 <= exc.args[1] <= 15 and
                all(0 <= v <= 999 for v in exc.args[2:])):
            return 'ValueError:OBS_MOUNT_SET:P%d:U%d:M%d' % exc.args[1:]
        code = None
        if len(exc.args) == 1 and type(exc.args[0]) is str:
            code = GUARD_CODES.get(exc.args[0])
        return 'ValueError:' + (code or phase + '_UNCLASSIFIED')
    return type(exc).__name__  # Retain prior classification for non-ValueError failures.


def bootstrap():
    # This path is a sealed, readonly mount in an already isolated root.
    fd = os.open('/code/artifact-contract.py', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        raw = os.read(fd, 50 * 1024 + 1)
        if hashlib.sha256(raw).hexdigest() != '336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543':
            raise ValueError('base source pin')
    finally:
        os.close(fd)
    def load(name, raw, extra):
        scope = dict(__name__='reviewed_' + name, __file__='/code/' + name, **extra)
        exec(compile(raw, scope['__file__'], 'exec'), scope)
        return SimpleNamespace(**scope)
    C = load('artifact-contract.py', raw, {})
    data_raw = C.read_file('/inputs/provision.json')
    obj = C.decode(data_raw)
    modules = {}
    for name in ('artifact-provision-contract.py', 'artifact-provision-tree.py', 'artifact-provision-lifetime.py'):
        raw = C.read_file('/code/' + name, 50 * 1024)
        C.require(hashlib.sha256(raw).hexdigest() == obj['codeSha256'][name], 'worker source hash')
        modules[name] = raw
    P = load('artifact-provision-contract.py', modules['artifact-provision-contract.py'], {'C': C})
    P.data(obj)
    T = load('artifact-provision-tree.py', modules['artifact-provision-tree.py'], {'C': C})
    L = load('artifact-provision-lifetime.py', modules['artifact-provision-lifetime.py'], {'C': C, 'P': P})
    return C, P, T, L, obj, data_raw


def proc_read(path, maximum=128 * 1024):
    raw, remaining = bytearray(), maximum + 1
    with open(path, 'rb', buffering=0) as stream:
        while remaining > 0:
            chunk = stream.read(remaining)
            if not isinstance(chunk, bytes):
                raise ValueError('proc observation bound')
            if not chunk:
                return bytes(raw)
            raw.extend(chunk)
            remaining -= len(chunk)
        raise ValueError('proc observation bound')


def parse_mounts(C, raw):
    """Parse already-bounded guest mountinfo; expose root/device only for proc rows."""
    mounts = {}
    for line in raw.decode().splitlines():
        parts = line.split(' - ')
        C.require(len(parts) == 2, 'mount table syntax')
        fields, tail = parts[0].split(), parts[1].split()
        C.require(len(fields) >= 6 and len(tail) >= 3, 'mount table syntax')
        point, options = fields[4], fields[5].split(',')
        C.require(point not in mounts and not any(x.startswith(('shared:', 'master:', 'propagate_from:'))
                                                  for x in fields[6:]), 'mount propagation/duplicates')
        row = dict(fs=tail[0], options=options, super=tail[2].split(','))
        if row['fs'] == 'proc':
            row.update(procRoot=fields[3], procDevice=fields[2])
        mounts[point] = row
    return mounts


def observations(C, P, data):
    C.require(os.getpid() == 1 and os.getppid() == 0 and os.getcwd() == '/work', 'PID1 topology')
    identity = dict(uid=os.getuid(), euid=os.geteuid(), gid=os.getgid(), egid=os.getegid())
    C.require(all(type(value) is int and value == 1000 for value in identity.values()),
              'worker numeric identity')
    C.require(sys.version_info >= (3, 11) and sys.flags.isolated and sys.flags.no_site and
              sys.dont_write_bytecode and dict(os.environ) == P.ENV, 'worker interpreter/environment')
    ns = P.namespaces()
    C.require(all(ns[k] != data['parentNamespaces'][k] for k in P.NS), 'private namespaces')
    fields = dict(line.split(':', 1) for line in proc_read('/proc/self/status', 16384).decode().splitlines()
                  if ':' in line)
    caps = {k: fields[k].strip() for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')}
    C.require(all(int(v, 16) == 0 for v in caps.values()), 'capabilities')
    fds = {}
    for leaf in os.listdir('/proc/self/fd'):
        try:
            fds[leaf] = os.readlink('/proc/self/fd/' + leaf)
        except FileNotFoundError:
            pass  # listdir's own already-closed descriptor only; exact live set checked below.
    C.require(set(fds) == {'0', '1', '2'} and fds['0'] == '/dev/null' and
              all(re.fullmatch(r'pipe:\[[0-9]+\]', fds[k]) for k in ('1', '2')), 'unexpected inherited capability')
    mounts = parse_mounts(C, proc_read('/proc/self/mountinfo', 512 * 1024))
    P.validate_mounts(mounts, data['rows'])
    inputs = []
    for row in data['rows']:
        size, digest, _ = C.hash_file(row['target'], P.INPUT_MAX)
        C.require((size, digest) == (row['bytes'], row['sha256']), 'worker input pin')
        inputs.append(dict(target=row['target'], bytes=size, sha256=digest, role=row['role']))
    return dict(pid=1, ppid=0, namespaces=ns, capabilities=caps, fds=fds, mounts=mounts, inputs=inputs,
                environment=P.ENV, beforeNode=True, **identity)


def roots(C, P):
    result = {}
    for role in ('package', 'lock'):
        name = P.ROOTS[role][0].rsplit('/', 1)[-1]
        try:
            _, digest, _ = C.hash_file('/work/install/' + name, C.JSON_MAX)
            result[name] = dict(sha256=digest, unchanged=digest == P.ROOTS[role][1])
        except (OSError, ValueError):
            result[name] = dict(sha256=None, unchanged=False)
    return result


def run():
    C, P, T, L, data, data_raw = bootstrap()
    latch = L.Latch()
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM):
        signal.signal(sig, latch.record)
    # Catch SIGCHLD normally; Python's default leaves waitable zombies for our PID1 loop.
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    signal.alarm(L.WALL)
    deadline = time.monotonic() + L.WALL
    os.umask(0o077)
    out = C.open_dir('/out')
    C.owned_dir(out); C.require(not C.directory_names(out), 'unused output')
    os.close(out); out = None
    binding = dict(reviewSha256=data['reviewSha256'], inventorySha256=data['inventorySha256'],
                   projectionSha256=P.sha(data_raw), codeSha256=data['codeSha256'],
                   inputSha256=C.INPUT_SHA256, proposedSha256={k: P.ROOTS[k][1] for k in ('package', 'lock')})
    rows, error, tree, diagnostic, settlement = [], None, None, None, None
    root = log = None
    budget = {'remaining': P.LOG_MAX - 64 * 1024}
    phase = 'OTHER'
    try:
        # Normalize any interpreter locale startup additions; Node receives only this map.
        os.environ.clear(); os.environ.update(P.ENV)
        phase = 'LIMITS'
        L.limits()
        phase = 'OBSERVATIONS'
        diagnostic = observations(C, P, data)
        phase = 'OTHER'
        P.validate_observation(diagnostic, data)
        out = C.open_dir('/out')
        C.owned_dir(out); C.require(not C.directory_names(out), 'unused output')
        C.put(out, 'pre-node.json', C.encode(dict(schema='ak5597-offline-provision-pre-node.v2',
                                               binding=binding, observation=diagnostic)), C.JSON_MAX)
        C.require(not latch.pending, 'cancelled before preparation')
        manifest = P.verify_archives(data['rows'], lambda r: C.read_file(r['target'], P.INPUT_MAX))
        for name in T.TOP:
            os.mkdir('/work/' + name, 0o700)
        root = C.open_dir('/work')
        os.mkdir('/work/tooling/npm', 0o700)
        npm = C.open_dir('/work/tooling/npm')
        try:
            T.extract_seed(C.read_file('/inputs/npm-12.0.2.tgz', C.ARCHIVE_MAX), npm)
        finally:
            os.close(npm)
        install = C.open_dir('/work/install')
        config = C.open_dir('/work/config')
        try:
            for role in ('package', 'lock'):
                source = P.ROOTS[role][0]
                C.put(install, source.rsplit('/', 1)[-1], C.read_file(source), C.JSON_MAX)
            for name in ('user.npmrc', 'global.npmrc'):
                C.put(config, name, b'')
        finally:
            os.close(install); os.close(config)
        logdir = C.open_dir('/work/logs')
        try:
            log = C.create(logdir, 'commands.log')
        finally:
            os.close(logdir)
        sequence(C, P, manifest, latch,
                 lambda args, seconds: L.command(args, seconds, latch, deadline, log, budget), rows)
    except BaseException as exc:
        error = failure_code(exc, phase)
    finally:
        if out is None:
            out = C.open_dir('/out')
        if log is not None:
            os.close(log)
        final = finalize(C, rows, error, latch, L.settle, lambda: roots(C, P),
                         (lambda: T.export_tree(root, out)) if root is not None else None)
        settlement, root_hashes, tree = final['settlement'], final['rootFiles'], final['tree']
        error, good = final['error'], final['good']
        if root is not None:
            os.close(root)
        receipt = dict(schema='ak5597-offline-provision-worker.v1', binding=binding, good=good,
                       error=error, cancelled=latch.pending, settlement=settlement, rootFiles=root_hashes,
                       tree=tree, commands=rows, commandLogBytes=P.LOG_MAX - 64 * 1024 - budget['remaining'],
                       preNodeSha256=P.sha(C.encode(dict(schema='ak5597-offline-provision-pre-node.v2',
                                                        binding=binding, observation=diagnostic))) if diagnostic else None,
                       qualification=False)
        C.put(out, 'worker.json', C.encode(receipt), C.JSON_MAX)
        os.fsync(out); os.close(out)
    return 0 if good else 1


def command_good(row):
    return (row['reason'] == 'exited' and row['returncode'] == 0 and row['directStatusObserved']
            and row['settlement']['allChildrenSettled'] and not row['settlement']['termination'])


def sequence(C, P, manifest, latch, execute, rows):
    """The actual provision-only sequence; injectable executor, no alternate argv source."""
    for args, seconds in P.commands(manifest):
        C.require(not latch.pending, 'cancelled before command')
        row = execute(args, seconds); rows.append(row)
        C.require(command_good(row), 'npm command failed or settlement unknown')
        C.require(not latch.pending, 'cancelled after command')


def finalize(C, rows, error, latch, settle, read_roots, export_tree):
    """Actual finalization order. Preservation is allowed after settled command failure."""
    settlement = settle(error is not None or latch.pending)
    root_hashes = read_roots()
    if not all(r['unchanged'] for r in root_hashes.values()):
        error = error or 'RootBytesChangedOrMissing'
    tree = None
    if settlement['allChildrenSettled'] and export_tree is not None:
        try:
            tree = export_tree()
        except BaseException as exc:
            error = error or ('Tree' + type(exc).__name__)
    good = (error is None and not latch.pending and settlement['allChildrenSettled'] and
            not settlement['termination'] and tree is not None and len(rows) == 166 and
            all(command_good(row) for row in rows))
    return dict(settlement=settlement, rootFiles=root_hashes, tree=tree, error=error, good=good)


if __name__ == '__main__':
    try:
        sys.exit(run())
    except BaseException as exc:
        if isinstance(exc, SystemExit):
            raise
        os.write(2, b'provision worker refused/incomplete\n')
        sys.exit(1)
