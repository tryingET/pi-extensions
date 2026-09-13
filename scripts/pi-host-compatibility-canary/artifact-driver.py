"""AK5597 proposed heavy-job child: exact preflight, probe then optional acquisition, post-reap export.
Environment/JSON references are attribution, NOT authorization or kernel/mount proof.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import selectors
import signal
import stat
import subprocess
import sys
import time
from types import SimpleNamespace

LOG_MAX = 64 * 1024  # Combined stdout/stderr; contents discarded, only hashes/counts exported.
WALL_SECONDS = 1900


def bootstrap(path, expected):
    """Read-only before loading any reviewed sibling. Owner pins this driver's hash too."""
    def read(p, maximum):
        if not isinstance(p, str) or not p.startswith('/') or any(x in ('', '.', '..') for x in p[1:].split('/')):
            raise ValueError('bootstrap path')
        d = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
        try:
            parts = p[1:].split('/')
            for part in parts[:-1]:
                nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=d)
                os.close(d); d = nxt
            fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=d)
            try:
                before = os.fstat(fd)
                if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > maximum:
                    raise ValueError('bootstrap regular bound')
                raw = bytearray()
                while block := os.read(fd, min(262144, maximum + 1 - len(raw))):
                    raw.extend(block)
                    if len(raw) > maximum:
                        raise ValueError('bootstrap bound')
                after = os.fstat(fd)
                stable = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_nlink)
                if stable(before) != stable(after) or len(raw) != before.st_size:
                    raise ValueError('bootstrap changed')
                return bytes(raw)
            finally:
                os.close(fd)
        finally:
            os.close(d)
    if not re.fullmatch('[0-9a-f]{64}', expected):
        raise ValueError('review hash')
    raw = read(path, 1024 * 1024)
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('review hash')
    provisional = json.loads(raw)
    if type(provisional.get('mode')) is not str or provisional['mode'] not in ('probe', 'acquire', 'observe-helper'):
        raise ValueError('explicit launch mode required')
    directory = str(Path(__file__).absolute().parent)
    files = ('artifact-contract.py', 'artifact-worker.py', 'artifact-export.py', 'artifact-driver.py', 'artifact-probe.py')
    if provisional['mode'] == 'observe-helper':
        if provisional.get('schema') != 'ak5597-artifact-observation-review.v1':
            raise ValueError('observer schema')
        files += ('artifact-observation.py', 'artifact-observation-lineage.py', 'artifact-observation-supervisor.py')
    if set(provisional['codeSha256']) != set(files):
        raise ValueError('code set')
    sources = {}
    for name in files:
        data = read(directory + '/' + name, 50 * 1024)
        if hashlib.sha256(data).hexdigest() != provisional['codeSha256'][name]:
            raise ValueError('code hash')
        sources[name] = data
    def load(name, extra=None):
        scope = dict(__file__=directory + '/' + name, __name__='reviewed_' + name)
        scope.update(extra or {})
        exec(compile(sources[name], scope['__file__'], 'exec'), scope)
        return SimpleNamespace(**scope)
    contract = load('artifact-contract.py')
    exporter = load('artifact-export.py', {'C': contract})
    probe = load('artifact-probe.py', {'C': contract})
    if provisional['mode'] == 'observe-helper':
        lineage = load('artifact-observation-lineage.py')
        supervisor = load('artifact-observation-supervisor.py')
        observer = load('artifact-observation.py', {'C': contract, 'E': exporter, 'P': probe,
                                                   'L': lineage, 'S': supervisor})
        observer.review_projection(contract.decode(raw))
        probe.observation = observer
    return contract, exporter, probe, contract.decode(raw), sources, directory


