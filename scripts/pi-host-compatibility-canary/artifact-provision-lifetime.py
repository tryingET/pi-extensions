"""Provision-specific PID1 settlement and bounded outer helper wait; no general runner."""
import hashlib
import os
import resource
import selectors
import signal
import subprocess
import time

WALL = 2700
GRACE = 5


def limits():
    # Per-process inherited limits, NOT aggregate RSS/CPU/process limits.
    for name, kind, value in (
        ('NOFILE', resource.RLIMIT_NOFILE, (256, 256)),
        ('AS', resource.RLIMIT_AS, (16 * 1024 ** 3, 16 * 1024 ** 3)),
        ('CPU', resource.RLIMIT_CPU, (650, 660)),
        ('CORE', resource.RLIMIT_CORE, (0, 0)),
        ('FSIZE', resource.RLIMIT_FSIZE, (P.GIB, P.GIB)),
    ):
        try:
            resource.setrlimit(kind, value)
        except ValueError:
            raise ValueError('limit ' + name) from None


class Latch:
    def __init__(self):
        self.pending = False

    def record(self, *_):
        self.pending = True


def reap_available(wait=os.waitpid):
    """PID1 owns every adopted descendant. ECHILD, not a direct Popen.wait, is proof."""
    rows = []
    while True:
        try:
            pid, status = wait(-1, os.WNOHANG)
        except ChildProcessError:
            return True, rows
        except InterruptedError:
            continue
        if pid == 0:
            return False, rows
        rows.append((pid, status))


def settle(terminate, clock=time.monotonic, sleep=time.sleep, wait=os.waitpid, kill=os.kill):
    C.require(os.getpid() == 1, 'settlement requires namespace PID1')
    reaped = 0
    # No killpg: -1 here is explicitly namespace-local and excludes this PID1.
    for sig in ((signal.SIGTERM, signal.SIGKILL) if terminate else (None,)):
        if sig is not None:
            try:
                kill(-1, sig)
            except ProcessLookupError:
                pass
        end = clock() + GRACE
        while True:
            empty, rows = reap_available(wait); reaped += len(rows)
            if empty:
                return dict(allChildrenSettled=True, reaped=reaped, termination=terminate)
            if clock() >= end:
                break
            sleep(0.05)
    return dict(allChildrenSettled=False, reaped=reaped, termination=terminate)


def command(args, seconds, latch, deadline, log_fd, budget):
    """Serial trusted npm; manually reap ALL children, including adopted grandchildren."""
    child, selector, status = None, selectors.DefaultSelector(), None
    reason, adopted, ended = 'launch-failed', 0, False
    try:
        C.require(not latch.pending and time.monotonic() < deadline, 'cancel/deadman')
        end = min(deadline, time.monotonic() + seconds)
        child = subprocess.Popen(args, cwd='/work/install', env=P.ENV, stdin=0,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 close_fds=True, preexec_fn=limits, start_new_session=True)
        os.set_blocking(child.stdout.fileno(), False)
        selector.register(child.stdout, selectors.EVENT_READ)
        reason = 'running'
        while True:
            empty, rows = reap_available()
            for pid, raw in rows:
                if pid == child.pid:
                    status = os.waitstatus_to_exitcode(raw); child.returncode = status; ended = True
                else:
                    adopted += 1
            if latch.pending:
                reason = 'cancelled'; break
            if time.monotonic() >= end:
                reason = 'wall-or-deadman'; break
            if ended and empty and not selector.get_map():
                reason = 'exited'; break
            for key, _ in selector.select(0.05):
                raw = os.read(key.fd, min(C.CHUNK, max(1, budget['remaining'] + 1)))
                if not raw:
                    selector.unregister(key.fileobj); continue
                allowed = raw[:budget['remaining']]
                C.write_all(log_fd, allowed)
                budget['remaining'] -= len(allowed)
                if len(raw) > len(allowed):
                    reason = 'aggregate-log-limit'; break
            if reason != 'running':
                break
    except BaseException:
        reason = 'command-error'
    finally:
        settlement = settle(reason != 'exited')
        if child is not None:
            # waitpid(-1) has already consumed statuses. Do not invent a returncode if lost.
            if child.returncode is None and settlement['allChildrenSettled']:
                child.returncode = -signal.SIGKILL
            child.stdout.close()
        selector.close()
    return dict(argvSha256=P.sha(C.encode(args)), reason=reason, returncode=status,
                adoptedReaped=adopted, directStatusObserved=ended, settlement=settlement)


def helper(args, inherited, helper_tmp, cancel, deadline, popen=subprocess.Popen):
    """Bounded helper termination. Unknown settlement forbids host export/success."""
    child, selector = None, selectors.DefaultSelector()
    reason, status, reaped, count = 'launch-failed', None, False, 0
    digest = hashlib.sha256()
    try:
        cancel.check()
        C.require(time.monotonic() < deadline, 'overall deadman')
        child = popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                      cwd='/', env={'TMPDIR': helper_tmp}, close_fds=True,
                      pass_fds=tuple(inherited), start_new_session=True)
        os.set_blocking(child.stdout.fileno(), False)
        selector.register(child.stdout, selectors.EVENT_READ)
        reason = 'exited'
        while selector.get_map() or child.poll() is None:
            if cancel.pending or time.monotonic() >= deadline:
                reason = 'cancelled' if cancel.pending else 'deadman'; break
            for key, _ in selector.select(0.1):
                block = os.read(key.fd, 4096)
                if not block:
                    selector.unregister(key.fileobj); continue
                count += len(block); digest.update(block)
                # Reserve 64KiB for helper/Python diagnostics; npm gets the remainder.
                if count > 64 * 1024:
                    reason = 'helper-log-limit'; break
            if reason != 'exited':
                break
    except BaseException:
        reason = 'helper-error' if child is not None else 'launch-failed'
    finally:
        if child is not None:
            if child.poll() is None:
                child.terminate()
            try:
                status = child.wait(timeout=GRACE)
                reaped = True
            except subprocess.TimeoutExpired:
                child.kill()
                try:
                    status = child.wait(timeout=GRACE)
                    reaped = True
                except subprocess.TimeoutExpired:
                    reason = 'helper-settlement-unknown'
            child.stdout.close()
        selector.close()
    return dict(reason=reason, returncode=status, helperReaped=reaped,
                cancelled=cancel.pending, diagnosticBytes=count, diagnosticSha256=digest.hexdigest())
