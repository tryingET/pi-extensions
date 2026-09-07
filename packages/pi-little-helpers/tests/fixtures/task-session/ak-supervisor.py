#!/usr/bin/env python3
"""Fixed cooperative Linux T0–T2 supervisor. Never a general exec/fd broker."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import struct
import subprocess
import sys
import time

MAX_FRAME = 1048576
POLICY = Path('/home/tryinget/ai-society/softwareco/owned/agent-kernel/policy/ak-runtime-access.json')
HOST = Path('/home/tryinget/.local/libexec/pi-task-sessions/host-v1')
SCHEMA = Path(__file__).resolve().parent.parent / 'docs/project/contracts/task-session-protocol-v1.json'


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def parse(raw):
    require(0 < len(raw) <= MAX_FRAME, 'frame bounds')
    def pairs(entries):
        out = {}
        for k, v in entries:
            require(k not in out and k.isascii(), 'duplicate or non-ASCII key')
            out[k] = v
        return out
    def not_number(_):
        raise ValueError('float/nonfinite number')
    value = json.loads(raw.decode('utf-8', errors='strict'), object_pairs_hook=pairs,
                       parse_float=not_number, parse_constant=not_number)
    def bound(v, depth=0):
        require(depth <= 16, 'depth exceeded')
        if isinstance(v, str):
            require(len(v.encode('utf-8')) <= 65536, 'string exceeded')
        elif type(v) is int:
            require(0 <= v <= 9007199254740991, 'integer exceeded')
        elif isinstance(v, (list, dict)):
            require(len(v) <= 4096, 'container exceeded')
            for item in (list(v.keys()) + list(v.values()) if isinstance(v, dict) else v):
                bound(item, depth + 1)
    bound(value)
    return value


def validate(value, schema, root):
    """Closed JSON Schema subset used by our pinned schema; no optional package."""
    if '$ref' in schema:
        require(schema['$ref'].startswith('#/$defs/'), 'external schema ref')
        validate(value, root['$defs'][schema['$ref'].split('/')[-1]], root)
    if 'const' in schema:
        require(type(value) is type(schema['const']) and value == schema['const'], 'const')
    if 'enum' in schema:
        require(value in schema['enum'], 'enum')
    if 'type' in schema:
        types = {'object': dict, 'array': list, 'string': str, 'integer': int, 'boolean': bool, 'null': type(None)}
        require(type(value) is types[schema['type']], 'type')
    if isinstance(value, dict):
        require(all(k in value for k in schema.get('required', [])), 'missing field')
        props = schema.get('properties', {})
        if schema.get('additionalProperties') is False:
            require(all(k in props for k in value), 'unknown field')
        for k, v in value.items():
            if k in props:
                validate(v, props[k], root)
            elif isinstance(schema.get("additionalProperties"), dict):
                validate(v, schema["additionalProperties"], root)
    if isinstance(value, str):
        require(len(value) >= schema.get('minLength', 0) and len(value) <= schema.get('maxLength', 65536), 'string bounds')
        if 'pattern' in schema:
            require(re.fullmatch(schema['pattern'], value) is not None, 'pattern')
    if type(value) is int:
        require(value >= schema.get('minimum', 0) and value <= schema.get('maximum', 9007199254740991), 'integer bounds')
    if isinstance(value, list):
        require(len(value) <= schema.get('maxItems', 4096), 'array bounds')
        for item in value:
            if 'items' in schema:
                validate(item, schema['items'], root)
    for part in schema.get('allOf', []):
        validate(value, part, root)
    if 'if' in schema:
        try:
            validate(value, schema['if'], root)
        except ValueError:
            pass
        else:
            validate(value, schema['then'], root)
    if 'oneOf' in schema:
        passed = 0
        for part in schema['oneOf']:
            try:
                validate(value, part, root)
                passed += 1
            except ValueError:
                pass
        require(passed == 1, 'oneOf')


def remaining(deadline):
    value = deadline / 1000 - time.time()
    require(value > 0, 'startup deadline')
    return value


def receive(channel, deadline):
    def exact(size):
        result = bytearray()
        while len(result) < size:
            channel.settimeout(remaining(deadline))
            data = channel.recv(size - len(result))
            require(data, 'private channel lost')
            result.extend(data)
        return bytes(result)
    length = struct.unpack('>I', exact(4))[0]
    require(0 < length <= MAX_FRAME, 'frame bounds')
    return parse(exact(length))


def send(channel, value, deadline):
    body = canonical(value)
    require(len(body) <= MAX_FRAME, 'frame bounds')
    channel.settimeout(remaining(deadline))
    channel.sendall(struct.pack('>I', len(body)) + body)


def private_path(path, directory=False):
    # All components checked; no caller HOME/XDG or symlink-based alternate domain.
    for p in [path, *path.parents]:
        info = p.lstat()
        require(not stat.S_ISLNK(info.st_mode), 'symlink path')
        require(info.st_uid in (0, os.getuid()) and info.st_mode & 0o022 == 0, 'unsafe path owner/mode')
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'path kind')
    return info


def private_read(path):
    before = private_path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        after = os.fstat(fd)
        require((before.st_dev, before.st_ino) == (after.st_dev, after.st_ino) and after.st_size <= MAX_FRAME, 'file identity/size')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            data = stream.read(MAX_FRAME + 1)
        require(len(data) <= MAX_FRAME, 'file bounds')
        return data
    finally:
        os.close(fd)


def immutable(path, value):
    data = canonical(value) + b'\n'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        with os.fdopen(os.dup(fd), 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)
    sync_directory(path.parent)


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def message(kind, binding, body):
    return {'protocol': 'ak.task-session.v1', 'kind': kind, 'binding': binding, 'body': body}


class Supervisor:
    """Explicit production identity. Tests construct private synthetic identities, never flags."""
    def __init__(self, policy_path, host_path, state_root, schema_path):
        self.policy_path, self.host, self.root = policy_path, host_path, state_root
        self.schema = parse(private_read(schema_path))
        self.schema_hash = hashlib.sha256(private_read(schema_path)).hexdigest()
        self.policy_bytes = private_read(policy_path)
        self.policy = parse(self.policy_bytes)
        p = self.policy
        require(p['schema_version'] == 1, 'policy version')
        require(p['task_session']['bulk_recovery_suspended'] is True, 'bulk recovery custody missing')
        require(p['status'] == 'normal' and p['operator_entrypoint']['kind'] == 'exclusive_runtime_gate', 'policy unavailable')
        require(p['admission_gate']['protocol'] == 'flock_exclusive_v1' and p['admission_gate']['gates_reads_and_writes'] is True, 'gate identity')
        require(p['admission_gate']['lock_identity'] == 'sha256_of_canonical_database_path'
                and p['admission_gate']['location_kind'] == 'stable_home_state', 'lock domain')
        require(re.fullmatch('[a-f0-9]{64}', p['task_session']['host_build_digest']), 'host build identity')
        self.binary = Path(p['approved_binary']['path'])
        self.db = Path(p['database']['path'])
        require(self.db.is_absolute() and self.db.resolve() == self.db, 'database canonical identity')
        info = private_path(self.db)
        self.db_identity = digest({'path': str(self.db), 'device': info.st_dev, 'inode': info.st_ino})
        require(p['task_session']['protocol_sha256'] == self.schema_hash, 'protocol identity')
        require(hashlib.sha256(private_read(Path(__file__).resolve())).hexdigest() == p['task_session']['supervisor_sha256'], 'supervisor identity')
        self.validate_identity()
        lock_id = hashlib.sha256(str(self.db).encode()).hexdigest()
        self.lock_path = Path(p['admission_gate']['lock_directory']) / f'db-{lock_id}.lock'
        private_path(self.lock_path)
        self.lock = os.open(self.lock_path, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
        self.lock_identity = os.fstat(self.lock)
        private_path(self.root, True)

    def validate_identity(self):
        require(private_read(self.policy_path) == self.policy_bytes, 'policy changed')
        # Binaries may exceed wire frame size: hash in bounded chunks, never execute for identity.
        for path, expected in [(self.binary, self.policy['approved_binary']['sha256']), (self.host, self.policy['task_session']['host_sha256'])]:
            private_path(path)
            with path.open('rb') as stream:
                actual = hashlib.file_digest(stream, 'sha256').hexdigest()
            require(actual == expected, 'executable identity')
        info = private_path(self.db)
        require(digest({'path': str(self.db), 'device': info.st_dev, 'inode': info.st_ino}) == self.db_identity, 'database changed')

    def acquire(self, deadline):
        while True:
            try:
                fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(min(.01, remaining(deadline)))
        # T0. No namespace mutex is held or acquired from this point through T2.
        self.validate_identity()
        info = private_path(self.lock_path)
        require((info.st_dev, info.st_ino) == (self.lock_identity.st_dev, self.lock_identity.st_ino), 'lock inode changed')

    def spawn(self, argv):
        local, child = socket.socketpair()
        process = subprocess.Popen(argv, stdin=child, stdout=self.lock, stderr=subprocess.DEVNULL,
            close_fds=True, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'}, start_new_session=False)
        child.close()
        return local, process

    def worker(self, binding, admission, recovery, deadline):
        channel, process = self.spawn([str(self.binary), '-d', str(self.db), 'task-session', 'owner-private'])
        send(channel, {'protocol': 'ak.task-session.worker.v1', 'binding': binding, 'admission': admission, 'recovery': recovery}, deadline)
        result = receive(channel, deadline)
        require(process.wait(timeout=remaining(deadline)) == 0, 'native result unresolved')
        channel.close()
        self.validate_identity()
        return result

    def startup(self, request):
        validate(request, self.schema['$defs']['startup_request'], self.schema)
        deadline = request['startup_deadline_ms']
        require(remaining(deadline) <= 120, 'startup budget exceeds 120 seconds')
        directory = self.root / 'attempts' / request['attempt'] / request['incarnation']
        private_path(directory, True)
        require(not (directory / 'ak-started.json').exists(), 'incarnation already entered')
        immutable(directory / 'ak-started.json', request)
        channel, host = self.spawn([str(self.host)])
        seed = {'schema': 'pi.task-session.host-bootstrap.v1', 'attempt': request['attempt'], 'incarnation': request['incarnation'],
            'startupDeadline': deadline, 'actor': request['actor'], 'leaseSeconds': request['lease_seconds'],
            'baselineDigest': request['baseline_digest'], 'akBinaryDigest': self.policy['approved_binary']['sha256'],
            'policyDigest': hashlib.sha256(self.policy_bytes).hexdigest(), 'databaseIdentity': self.db_identity,
            'hostBuildDigest': self.policy['task_session']['host_build_digest']}
        send(channel, seed, deadline)
        prepared = receive(channel, deadline)
        validate(prepared, self.schema, self.schema)
        require(prepared['kind'] == 'PREPARED', 'phase mismatch')
        binding, body = prepared['binding'], prepared['body']
        for key in ['attempt', 'incarnation', 'request', 'semantic_digest', 'reservation', 'profile_digest', 'raw_envelope_digest']:
            require(binding[key] == request[key], 'prepared binding mismatch')
        for key, seed_key in [('ak_binary_digest','akBinaryDigest'), ('policy_digest','policyDigest'), ('database_identity','databaseIdentity'), ('host_build_digest','hostBuildDigest')]:
            require(binding[key] == seed[seed_key], 'prepared owner identity mismatch')
        for key in ['task_id', 'repo', 'actor', 'lease_seconds', 'baseline_digest', 'startup_deadline_ms']:
            require(body[key] == request[key], 'prepared task mismatch')
        self.acquire(deadline)
        admission_request = {k: body[k] for k in ['task_id','repo','actor','lease_seconds','baseline_digest','startup_deadline_ms']}
        result = self.worker(binding, admission_request, None, deadline)
        admission = message('ADMISSION_RESULT', binding, result)
        validate(admission, self.schema, self.schema)
        immutable(directory / 'ak-admission.json', admission)
        send(channel, admission, deadline)
        t1 = receive(channel, deadline)
        validate(t1, self.schema, self.schema)
        require(t1['kind'] == 'T1_PUBLISHED' and t1['binding'] == binding, 'T1 binding')
        require(t1['body']['admission_digest'] == digest(admission), 'T1 admission mismatch')
        if t1['body']['outcome'] == 'ADMITTED':
            require(result['outcome'] == 'ADMITTED' and result['effects'] == 'committed_verified', 'T1 false admission')
        raw = private_read(directory / 't1.json')
        require(raw in (canonical(t1), canonical(t1)+b'\n'), 'durable T1 mismatch')
        fd = os.open(directory / 't1.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        sync_directory(directory)
        self.validate_identity()
        if t1['body']['outcome'] == 'ADMITTED':
            remaining(deadline)
        # T2 is the ONLY explicit startup unlock site. No finally/EOF/timeout unlock.
        fcntl.flock(self.lock, fcntl.LOCK_UN)
        closed = message('CLOSED', binding, {'outcome': t1['body']['outcome'], 't1_digest': digest(t1)})
        send(channel, closed, deadline)
        channel.close()
        os.close(self.lock)
        return {'protocol':'ak.task-session.supervisor-result.v1','outcome':t1['body']['outcome'],
                'effects':result['effects'],'dispatch':'not_observed'}

    def recover(self, request):
        validate(request, self.schema['$defs']['recovery_request'], self.schema)
        directory = self.root / 'attempts' / request['attempt'] / request['incarnation']
        private_path(directory, True)
        # These receipts are supplied by their owners OUTSIDE AK locking; no waiting
        # for host/descendants/effects inside the global interval.
        admission = parse(private_read(directory / 'ak-admission.json'))
        validate(admission, self.schema, self.schema)
        require(admission['binding']['attempt'] == request['attempt'] and admission['binding']['incarnation'] == request['incarnation'], 'recovery attempt binding')
        require(admission['body']['claim'] == request['claim'], 'recovery claim differs from preserved tuple')
        receipts = []
        for name, schema_name in [('host-closure.json','host_closure'), ('effect-disposition.json','effect_disposition')]:
            receipt = parse(private_read(directory / name))
            validate(receipt, self.schema['$defs'][schema_name], self.schema)
            require(receipt['attempt']==request['attempt'] and receipt['incarnation']==request['incarnation'], 'closure binding')
            receipts.append(digest(receipt))
        require(not (directory / 'ak-recovery-started.json').exists(), 'recovery already attempted; no replay')
        immutable(directory / 'ak-recovery-started.json', request)
        deadline = int(time.time()*1000)+30000
        self.acquire(deadline)
        result = self.worker(admission['binding'], None, {'claim':request['claim'], 'host_closure_digest':receipts[0], 'effect_disposition_digest':receipts[1]}, deadline)
        immutable(directory / 'ak-recovery-result.json', result)
        # All surviving host/native dispatch capabilities have owner closure first.
        fcntl.flock(self.lock, fcntl.LOCK_UN)
        os.close(self.lock)
        return result


def main():
    require(sys.platform == 'linux' and len(sys.argv)==2 and sys.argv[1] in ('supervise','recover'), 'fixed supervisor invocation required')
    root = Path(pwd.getpwuid(os.getuid()).pw_dir) / '.local/state/pi-task-sessions'
    request = parse(sys.stdin.buffer.read(MAX_FRAME+1))
    supervisor = Supervisor(POLICY, HOST, root, SCHEMA)
    result = supervisor.startup(request) if sys.argv[1]=='supervise' else supervisor.recover(request)
    print(canonical(result).decode())


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No body/credential diagnostics, cleanup, force unlock, retry or claim inference.
        print('task-session stopped; inspect retained custody/effects; no automatic recovery', file=sys.stderr)
        sys.exit(78)
