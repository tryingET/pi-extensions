"""Explicit helper-only observation mode; no acquisition transition or runtime green gate.
C, E, P, L and S are injected from hash-checked host sources, never worker mounts.
Source-only dialect correction; actual replay and runtime proof pending. Review data is not launch authority.
"""
import hashlib
import os
from types import FunctionType, SimpleNamespace

FILES = ('artifact-observation.py', 'artifact-observation-lineage.py', 'artifact-observation-supervisor.py')
REVIEW_SCHEMA = 'ak5597-artifact-observation-review.v1'
STRACE_SHA256 = 'ca7daa61ec8d0c765ded1d80bdd81820d2d6433272a1bffb2b6111f244a47361'
# Nonmetadata I/O stays raw. Full execve argv/env adds PRIVATE TMPDIR exposure.
# Only supplied helper TMPDIR and cleared worker env; independent privacy review required.
DECODE = ('fork,vfork,clone,clone3,execve,exit,exit_group,open,openat,openat2,close,close_range,'
          'dup,dup2,dup3,fcntl,stat,lstat,fstat,newfstatat,statx,unshare,setns,mount,umount2,'
          'pivot_root,chroot,chdir,fchdir,mkdir,mkdirat,unlink,unlinkat,rmdir,chmod,fchmod,'
          'fchmodat,truncate,ftruncate,memfd_create,mmap,mprotect,munmap,wait4,waitid')
PREFIX = ('/usr/bin/strace', '-f', '--kill-on-exit', '-I', '1', '--always-show-pid',
          '-e', 'trace=all', '-e', 'raw=!' + DECODE, '-e', 'read=none', '-e', 'write=none',
          '-e', 'abbrev=!execve,clone,clone3,stat,lstat,fstat,newfstatat,statx',
          '--decode-fds=path,dev', '--decode-pids=pidns', '--quiet=none', '-s', '512', '--')
RUBRIC = dict(schema='ak5597-helper-placement-rubric.v1', expectedMountedInputs=111,
    expectedTemporaryFiles=112, status='pending-independent-offline-analysis',
    requirements=[
        'Require full untruncated initial helper execve argv matching the reviewed 111-input template; a hash is not a substitute.',
        'Calibrate exact pinned emitted PID/exec/clone/exit/unfinished/signal dialect, with no omitted records.',
        'Account for every launched helper/worker descendant and terminal separately from tracer reap.',
        'Correlate host and namespace PIDs, clone flags and mount-namespace generations.',
        'Prove private propagation, new tmpfs instance, root/cwd and both pivot transitions causally.',
        'For each of 112 ro-bind-data temporaries prove creation after that tmpfs transition.',
        'Resolve dirfd/path/pivot/bind aliases, FD reuse, inheritance, sharing and CLOEXEC by open generation.',
        'Map every raw copy/write/mmap FD and chmod to that same object; bind, close and unlink it.',
        'Account for output bind-fd dev/ino equality and consumption, independently of path spelling.',
        'Check unchanged 111 input hashes plus config and strict four-FD/two-entry probe evidence.',
        'Label tmpfs-instance/open-lifetime identity narrower than per-file inode/mount-ID evidence.',
        'Any unknown edge, decoder truncation, escape, missing terminal or unresolved object is inconclusive.'
    ])


def policy():
    return dict(schema='ak5597-observation-policy.v1', prefix=list(PREFIX), dialect=L.DIALECT,
                traceLimit=S.TRACE_MAX, stdoutLimit=S.STDOUT_MAX, chunk=S.CHUNK,
                wallSeconds=S.WALL_SECONDS, settleSeconds=S.SETTLE_SECONDS,
                lineLimit=L.LINE_MAX, processLimit=L.PID_MAX, eventLimit=L.EVENT_MAX,
                rubric=RUBRIC, topologyVerificationImplemented=False, calibrated=False)


