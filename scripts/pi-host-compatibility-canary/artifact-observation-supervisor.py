"""Owned-tracer supervisor. Application deadlines do not bound stuck kernel/disk calls.
Cancellation handler is the driver's nonraising latch, retained through export/close.
No wait without timeout, process census, killpg, detach, or descendant-reap claims.
"""
import hashlib
import os
import selectors
import signal
import subprocess
import time

TRACE_MAX = 8 * 1024 * 1024
STDOUT_MAX = 64 * 1024
CHUNK = 4096
WALL_SECONDS = 1900
SETTLE_SECONDS = 10
TICK = 0.1


class Capture:
    def __init__(self, fd, lineage):
        self.fd, self.lineage = fd, lineage
        self.used, self.observed = 0, 0
        self.hash = hashlib.sha256()
        self.overflow, self.failed = False, False

    def append(self, block):
        if type(block) is not bytes or len(block) > CHUNK:
            raise ValueError('capture chunk bound')
        self.observed += len(block)
        retained = block[:max(0, TRACE_MAX - self.used)]
        self.overflow |= len(retained) != len(block)
        view = memoryview(retained)
        try:
            while view:
                n = os.write(self.fd, view)
                if type(n) is not int or not 0 < n <= len(view):
                    raise OSError('trace short write')
                saved = bytes(view[:n])
                self.hash.update(saved); self.used += n
                self.lineage.feed(saved)
                view = view[n:]
        except BaseException:
            self.failed = True
            raise

    def finish(self):
        metadata = None
        try:
            os.fsync(self.fd)
            s = os.fstat(self.fd)
            metadata = dict(dev=s.st_dev, ino=s.st_ino, mode=s.st_mode,
                            uid=s.st_uid, nlink=s.st_nlink, size=s.st_size,
                            mtimeNs=s.st_mtime_ns, ctimeNs=s.st_ctime_ns)
            if s.st_size != self.used:
                self.failed = True
        except BaseException:
            self.failed = True
        return dict(file='trace.raw', bytes=self.used, sha256=self.hash.hexdigest(),
                    observedBytes=self.observed, overflow=self.overflow, writeOrSyncFailed=self.failed,
                    metadata=metadata, limitBytes=TRACE_MAX)


def supervise(argv, inherited, helper_tmp, cancel, capture):
    child, selector, pidfd = None, None, None
    status, reason, reaped = None, 'launch-failed', False
    eof = dict(stdout=False, stderr=False)
    stdout_bytes, stdout_hash = 0, hashlib.sha256()
    kill_attempted, kill_failed, reap_failed = False, False, False
    start = time.monotonic()

    def poll_reap():
        nonlocal status, reaped
        if child is not None and not reaped:
            value = child.poll()
            if value is not None:
                # poll normally reaps; timeout=0 is an explicit bounded confirmation only.
                status = value
                status = child.wait(timeout=0)
                reaped = True

    def drain(timeout):
        nonlocal stdout_bytes
        if selector is None:
            return
        for key, _ in selector.select(timeout=timeout):
            try:
                block = os.read(key.fd, CHUNK)
            except BlockingIOError:
                continue
            if not block:
                eof[key.data] = True
                selector.unregister(key.fileobj)
            elif key.data == 'stderr':
                capture.append(block)
                if capture.overflow:
                    raise ValueError('trace-overflow')
            else:
                stdout_bytes += len(block)
                stdout_hash.update(block)
                if stdout_bytes > STDOUT_MAX:
                    raise ValueError('stdout-overflow')

    try:
        if cancel.pending:
            reason = 'interrupted'
        else:
            selector = selectors.DefaultSelector()
            if cancel.pending:
                raise InterruptedError('cancelled before tracer creation')
            child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, env={'TMPDIR': helper_tmp}, cwd='/',
                                     close_fds=True, pass_fds=tuple(inherited), start_new_session=True)
            reason = 'running'
            # pidfd is CLOEXEC and not in pass_fds; fallback is only the owned Popen object.
            pidfd = os.pidfd_open(child.pid, 0)
            for name in eof:
                pipe = getattr(child, name)
                os.set_blocking(pipe.fileno(), False)
                selector.register(pipe, selectors.EVENT_READ, name)
            while True:
                poll_reap()
                if cancel.pending:
                    reason = 'interrupted'; break
                if time.monotonic() - start >= WALL_SECONDS:
                    reason = 'timeout'; break
                if reaped and all(eof.values()):
                    reason = 'exited'; break
                drain(TICK)
    except BaseException:
        reason = 'supervisor-error' if child is not None else 'launch-failed'
    finally:
        # All failures, including poll/wait/kill/drain errors, retain a finite settlement budget.
        if child is not None and (not reaped or not all(eof.values())):
            if not reaped and status is None:
                kill_attempted = True
                try:
                    if pidfd is not None:
                        signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                    else:
                        child.kill()  # Only our own still-unreaped child, no os.kill PID lookup.
                except BaseException:
                    kill_failed = True
            try:
                end = time.monotonic() + SETTLE_SECONDS
            except BaseException:
                end = None
            draining = not capture.failed and not capture.overflow and stdout_bytes <= STDOUT_MAX
            for _ in range(101):  # Also bounded when a clock/poll/selector fails repeatedly.
                try:
                    poll_reap()
                except BaseException:
                    reap_failed = True
                if reaped and all(eof.values()):
                    break
                try:
                    if end is None or time.monotonic() >= end:
                        break
                    delay = min(TICK, max(0, end - time.monotonic()))
                    if draining:
                        drain(delay)
                    else:
                        time.sleep(delay)
                except BaseException:
                    # Preserve partials; stop drainage but continue bounded poll/reap attempts.
                    draining = False
        if child is not None:
            for name in eof:
                try:
                    getattr(child, name).close()
                except BaseException:
                    reason = 'close-error'
        if selector is not None:
            try:
                selector.close()
            except BaseException:
                reason = 'close-error'
        if pidfd is not None:
            try:
                os.close(pidfd)
            except BaseException:
                reason = 'close-error'
    raw = capture.finish()
    cancelled = bool(cancel.pending)
    if cancelled:
        reason = 'interrupted'
    complete = (reason == 'exited' and reaped and all(eof.values()) and not cancelled
                and not raw['overflow'] and not raw['writeOrSyncFailed'])
    lineage = capture.lineage.finish(complete)
    return dict(schema='ak5597-observation-supervisor.v1', childRole='tracer',
                tracerCreated=child is not None, tracerReaped=reaped, tracerReturncode=status,
                reason=reason, cancelled=cancelled, eof=eof, captureComplete=complete,
                settlementPending=not reaped if child is not None else False,
                killAttempted=kill_attempted, killFailed=kill_failed, reapFailed=reap_failed,
                helperReapedByDriver=False, descendantSettlementCertified=False,
                stdoutObservedBytes=stdout_bytes, stdoutSha256=stdout_hash.hexdigest(),
                stdoutOverflow=stdout_bytes > STDOUT_MAX, rawTrace=raw, lineage=lineage,
                acquisition=False, qualification=False, readiness=False)