def sealed(C, path, expected, size):
    """Snapshot a reviewed regular input into a sealed anonymous FD, hashing during copy."""
    source = C.open_file(path, C.TOOLCHAIN_MAX)
    result = None
    try:
        before = C.regular(source, C.TOOLCHAIN_MAX)
        C.require(before.st_size == size, 'frozen file size')
        result = os.memfd_create('ak5597-frozen', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        h, used = hashlib.sha256(), 0
        while block := os.read(source, min(C.CHUNK, size + 1 - used)):
            used += len(block)
            C.require(used <= size, 'frozen file grew')
            h.update(block); C.write_all(result, block)
        C.require(used == size and h.hexdigest() == expected
                  and C.identity(before) == C.identity(os.fstat(source)), 'frozen file changed')
        fcntl.fcntl(result, fcntl.F_ADD_SEALS, fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK |
                    fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE)
        os.lseek(result, 0, os.SEEK_SET)
        return result
    except BaseException:
        if result is not None:
            os.close(result)
        raise
    finally:
        os.close(source)


def directory_identity(C, row):
    C.keys(row, 'path dev ino')
    C.integer(row['dev'], 0, 2**64 - 1); C.integer(row['ino'], 1, 2**64 - 1)
    fd = C.open_dir(row['path'])
    try:
        s = C.owned_dir(fd)
        C.require((s.st_dev, s.st_ino) == (row['dev'], row['ino']), 'directory identity')
        return fd
    except BaseException:
        os.close(fd)
        raise


def require_d154(C, control):
    """Sanity only: cannot undo parent cleanup or authenticate the caller's approval.

    The caller MUST use the approved D154 wrapper path; no default-mode fallback.
    This pins the dispatch-reported old-manifest receipt, not workload authority.
    """
    value = control.get('retention_deferral')
    C.keys(value, 'schema mode owner_decision_id deferred_run_id deferred_root_dev '
           'deferred_root_ino deferred_manifest_sha256 admission_scan_scope protected_process_count')
    expected = dict(schema='ai-society-heavy-job-retention-deferral/v1',
                    mode='named-run-age-only', owner_decision_id='154',
                    deferred_run_id='run-1788137699-9655c994d9827ead',
                    deferred_manifest_sha256='3048a36f394c095946a69be97f41e225677711cb42170b71d4560beb92efaeba',
                    admission_scan_scope='readable-current-uid')
    C.require(all(value[k] == v and type(value[k]) is type(v) for k, v in expected.items()),
              'required D154 retention attribution')
    C.integer(value['deferred_root_dev'], 0, 2**64 - 1)
    C.integer(value['deferred_root_ino'], 1, 2**64 - 1)
    C.integer(value['protected_process_count'], 0, 2**64 - 1)  # Owner-defined disclosure, not global inactivity.


def preflight(C, review, sources, directory, fds):
    C.keys(review, 'schema task label mode authorizationReference codeSha256 driverPythonSha256 '
           'bwrapSha256 toolchainPath toolchainSha256 scratchRunsRoot exportParent exportName')
    launch_mode(review['mode'])
    C.require(review['schema'] == 'ak5597-artifact-launch-review.v2' and type(review['task']) is int
              and review['task'] == 5597 and review['label'] == C.LABEL, 'review identity')
    C.require(type(review['authorizationReference']) is str and 1 <= len(review['authorizationReference']) <= 256
              and not any(ord(x) < 32 for x in review['authorizationReference']), 'external authorization reference missing')
    # This reference must be independently checked by the owner; this parser cannot grant authority.
    C.require(sys.version_info >= (3, 11) and sys.flags.isolated and sys.flags.no_site
              and sys.dont_write_bytecode, 'Python -I -S -B >=3.11 required')
    C.require(not any(k.startswith(('LD_', 'PYTHON')) for k in os.environ), 'unsafe launcher environment')
    for value in review['codeSha256'].values():
        C.digest(value)
    for key in ('driverPythonSha256', 'bwrapSha256', 'toolchainSha256'):
        C.digest(review[key])
    python = C.read_file(os.path.realpath(sys.executable), C.TOOLCHAIN_MAX)
    C.require(hashlib.sha256(python).hexdigest() == review['driverPythonSha256'], 'driver interpreter hash')
    del python
    bwrap = C.open_file('/usr/bin/bwrap', 16 * 1024 * 1024); fds.append(bwrap)
    bs = os.fstat(bwrap)
    C.require(bs.st_uid == 0 and bs.st_mode & 0o6022 == 0 and bs.st_mode & 0o111
              and hashlib.sha256(C.read_fd(bwrap, 16 * 1024 * 1024)).hexdigest() == review['bwrapSha256'],
              'installed bwrap identity')
    raw = C.read_file(review['toolchainPath'])
    C.require(hashlib.sha256(raw).hexdigest() == review['toolchainSha256'], 'toolchain hash')
    tool = C.toolchain(C.decode(raw))
    C.require(resource.getrlimit(resource.RLIMIT_NOFILE)[0] >= len(tool['mounts']) + 64,
              'insufficient supervisor descriptor limit')
    # All inputs validated before disk creation or Popen; memfds are temporary memory only.
    mounted = []
    for row in tool['mounts']:
        if row['role'] == 'code':
            name = row['target'].rsplit('/', 1)[-1]
            C.require(row['source'] == directory + '/' + name
                      and row['sha256'] == review['codeSha256'][name]
                      and row['bytes'] == len(sources[name]), 'code projection')
        if row['role'] == 'manifest':
            C.require(row['sha256'] == C.INPUT_SHA256, 'manifest projection')
        fd = sealed(C, row['source'], row['sha256'], row['bytes']); fds.append(fd)
        mounted.append((row, fd))
    config_fd = sealed(C, review['toolchainPath'], review['toolchainSha256'], len(raw)); fds.append(config_fd)
    manifest_fd = next(fd for row, fd in mounted if row['role'] == 'manifest')
    manifest = C.manifest(C.read_fd(manifest_fd, C.JSON_MAX)); os.lseek(manifest_fd, 0, os.SEEK_SET)
    seed_fd = next(fd for row, fd in mounted if row['role'] == 'seed')
    seed = manifest['seededTooling'][0]
    seed_raw = C.read_fd(seed_fd, C.ARCHIVE_MAX); os.lseek(seed_fd, 0, os.SEEK_SET)
    C.require(len(seed_raw) == seed['bytes'] and hashlib.sha256(seed_raw).hexdigest() == seed['sha256']
              and hashlib.sha512(seed_raw).hexdigest() == C.sri(seed['integrity']), 'seed hash')
    del seed_raw
    C.require(os.environ.get('AI_SOCIETY_TASK_ID') == '5597'
              and os.environ.get('AI_SOCIETY_HEAVY_JOB_LABEL') == C.LABEL, 'heavy-job attribution')
    root = directory_identity(C, review['scratchRunsRoot']); fds.append(root)
    run = C.canonical_path(os.environ.get('AI_SOCIETY_SCRATCH_RUN'))
    C.require(os.path.dirname(run) == review['scratchRunsRoot']['path']
              and re.fullmatch(r'run-[0-9]+-[0-9a-f]{16}', os.path.basename(run)), 'new heavy run structure')
    run_fd = C.open_dir(run); fds.append(run_fd); C.owned_dir(run_fd)
    work_fd = C.open_dir(run + '/work'); fds.append(work_fd); C.owned_dir(work_fd)
    C.require(os.environ.get('TMPDIR') == run + '/work/tmp', 'heavy TMPDIR')
    tmp = C.open_dir(run + '/work/tmp'); fds.append(tmp); C.owned_dir(tmp)
    C.require(not C.directory_names(tmp), 'heavy TMPDIR must be new/empty')
    control = C.decode(C.read_file(run + '/control/manifest.json'))
    require_d154(C, control)
    rs = os.fstat(run_fd)
    C.require(control.get('schema') == 'ai-society-heavy-job/v1'
              and control.get('wrapper_pid') == os.getppid() and control.get('task_id') == '5597' and control.get('label') == C.LABEL
              and control.get('scratch_path') == run and control.get('run_id') == os.path.basename(run)
              and control.get('root_dev') == rs.st_dev and control.get('root_ino') == rs.st_ino
              and control.get('state') in ('admitted', 'running')
              and control.get('child_pid') in (None, os.getpid()), 'heavy manifest attribution')
    export = directory_identity(C, review['exportParent']); fds.append(export)
    parent = review['exportParent']['path']
    # Export only to an explicitly identified private scratch parent, never a canonical workspace.
    C.require(parent.startswith('/home/tryinget/.local/state/pi-quests/tmp/')
              and not parent.startswith(review['scratchRunsRoot']['path'] + '/')
              and parent != review['scratchRunsRoot']['path'], 'export scratch boundary')
    C.require(parent.encode() not in raw, 'export parent disclosed to worker')
    name = C.leaf(review['exportName'])
    C.require(name.startswith('ak5597-artifacts-'), 'export name')
    try:
        os.stat(name, dir_fd=export, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        C.require(False, 'export destination already exists')
    return tool, mounted, config_fd, manifest, tmp, export, bwrap


def launch_mode(mode):
    if type(mode) is not str or mode not in ('probe', 'acquire'):
        raise ValueError('explicit launch mode required')
    return mode


def argv_for(tool, mounted, config_fd, output, mode):
    launch_mode(mode)
    argv = ['/usr/bin/bwrap', '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
            '--unshare-net' if mode == 'probe' else '--share-net', '--new-session', '--die-with-parent', '--cap-drop', 'ALL',
            '--hostname', 'ak5597-artifacts', '--clearenv']
    if mode == 'probe':
        argv += ['--proc', '/proc', '--remount-ro', '/proc']
    for row, fd in mounted:
        # bwrap copies sealed bytes; no mutable host directory binds, no symlink aliases.
        argv += ['--perms', '0500' if row['role'] in ('python', 'library') else '0400',
                 '--ro-bind-data', str(fd), row['target']]
    # bind-fd consumes/closes the inherited host dirfd after mounting (bwrap 0.12).
    # A string /proc/self/fd bind leaves that capability open in the worker.
    argv += ['--perms', '0400', '--ro-bind-data', str(config_fd), '/inputs/toolchain.json',
             '--bind-fd', str(output), '/out', '--chdir', '/out',
             '--remount-ro', '/', '--', '/runtime/bin/python3', '-I', '-S', '-B', '/code/artifact-worker.py', '--' + mode]
    return argv


class Cancellation:
    """One nonraising latch for the whole operation, including reap/export/FD settlement.
    Checks cannot atomically prevent an effect already initiated before a signal arrives.
    """
    def __init__(self):
        self.pending, self.old = False, {}

    def record(self, _signum=None, _frame=None):
        self.pending = True

    def check(self):
        if self.pending:
            raise InterruptedError('driver cancelled')

    def __enter__(self):
        try:
            for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
                self.old[s] = signal.signal(s, self.record)
        except BaseException:
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, *_):
        # Restore only after the operation and its owned FD/child settlement have ended.
        for s, handler in self.old.items():
            signal.signal(s, handler)


def supervise(argv, inherited, helper_tmp, cancel):
    child, selector = None, selectors.DefaultSelector()
    counts = {'stdout': 0, 'stderr': 0}
    hashes = {key: hashlib.sha256() for key in counts}
    reason, status = 'launch-failed', None
    try:
        cancel.check()
        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, env={'TMPDIR': helper_tmp}, cwd='/', close_fds=True,
                                 pass_fds=tuple(inherited), start_new_session=True)
        reason = 'exited'
        for name in counts:
            pipe = getattr(child, name)
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
        end = time.monotonic() + WALL_SECONDS
        while selector.get_map() or child.poll() is None:
            if cancel.pending:
                reason = 'interrupted'; break
            if time.monotonic() >= end:
                reason = 'timeout'; break
            for key, _ in selector.select(timeout=0.25):
                block = os.read(key.fd, 4096)
                if not block:
                    selector.unregister(key.fileobj); continue
                counts[key.data] += len(block); hashes[key.data].update(block)
                if sum(counts.values()) > LOG_MAX:
                    reason = 'output-limit'; break
            if reason != 'exited':
                break
    except BaseException:
        reason = 'interrupted-or-supervisor-error' if child is not None else 'launch-failed'
    finally:
        # The driver-wide nonraising handler stays active during final poll/wait/close.
        if child is not None:
            if child.poll() is None:
                child.kill()  # Never killpg, pid lookup, process census or unrelated process.
            status = child.wait()
            child.stdout.close(); child.stderr.close()
        selector.close()
    cancelled = cancel.pending  # Coherent snapshot; later signals remain latched for phases/main.
    if cancelled and child is not None:
        reason = 'interrupted'
    return dict(schema='ak5597-artifact-supervisor.v1', childCreated=child is not None,
                childReaped=child is not None, returncode=status, reason=reason, cancelled=cancelled,
                outputCounts=counts, outputSha256={k: h.hexdigest() for k, h in hashes.items()},
                qualification=False)