def review_projection(review):
    C.keys(review, 'schema task label mode authorizationReference codeSha256 driverPythonSha256 '
           'bwrapSha256 toolchainPath toolchainSha256 scratchRunsRoot exportParent exportName observer')
    C.require(review['schema'] == REVIEW_SCHEMA and review['mode'] == 'observe-helper', 'observer review identity')
    C.require(set(review['codeSha256']) == set(C.CODE) | set(FILES), 'observer source set')
    for value in review['codeSha256'].values():
        C.digest(value)
    row = review['observer']
    C.keys(row, 'schema stracePath straceSha256 policySha256 helperArgvTemplateSha256 purpose')
    C.require(row['schema'] == 'ak5597-helper-observer-config.v1'
              and row['purpose'] == 'calibration-only-no-readiness'
              and row['stracePath'] == '/usr/bin/strace'
              and row['straceSha256'] == STRACE_SHA256, 'observer config identity')
    for key in ('straceSha256', 'policySha256', 'helperArgvTemplateSha256'):
        C.digest(row[key])
    C.require(row['policySha256'] == hashlib.sha256(C.encode(policy())).hexdigest(), 'observer policy hash')
    C.require(review['exportName'].startswith('ak5597-artifacts-observation-'), 'new observation export identity')
    # Reuse every ordinary owner/input preflight, not its launch/acceptance path.
    projected = {k: v for k, v in review.items() if k != 'observer'}
    projected.update(schema='ak5597-artifact-launch-review.v2', mode='probe')
    return projected


def executable_metadata(s):
    return C.identity(s) + (s.st_uid, s.st_gid, s.st_mode, s.st_nlink)


def pin_tracer(review, fds):

    fd = C.open_file('/usr/bin/strace', 16 * 1024 * 1024)
    fds.append(fd)
    before = C.regular(fd, 16 * 1024 * 1024)
    C.require(before.st_uid == 0 and before.st_nlink == 1 and before.st_mode & 0o6022 == 0
              and before.st_mode & 0o111, 'root owned nonprivileged tracer')
    snapshot = executable_metadata(before)
    digest = hashlib.sha256(C.read_fd(fd, 16 * 1024 * 1024)).hexdigest()
    C.require(snapshot == executable_metadata(C.regular(fd, 16 * 1024 * 1024)),
              'tracer changed during hash')
    C.require(digest == review['observer']['straceSha256'], 'tracer hash')
    return fd, snapshot


def supervise_pinned(argv, inherited, helper_tmp, cancel, capture, tracer, bwrap):
    """Bind the check to Popen, after selector setup, without changing shared S globals.
    Reuse the reviewed supervisor code with one private subprocess binding. This is
    NOT atomic pathname execution, a sealed executable, or native loader closure.
    """
    spawn = S.supervise.__globals__['subprocess']
    def popen(*args, **kwargs):
        C.require(not cancel.pending, 'cancelled before pinned launch')
        C.require(C.identity(os.fstat(bwrap)) == C.identity(os.stat('/usr/bin/bwrap', follow_symlinks=False)),
                  'launch helper changed')
        fd, snapshot = tracer
        C.require(executable_metadata(os.fstat(fd)) == snapshot
                  == executable_metadata(os.stat('/usr/bin/strace', follow_symlinks=False)),
                  'hashed tracer changed before launch')
        return spawn.Popen(*args, **kwargs)
    scope = dict(S.supervise.__globals__, subprocess=SimpleNamespace(
        Popen=popen, DEVNULL=spawn.DEVNULL, PIPE=spawn.PIPE))
    supervise = FunctionType(S.supervise.__code__, scope, S.supervise.__name__,
                             S.supervise.__defaults__, S.supervise.__closure__)
    return supervise(argv, inherited, helper_tmp, cancel, capture)


def invocation(argv_for, tool, mounted, config, output, review):
    C.require(len(mounted) == 111, 'exact sealed input count')
    template = argv_for(tool, [(r, 'input:%d' % i) for i, (r, _) in enumerate(mounted)],
                        'config', 'output', 'probe')
    C.require(hashlib.sha256(C.encode(template)).hexdigest()
              == review['observer']['helperArgvTemplateSha256'], 'helper argv template hash')
    helper = argv_for(tool, mounted, config, output, 'probe')
    return list(PREFIX) + helper


