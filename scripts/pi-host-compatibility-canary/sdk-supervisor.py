"""Private canary PID1, not a public runner. Trusted readonly source, NOT a code sandbox.
Settlement loop follows artifact-provision-lifetime.py: reap(-1) to ECHILD plus EOF.
No direct-child wait()/process-group absence is promoted into descendant proof.
"""
import base64
import builtins
import hashlib
import json
import os
import resource
import selectors
import signal
import stat
import subprocess
import sys
import time

from types import SimpleNamespace


def need(ok, reason):
    if not ok:
        raise ValueError(reason)


def startup_read(path):
    # Consumer provisioning pattern: no symlink components; bounded stable FD.
    need(type(path) is str and path.startswith('/') and
         all(p not in ('', '.', '..') for p in path[1:].split('/')), 'startup path')
    parts = path[1:].split('/')
    directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in parts[:-1]:
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
            os.close(directory)
            directory = nxt
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory)
        try:
            before = os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                 not before.st_mode & 0o022 and 0 < before.st_size <= 50 * 1024, 'startup regular bound/mode')
            raw = bytearray()
            while block := os.read(fd, 50 * 1024 + 1 - len(raw)):
                raw.extend(block)
                need(len(raw) <= 50 * 1024, 'startup source bound')
            identity = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid,
                                  s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
            need(len(raw) == before.st_size and identity(before) == identity(os.fstat(fd)), 'startup source changed')
            return bytes(raw)
        finally:
            os.close(fd)
    finally:
        os.close(directory)


def bootstrap(argv):
    need(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, 'interpreter mode')
    need(len(argv) == 4 or (len(argv) == 5 and argv[-1] == '--help'), 'startup arguments')
    root, *pins = argv[:4]
    names = ('sdk-supervisor.py', 'sdk_mounts.py', 'sdk_release.py')
    need(__file__ == root + '/' + names[0], 'declared supervisor root')
    need(all(type(p) is str and len(p) == 64 and all(c in '0123456789abcdef' for c in p)
             for p in pins), 'startup digest spelling')
    sources = {}
    for name, pin in zip(names, pins):
        raw = startup_read(root + '/' + name)
        need(hashlib.sha256(raw).hexdigest() == pin, 'startup source pin: ' + name)
        sources[name] = raw
    # Verify ALL source bytes before compiling either support. Never reopen for exec,
    # use importlib/runpy, insert a search path, or consume a sibling pyc.
    def support_import(name, globals=None, locals=None, fromlist=(), level=0):
        if level != 0 or name not in ('os', 'time'):
            raise ImportError('unapproved SDK support import: ' + name)
        return {'os': os, 'time': time}[name]
    def load(name):
        scope = dict(__name__=name[:-3], __file__=root + '/' + name, __package__=None,
                     __builtins__=dict(vars(builtins), __import__=support_import))
        exec(compile(sources[name], scope['__file__'], 'exec', dont_inherit=True), scope)
        return SimpleNamespace(**scope)
    return load(names[1]), load(names[2]), len(argv) == 5


def main(argv):
    global sdk_mounts, sdk_release
    sdk_mounts, sdk_release, help_only = bootstrap(argv)
    if help_only:
        os.write(1, b'SDK supervisor bootstrap verified; help only; no namespace or SDK launch\n')
        return 0
    return run()


def read_json(path, bound=8 * 1024 ** 2):
    with open(path, 'rb') as stream:
        raw = stream.read(bound + 1)
    need(len(raw) <= bound, 'input bound')
    return json.loads(raw), raw


def namespaces():
    return {k: os.readlink('/proc/self/ns/' + k) for k in ('pid', 'net', 'ipc', 'mnt', 'user')}


def send(value):
    raw = (json.dumps(value, separators=(',', ':')) + '\n').encode()
    while raw:
        written = os.write(1, raw)
        raw = raw[written:]


def reap_available():
    rows = []
    while True:
        try:
            pid, status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return True, rows
        except InterruptedError:
            continue
        if pid == 0:
            return False, rows
        rows.append((pid, status))


def settle(terminate):
    need(os.getpid() == 1, 'private PID1 required')
    for sig in ((signal.SIGTERM, signal.SIGKILL) if terminate else (None,)):
        if sig is not None:
            try:
                os.kill(-1, sig)  # only private namespace; excludes PID1
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 5
        while True:
            empty, _ = reap_available()
            if empty:
                return True
            if time.monotonic() >= deadline:
                break
            time.sleep(0.02)
    return False


