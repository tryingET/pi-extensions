"""Finite helper strace projection, source-calibrated from one consumed observation.
NOT replayed/runtime proof. No topology/FD/object or network-policy inference.
Bracket signals remain synthetic only; unknown ABI/annotations and PID reuse refuse.
"""
import re

DIALECT = 'ak5597-strace-helper-source.v2'
LINE_MAX = 32 * 1024
PID_MAX = 256
EVENT_MAX = 200000
SIGNALS = set(('SIGHUP SIGINT SIGQUIT SIGILL SIGTRAP SIGABRT SIGBUS SIGFPE SIGKILL '
               'SIGUSR1 SIGSEGV SIGUSR2 SIGPIPE SIGALRM SIGTERM SIGSTKFLT SIGCHLD '
               'SIGCONT SIGSTOP SIGTSTP SIGTTIN SIGTTOU SIGURG SIGXCPU SIGXFSZ '
               'SIGVTALRM SIGPROF SIGWINCH SIGIO SIGPWR SIGSYS').split())
# Explicit finite non-lineage vocabulary: retained, NOT topology/network-policy verified.
PASSIVE = set(('read write readv writev pread64 pwrite64 preadv pwritev preadv2 pwritev2 '
    'open openat openat2 close close_range dup dup2 dup3 fcntl stat lstat fstat newfstatat statx '
    'access faccessat faccessat2 readlink readlinkat getdents getdents64 lseek '
    'mmap mprotect munmap mremap brk madvise arch_prctl prctl '
    'set_tid_address set_robust_list rseq futex getrandom '
    'getpid getppid gettid getuid geteuid getgid getegid getgroups '
    'setuid setgid setresuid setresgid setgroups capget capset '
    'rt_sigaction rt_sigprocmask rt_sigreturn sigaltstack kill tgkill '
    'wait4 waitid pause restart_syscall clock_gettime clock_nanosleep nanosleep '
    'pipe pipe2 poll ppoll select pselect6 epoll_create1 epoll_ctl epoll_wait '
    'eventfd2 signalfd4 socket socketpair connect bind getsockname ioctl '
    'sendto recvfrom sethostname sched_getaffinity '
    'unshare setns mount umount2 pivot_root chroot chdir fchdir getcwd '
    'mkdir mkdirat rmdir unlink unlinkat rename renameat renameat2 '
    'chmod fchmod fchmodat fchmodat2 chown fchown fchownat '
    'truncate ftruncate fsync fdatasync syncfs umask statfs fstatfs '
    'copy_file_range sendfile splice tee vmsplice memfd_create '
    'getrlimit setrlimit prlimit64 sysinfo uname alarm setitimer setsid setpgid').split())
RAW_ARITY = dict(sendto=6, recvfrom=6, sethostname=2, sched_getaffinity=3)
FLAGS = set(('CLONE_VM CLONE_FS CLONE_FILES CLONE_SIGHAND CLONE_PIDFD CLONE_PTRACE '
    'CLONE_VFORK CLONE_PARENT_SETTID CLONE_CHILD_CLEARTID CLONE_CHILD_SETTID '
    'CLONE_SYSVSEM CLONE_NEWNS CLONE_NEWCGROUP CLONE_NEWUTS CLONE_NEWIPC '
    'CLONE_NEWUSER CLONE_NEWPID CLONE_NEWNET CLONE_IO SIGCHLD').split())
# Only the observed stat decoder comments; quoted strings are never comment-stripped.
STAMP = (r'(?P<stamp>st_[amc]time=-?[0-9]+) /\* '
         r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
         r'(?:\.[0-9]{9})?\+[0-9]{4} \*/')
QUOTED = r'"(?:[^"\\]|\\.)*"'
# Current helper/worker strings need no escapes. Other string encodings refuse.
ARRAY = r'\[(?:"[^"\\]*"(?:, "[^"\\]*")*)?\]'
EXEC = r'"([^"\\]+)", ' + ARRAY + r', (?:0x[0-9a-f]+ /\* [0-9]+ vars? \*/|' + ARRAY + r')'
NS_CHILD = r"([1-9][0-9]*) /\* ([1-9][0-9]*) in strace's PID NS \*/"