def probe_candidate(source, supervision, cancel):
    """Custody only, never adapt tracerReaped into the ordinary helper childReaped guard.
    Preserve the actual receipt if bounded and internally identified; full P.verify and
    independent trace/probe correlation remain pending. The worker's FD check is untouched.
    """
    if (cancel.pending or not supervision['captureComplete']
            or not supervision['lineage']['allTerminal']):
        return None
    C.require(set(C.directory_names(source)) == {P.WRITE_NAME, 'probe-receipt.json'}, 'probe two entries')
    fd = E.open_source(source, 'probe-receipt.json', C.RECEIPT_MAX)
    try:
        raw = C.read_fd(fd, C.RECEIPT_MAX)
    finally:
        os.close(fd)
    receipt = C.decode(raw)
    C.require(receipt.get('schema') == 'ak5597-artifact-probe.v1'
              and receipt.get('acquisition') is False and receipt.get('qualification') is False,
              'candidate probe identity')
    E.hash_source(source, dict(file=P.WRITE_NAME, bytes=len(P.WRITE_BYTES),
                  sha256=hashlib.sha256(P.WRITE_BYTES).hexdigest(), sha512=hashlib.sha512(P.WRITE_BYTES).hexdigest()))
    return dict(file='probe-receipt.json', bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                sha512=hashlib.sha512(raw).hexdigest())


def operation(cancel, prepared, preflight, argv_for, review_sha):
    C0, E0, P0, review, sources, directory = prepared
    C.require(C0 is C and E0 is E and P0 is P, 'observer module bindings')
    fds = []
    try:
        projected = review_projection(review)
        tracer = pin_tracer(review, fds)
        tool, mounted, config, _, tmp, parent, bwrap = preflight(C, projected, sources, directory, fds)
        parent_ns = P.namespace_ids()
        # Complete deterministic argv-template checking before any exclusive disk creation.
        invocation(argv_for, tool, mounted, config, 'output', review)
        if cancel.pending:
            return status(False, False)
        os.umask(0o077)
        destination, raw_fd = E.begin_observation(parent, review['exportName'])
        fds.extend([destination, raw_fd])
        supervision, source, candidate = None, None, None
        launch_attempted = False
        binding = dict(reviewSha256=review_sha, codeSha256=review['codeSha256'],
                       observer=review['observer'], toolchainSha256=review['toolchainSha256'],
                       bwrapSha256=review['bwrapSha256'], driverPythonSha256=review['driverPythonSha256'],
                       inputSha256=C.INPUT_SHA256, parentNamespaces=parent_ns,
                       authorizationReference=review['authorizationReference'], environmentIsAuthorization=False,
                       task=5597, label=C.LABEL, mode='observe-helper')
        capture = S.Capture(raw_fd, L.Lineage())
        try:
            C.require(not cancel.pending, 'cancelled before output')
            source = C.new_dir(tmp, 'probe'); fds.append(source)
            inherited = [fd for _, fd in mounted] + [config, source]
            for fd in inherited[:-1]:
                os.lseek(fd, 0, os.SEEK_SET)
            argv = invocation(argv_for, tool, mounted, config, source, review)
            binding.update(argvSha256=hashlib.sha256(C.encode(argv)).hexdigest(),
                           inheritedFds=inherited, traceFdInherited=False,
                           childEnvironmentKeys=['TMPDIR'])
            launch_attempted = True
            supervision = supervise_pinned(argv, inherited, os.environ['TMPDIR'], cancel, capture, tracer, bwrap)
            candidate = probe_candidate(source, supervision, cancel)
        except BaseException:
            if supervision is not None:
                supervision['probeCandidateError'] = True
        if supervision is None:
            # Unexpected missing supervisor return cannot establish whether its child was created.
            supervision = dict(schema='ak5597-observation-supervisor.v1', childRole='tracer',
                tracerCreated=None if launch_attempted else False, tracerReaped=False, tracerReturncode=None,
                reason='supervisor-return-missing' if launch_attempted else 'launch-failed',
                captureComplete=False, cancelled=bool(cancel.pending), settlementPending=launch_attempted,
                rawTrace=capture.finish(), lineage=capture.lineage.finish(False),
                acquisition=False, qualification=False, readiness=False,
                helperReapedByDriver=False, descendantSettlementCertified=False)
        supervision.update(binding)
        result = E.export_observation(source, destination, parent, supervision, candidate, cancel)
        return status(result['exportComplete'], supervision['captureComplete'])
    finally:
        for fd in reversed(fds):
            try:
                os.close(fd)
            except OSError:
                # Closing failure must fail driver status, but never release nonraising handlers early.
                cancel.record()


def status(exported, captured):
    return dict(schema='ak5597-artifact-observation-status.v1', good=False, exported=exported,
                captureComplete=captured, mode='observe-helper', verifiedProbe=False,
                verifiedRuntimeLineage=False, topology='inconclusive', calibrated=False,
                acquisitionCopyComplete=False, acquisition=False, qualification=False, readiness=False)