def phases(mode, run, verify, export_probe, acquire, cancel):
    """Explicit sequencing seam for pure fakes; never fall back on a missing/failed probe."""
    launch_mode(mode)
    if cancel.pending:
        return False
    source, supervision = run('probe')  # run returns only after supervise has reaped.
    row = None
    try:
        cancel.check()
        row = verify(source, supervision)
        cancel.check()
        if type(row) is not dict:
            raise ValueError('missing verified receipt')
    except (OSError, ValueError, TypeError, KeyError, StopIteration):
        row = None
        supervision = dict(supervision, probeValidation='failed')
    exported = export_probe(source, supervision, row)
    if cancel.pending or row is None or not exported:
        return False
    if mode == 'probe':
        return True
    good = acquire()  # run() rechecks cancellation immediately before Popen too.
    return bool(good) and not cancel.pending


def operation(cancel, prepared):
    C, E, P, review, sources, directory = prepared
    if review['mode'] == 'observe-helper':
        return P.observation.operation(cancel, prepared, preflight, argv_for, sys.argv[2])
    fds = []
    try:
        tool, mounted, config, manifest, tmp, export, bwrap = preflight(C, review, sources, directory, fds)
        parent_ns = P.namespace_ids()
        tool_bytes = os.fstat(config).st_size
        helper_tmp = os.environ['TMPDIR']  # Exact approved NEW job path, checked empty in preflight.
        os.umask(0o077)
        def run(mode):
            cancel.check()
            C.require(C.identity(os.fstat(bwrap)) == C.identity(os.stat('/usr/bin/bwrap', follow_symlinks=False)),
                      'bwrap changed')
            output = C.new_dir(tmp, 'probe' if mode == 'probe' else 'acquisition'); fds.append(output)
            inherited = [fd for _, fd in mounted] + [config, output]
            for fd in inherited[:-1]:
                os.lseek(fd, 0, os.SEEK_SET)  # Same sealed descriptions, fresh read for each child.
            argv = argv_for(tool, mounted, config, output, mode)
            receipt = supervise(argv, inherited, helper_tmp, cancel)
            receipt.update(reviewSha256=sys.argv[2], toolchainSha256=review['toolchainSha256'],
                           codeSha256=review['codeSha256'], inputSha256=C.INPUT_SHA256,
                           argvSha256=hashlib.sha256(C.encode(argv)).hexdigest(), mode=mode,
                           requestedMode=review['mode'], parentNamespaces=parent_ns,
                           authorizationReference=review['authorizationReference'],
                           task=5597, label=C.LABEL, environmentIsAuthorization=False)
            return output, receipt
        def verify(output, receipt):
            return P.verify_output(E, output, receipt, tool, review['toolchainSha256'], tool_bytes, parent_ns)
        def acquire():
            output, receipt = run('acquire')
            # Probe exporter returned a pinned destination, not a reopened mutable pathname.
            destination = probe_destination[0]
            receipt['probeReceiptSha256'] = probe_digest[0]
            return E.export(output, destination, 'acquisition', manifest, receipt, cancel)
        probe_destination, probe_digest = [], []
        def retain_export(output, receipt, row):
            destination = E.export_probe(output, export, review['exportName'], receipt, row, cancel)
            fds.append(destination); probe_destination.append(destination)
            probe_digest.append(row['sha256'] if row else None)
            return True
        good = phases(review['mode'], run, verify, retain_export, acquire, cancel)
        cancel.check()
        return dict(schema='ak5597-artifact-driver-status.v3', exported=True, good=good,
                            mode=review['mode'], verifiedProbe=good if review['mode'] == 'probe' else bool(probe_digest[0]),
                            acquisitionCopyComplete=good and review['mode'] == 'acquire', qualification=False)
    finally:
        for fd in reversed(fds):
            os.close(fd)


def main():
    if len(sys.argv) != 3:
        raise ValueError('require review path and owner-reviewed SHA256')
    prepared = bootstrap(sys.argv[1], sys.argv[2])  # Reject unknown mode before handlers/effects.
    with Cancellation() as cancel:
        status = operation(cancel, prepared)  # Reaped children and closed owned FDs on return.
        good = status.pop('good')
        status['acceptancePending'] = True
        cancel.check()
        print(prepared[0].encode(status).decode(), end='', flush=True)
        cancel.check()  # Status/receipts are snapshots, not atomic acceptance or exit proof.
    return 0 if good and not cancel.pending else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        os.write(2, b'{"schema":"ak5597-artifact-driver-status.v1","status":"refused-or-incomplete"}\n')
        sys.exit(1)