class Lineage:
    def __init__(self):
        self.buffer = b''
        self.nodes, self.pending = {}, {}
        self.root, self.worker = None, None
        self.attached = set()  # Notice bookkeeping only, not exported parentage.
        self.interrupted = None  # One native attach interruption awaiting its unprefixed tail.
        self.namespace_children = {}  # (emitting trace PID, local child PID) -> trace child PID.
        self.events, self.signals, self.error = 0, 0, None

    def fail(self, reason):
        self.error = self.error or reason  # Never export arbitrary trace text as a diagnostic.
        self.buffer = b''

    def feed(self, block):
        if self.error:
            return
        self.buffer += block
        while b'\n' in self.buffer and not self.error:
            line, self.buffer = self.buffer.split(b'\n', 1)
            if len(line) > LINE_MAX:
                self.fail('line-overflow'); break
            try:
                self.line(line.decode('ascii'))
            except (ValueError, UnicodeError, KeyError):
                self.fail('unrecognized-lineage-dialect')
        if len(self.buffer) > LINE_MAX:
            self.fail('line-overflow')

    @staticmethod
    def valid_pid(pid):
        if not 1 <= pid <= 2**31 - 1:
            raise ValueError('pid')
        return pid

    def node(self, pid):
        self.valid_pid(pid)
        if pid not in self.nodes:
            if len(self.nodes) >= PID_MAX:
                raise ValueError('pid bound')
            self.nodes[pid] = dict(parent=None, execs=[], terminal=None, seen=False)
        return self.nodes[pid]

    def attach(self, pid):
        if self.node(pid)['terminal'] is not None or pid in self.attached:
            raise ValueError('post exit or repeated attach/PID reuse')
        self.attached.add(pid)

    def line(self, line):
        if any(ord(c) < 32 or ord(c) == 127 for c in line):
            raise ValueError('line controls')
        self.events += 1
        if self.events > EVENT_MAX or 'CLONE_UNTRACED' in line or 'detached' in line:
            raise ValueError('escape/bound')
        attach = re.fullmatch(r'(?:\[ Process ([1-9][0-9]*) attached \]|strace: Process ([1-9][0-9]*) attached)', line)
        if attach:
            self.attach(int(attach[1] or attach[2]))
            return
        if self.interrupted and re.fullmatch(r'\) += .+', line):
            pid, name = self.interrupted
            self.interrupted = None
            self.record(pid, '<... ' + name + ' resumed>' + line, native=True)
            return
        match = re.fullmatch(r'(?:\[pid +([1-9][0-9]*)\]|([1-9][0-9]*)) +(.+)', line)
        if not match:
            raise ValueError('PID framing')
        pid = int(match[1] or match[2])
        if self.interrupted and pid == self.interrupted[0]:
            raise ValueError('missing native attach continuation')
        self.record(pid, match[3], native=match[2] is not None)

    def record(self, pid, body, native):
        node = self.node(pid)
        if node['terminal'] is not None:
            raise ValueError('post exit/PID reuse')
        node['seen'] = True
        terminal = re.fullmatch(r'\+\+\+ (?:exited with ([0-9]{1,3})|killed by (SIG[A-Z0-9]+)) \+\+\+', body)
        if terminal:
            if (terminal[1] and int(terminal[1]) > 255) or (terminal[2] and (native or terminal[2] not in SIGNALS)):
                raise ValueError('unknown/unobserved terminal status')
            if pid in self.pending:
                raise ValueError('unfinished at exit')
            node['terminal'] = int(terminal[1]) if terminal[1] else terminal[2]
            return
        if re.fullmatch(r'--- SIG[A-Z0-9]+ \{[^\n]*\} ---', body):
            if native or '...' in body or body.split()[1] not in SIGNALS:
                raise ValueError('unobserved/unknown signal or truncation')
            self.signals += 1  # Legacy bracket fixture support, not actual signal calibration.
            return
        notice = None
        resumed = re.fullmatch(r'<\.\.\. ([a-z][a-z0-9_]*) resumed>(.*)', body)
        if resumed:
            name, prefix, notice = self.pending.pop(pid)
            if resumed[1] != name:
                raise ValueError('resume mismatch')
            body = prefix + resumed[2]
        elif pid in self.pending:
            raise ValueError('overlapping unfinished syscall')
        if len(body) > LINE_MAX:
            raise ValueError('paired line overflow')
        call = re.match(r'([a-z][a-z0-9_]*)\(', body)
        if not call:
            raise ValueError('unknown relevant record')
        name = call[1]
        if name not in PASSIVE | {'fork', 'vfork', 'clone', 'clone3', 'execve', 'exit', 'exit_group'}:
            raise ValueError('unknown syscall')
        embedded = re.fullmatch(r'(clone\(.*)strace: Process ([1-9][0-9]*) attached', body)
        if embedded:
            if not native or resumed or self.interrupted or '...' in embedded[1] or ' = ' in embedded[1]:
                raise ValueError('unknown attach interruption')
            child = int(embedded[2])
            self.attach(child)
            self.pending[pid] = (name, embedded[1], child)
            self.interrupted = (pid, name)
            return
        if body.endswith(' <unfinished ...>'):
            if resumed:
                raise ValueError('nested unfinished record')
            self.pending[pid] = (name, body[:-len(' <unfinished ...>')], None)
            return
        if '...' in body or '???' in body:
            raise ValueError('truncation/annotation')
        match = re.fullmatch(r'[a-z][a-z0-9_]*\((.*)\)\s+= (.+)', body)
        if not match:
            raise ValueError('syscall framing')
        args, result = match[1], match[2]
        namespace = re.fullmatch(NS_CHILD, result) if name == 'clone' else None
        if namespace:
            local = self.valid_pid(int(namespace[1]))
            child = self.valid_pid(int(namespace[2]))
            key = (pid, local)
            if key in self.namespace_children:
                raise ValueError('namespace PID reuse')
            self.namespace_children[key] = child
            result = str(child)  # Never create an edge to the namespace-local integer.
        if name in ('stat', 'lstat', 'fstat', 'newfstatat'):
            args = re.sub(QUOTED + '|' + STAMP, lambda m: m['stamp'] or m[0], args)
        if name == 'execve':
            executable = re.fullmatch(EXEC, args)
            if not executable:
                raise ValueError('exec argv/environment dialect')
        elif '/*' in args or '*/' in args:
            raise ValueError('unknown metadata annotation')
        if '/*' in result or '*/' in result:
            raise ValueError('unknown result annotation')
        if name in RAW_ARITY:
            raw_args = args.split(', ')
            if len(raw_args) != RAW_ARITY[name] or not all(re.fullmatch(r'0x[0-9a-f]+|[0-9]+', a) for a in raw_args):
                raise ValueError('unknown raw argument dialect')
        if name in ('exit', 'exit_group'):
            if not re.fullmatch(r'[0-9]{1,3}', args) or result != '?':
                raise ValueError('exit call')
            return  # A syscall intent is not the mandatory terminal event.
        if name in ('fork', 'vfork', 'clone', 'clone3'):
            if name in ('clone', 'clone3'):
                flags = re.search(r'(?:^|[ {,])flags=([A-Z0-9_|]+)(?:[,}]|$)', args)
                if not flags or not set(flags[1].split('|')) <= FLAGS | {'0'}:
                    raise ValueError('unknown clone flags/thread/parent relation')
            elif args:
                raise ValueError('fork arguments')
            if re.fullmatch(r'-1 E[A-Z0-9]+ \([^\n]*\)', result):
                if notice is not None:
                    raise ValueError('attach on failed clone')
                return
            if not re.fullmatch(r'[1-9][0-9]*', result):
                raise ValueError('child PID dialect')
            child = int(result)
            if notice is not None and child != notice:
                raise ValueError('embedded attach/return mismatch')
            target = self.node(child)
            if child == pid or child == self.root or target['parent'] is not None:
                raise ValueError('duplicate/cyclic child')
            target['parent'] = pid
        elif name == 'execve':
            if result != '0':
                if re.fullmatch(r'-1 E[A-Z0-9]+ \([^\n]*\)', result):
                    return
                raise ValueError('exec result')
            path = executable[1]
            if self.root is None:
                if path != '/usr/bin/bwrap' or node['parent'] is not None:
                    raise ValueError('root exec')
                self.root = pid
            elif path != '/runtime/bin/python3' or self.worker is not None or pid == self.root:
                raise ValueError('unexpected exec')
            else:
                if not re.search(r'"/code/artifact-worker.py", "--probe"\], ', args):
                    raise ValueError('worker invocation')
                self.worker = pid
            if len(node['execs']) >= 2:
                raise ValueError('exec bound')
            node['execs'].append(path)
        elif not re.fullmatch(r'(?:-?[0-9]+|0x[0-9a-f]+)(?:[ <][^\n]*)?|\? ERESTART[A-Z]+ \([^\n]*\)', result):
            raise ValueError('unknown passive return state')

    def finish(self, complete):
        if self.buffer or self.pending or self.interrupted:
            self.fail('truncated-or-unpaired')
        if not complete:
            self.fail('capture-incomplete')
        if self.root is None or self.worker is None:
            self.fail('missing-helper-or-worker-exec')
        for pid, node in self.nodes.items():
            if not node['seen'] or node['terminal'] is None:
                self.fail('missing-terminal')
            chain, current = set(), pid
            while current != self.root:
                if current in chain or current not in self.nodes or current is None:
                    self.fail('unconnected-or-cyclic-lineage'); break
                chain.add(current)
                current = self.nodes[current]['parent']
        if self.root in self.nodes and self.nodes[self.root]['parent'] is not None:
            self.fail('root-parent')
        complete_graph = self.error is None
        return dict(schema='ak5597-observation-lineage.v1', dialect=DIALECT,
                    status='source-dialect-complete' if complete_graph else 'inconclusive',
                    calibrated=False, verifiedRuntimeLineage=False, error=self.error,
                    rootPid=self.root, workerPid=self.worker, events=self.events, signals=self.signals,
                    allTerminal=complete_graph,
                    allExitZero=complete_graph and all(n['terminal'] == 0 for n in self.nodes.values()),
                    processes=[dict(pid=p, **n) for p, n in sorted(self.nodes.items())],
                    namespaceChildren=[dict(parentPid=p, namespacePid=n, tracePid=c)
                                       for (p, n), c in sorted(self.namespace_children.items())],
                    helperReapedByDriver=False, descendantSettlementCertified=False)