def observations(plan, context):
    need(os.getpid() == 1 and os.getppid() == 0, 'PID1 topology')
    need(set(os.environ) <= {'LC_CTYPE'} and os.environ.get('LC_CTYPE', 'C.UTF-8') == 'C.UTF-8', 'clean supervisor environment')
    ns = namespaces()
    need(all(ns[k] != context['parentNamespaces'][k] for k in ns), 'private namespaces')
    status = dict(line.split(':', 1) for line in open('/proc/self/status') if ':' in line)
    need(all(int(status[k].strip(), 16) == 0 for k in ('CapEff', 'CapPrm', 'CapInh', 'CapAmb', 'CapBnd')), 'capabilities')
    live = []
    for leaf in os.listdir('/proc/self/fd'):
        try:
            os.readlink('/proc/self/fd/' + leaf)
            live.append(int(leaf))
        except FileNotFoundError:
            pass
    need(sorted(live) == [0, 1, 2], 'unexpected inherited descriptors')
    points = {'/', '/proc', '/dev/null', '/work', '/canary-input/plan.json', '/canary-input/context.json'}
    points.update(row['path'] for row in plan['files'])
    text = open('/proc/self/mountinfo').read()
    mounts = sdk_mounts.parse_mountinfo(text)
    sdk_mounts.validate_mounts(mounts, points)
    for row in plan['files']:
        with open(row['path'], 'rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        need(digest == row['sha256'], 'guest input bytes')
    return ns


def run():
    need(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode, 'interpreter mode')
    plan, raw = read_json('/canary-input/plan.json')
    context, raw_context = read_json('/canary-input/context.json')
    need(hashlib.sha256(raw).hexdigest() == context['planSha256'], 'plan seal')
    ns = observations(plan, context)
    os.umask(0o077)
    for name in ('home', 'tmp', 'state', 'cache', 'config', 'receipts'):
        os.mkdir('/work/' + name, 0o700)
    for kind, value in ((resource.RLIMIT_CORE, 0), (resource.RLIMIT_NOFILE, 256),
                        (resource.RLIMIT_AS, 16 * 1024 ** 3), (resource.RLIMIT_CPU, 120),
                        (resource.RLIMIT_FSIZE, 16 * 1024 ** 2)):
        resource.setrlimit(kind, (value, value))
    cancelled = [False]
    def cancel(*_):
        cancelled[0] = True
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, cancel)
    send(dict(type='ready', namespace=ns['pid']))
    selector = selectors.DefaultSelector()
    selector.register(0, selectors.EVENT_READ)
    release_max = int(plan.get('limits', {}).get('releaseMax', 128))
    sdk_release.read_framed_release(0, context['attempt'], release_max, time.monotonic() + 10, selector)
    # Lifetime channel stays registered after framed release.
    env = {'HOME': '/work/home', 'XDG_STATE_HOME': '/work/state', 'XDG_CONFIG_HOME': '/work/config',
           'XDG_CACHE_HOME': '/work/cache', 'TMPDIR': '/work/tmp', 'PATH': os.path.dirname(plan['toolchain']['node']),
           'LANG': 'C.UTF-8', 'PI_OFFLINE': '1', 'PI_CANARY_SDK_CONTEXT': hashlib.sha256(raw_context).hexdigest(),
           'PI_HOST_COMPAT_PROFILE': 'upgrade', 'PI_HOST_COMPAT_SCENARIO': context['scenario'],
           'PI_HOST_VERSION': plan['host']['version'], 'PI_HOST_COMPAT_REVIEW_ANCHOR': plan['host']['reviewAnchor']}
    argv = [plan['toolchain']['node']] + plan['scenario']['command'][1:]
    child = subprocess.Popen(argv, cwd=plan['scenario']['cwd'], env=env, close_fds=True,
                             stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             start_new_session=True)
    for stream in (child.stdout, child.stderr):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ)
    out, err = bytearray(), bytearray()
    deadline = time.monotonic() + plan['limits']['wallSeconds']
    code, empty, eof = None, False, False
    termination = False
    try:
        while True:
            empty, rows = reap_available()
            for pid, status in rows:
                if pid == child.pid:
                    code = os.waitstatus_to_exitcode(status)
                    child.returncode = code
            eof = not any(k.fd != 0 for k in selector.get_map().values())
            if code is not None and empty and eof:
                break
            if cancelled[0] or time.monotonic() >= deadline:
                termination = True
                break
            for key, _ in selector.select(0.05):
                block = os.read(key.fd, 4096)
                if key.fd == 0:
                    termination = True  # EOF or unexpected late control data
                    break
                if not block:
                    selector.unregister(key.fileobj)
                else:
                    (out if key.fileobj is child.stdout else err).extend(block)
                    if len(out) + len(err) > plan['limits']['outputBytes']:
                        termination = True
                        break
            if termination:
                break
    finally:
        empty = settle(termination) and empty if not termination else settle(True)
        selector.close()
        child.stdout.close()
        child.stderr.close()
    termination = termination or cancelled[0]
    wires = []
    if empty and eof and not termination:
        used = 0
        for name in sorted(os.listdir('/work/receipts')):
            need(len(wires) < 32 and name.endswith('.jsonl'), 'receipt set')
            path = '/work/receipts/' + name
            need(not os.path.islink(path) and os.path.isfile(path), 'receipt type')
            with open(path, 'rb') as stream:
                wire = stream.read(plan['limits']['outputBytes'] + 1)
            used += len(wire)
            need(used <= plan['limits']['outputBytes'], 'receipt aggregate bound')
            wires.append(dict(name=name, wire=wire.decode('utf8', errors='strict')))
    send(dict(type='result', code=code, stdout=base64.b64encode(out).decode(), stderr=base64.b64encode(err).decode(),
              settlement=dict(allChildrenSettled=empty, directStatusObserved=code is not None,
                              outputEOF=eof, termination=termination, supervisorNamespace=ns['pid']), wires=wires))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception:
        os.write(2, b'private canary supervisor incomplete\n')
        sys.exit(125)
