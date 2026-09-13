"""Provision-only schemas and argv. References are attribution, never admission."""
import hashlib
import os
import re

LABEL = 'ak5597-offline-provisioning'
GIB = 1024 ** 3
INPUT_MAX = 256 * 1024 ** 2
LOG_MAX = 8 * 1024 ** 2
FREEZE = 'fe77af1fde18998d88dc0062cdf7ea910a46897955df6bc4f23b05e9d4501240'
BASE = {
    'artifact-contract.py': '336e0aa8433d8b84f86a07c677bd73349d812324c3b7c156ba3217d5ce881543',
    'artifact-driver.py': 'c4dfc47f1bd97a0bba736097dd839e1745b68713be731adfae54efe9dc11fc82',
}
NEW = ('artifact-provision-contract.py', 'artifact-provision-tree.py',
       'artifact-provision-lifetime.py', 'artifact-provision-worker.py', 'artifact-provision.py')
CODE = tuple(BASE) + NEW
WORKER_CODE = ('artifact-contract.py',) + NEW[:-1]
ROOTS = {
    'package': ('/inputs/package.json', 'd68798bd253930de8391d728b1d73e86fa870b789138de17da5a7cca8f87d560'),
    'lock': ('/inputs/package-lock.json', '2e37ccd22b23a8cc3d0f19aa8eaa389700eb8e184e892e4207e4ee2c40b81606'),
    'node': ('/runtime/bin/node', '81925c0995b5c1427b5d538e6a90ca2fdc4daffb786b09af749beaf7369d4e90'),
    'manifest': ('/inputs/acquisition.json', C.INPUT_SHA256),
    'seed': ('/inputs/npm-12.0.2.tgz', '5dbb86c71d07a1957f2e90734092dd6a58bdcd9ebc2d8d41ca1c6e6a21d364e1'),
}
NS = ('user', 'pid', 'mnt', 'ipc', 'uts', 'net')
PROC_COVERS = ('/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus')
ENV = dict(HOME='/work/home', TMPDIR='/work/tmp', PATH='/runtime/bin',
           npm_config_userconfig='/work/config/user.npmrc',
           npm_config_globalconfig='/work/config/global.npmrc',
           npm_config_cache='/work/cache', npm_config_prefix='/work/home',
           npm_config_logs_dir='/work/logs', npm_config_logs_max='0')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def review(obj):
    C.keys(obj, 'schema task label mode authorizationReference predecessorSha256 '
           'codeSha256 driverPythonSha256 bwrapSha256 inventoryPath inventorySha256 '
           'scratchRunsRoot exportParent exportName')
    C.require((obj['schema'], obj['task'], obj['label'], obj['mode']) ==
              ('ak5597-offline-provision-review.v1', 5597, LABEL, 'provision')
              and type(obj['task']) is int, 'provision review identity')
    C.require(obj['predecessorSha256'] == FREEZE, 'predecessor')
    ref = obj['authorizationReference']
    C.require(type(ref) is str and 1 <= len(ref) <= 256 and
              all(32 <= ord(c) < 127 for c in ref), 'external admission reference')
    C.require(type(obj['codeSha256']) is dict and set(obj['codeSha256']) == set(CODE), 'code set')
    for value in obj['codeSha256'].values():
        C.digest(value)
    C.require(all(obj['codeSha256'][k] == v for k, v in BASE.items()), 'unchanged utility pins')
    for k in ('driverPythonSha256', 'bwrapSha256', 'inventorySha256'):
        C.digest(obj[k])
    C.canonical_path(obj['inventoryPath'])
    for key in ('scratchRunsRoot', 'exportParent'):
        C.keys(obj[key], 'path dev ino')
        C.canonical_path(obj[key]['path'])
        C.integer(obj[key]['dev'], 0, 2**64 - 1)
        C.integer(obj[key]['ino'], 1, 2**64 - 1)
    C.require(C.leaf(obj['exportName']).startswith('ak5597-offline-provisioning-'), 'export name')
    return obj


def inventory(obj, hashes):
    C.keys(obj, 'schema task label rows')
    C.require(obj['schema'] == 'ak5597-offline-provision-inputs.v1' and
              type(obj['task']) is int and obj['task'] == 5597 and obj['label'] == LABEL, 'inventory identity')
    rows = obj['rows']
    C.require(type(rows) is list and 180 <= len(rows) <= 512, 'inventory rows')
    targets, sources, roles, total = set(), set(), {}, 0
    for r in rows:
        C.keys(r, 'source target bytes sha256 role')
        s, t, role = r['source'], r['target'], r['role']
        C.canonical_path(s); C.canonical_path(t); C.digest(r['sha256'])
        C.require(len(t) <= 256 and re.fullmatch(r'/[A-Za-z0-9_./+@-]+', t), 'target syntax')
        C.require(s not in sources and all(not s.startswith(x + '/') and not x.startswith(s + '/')
                                         for x in sources), 'source duplicate/overlap')
        C.require(t not in targets and all(not t.startswith(x + '/') and not x.startswith(t + '/')
                                         for x in targets), 'target duplicate/overlap')
        C.require(type(role) is str and re.fullmatch(r'[a-z]+(?::[A-Za-z0-9_.+-]+)?', role)
                  and role not in roles, 'unique role identity')
        sources.add(s); targets.add(t); roles[role] = r
        total += C.integer(r['bytes'], 0, INPUT_MAX)
        if r['bytes'] == 0:
            C.require(role.startswith('stdlib:') and t.endswith('/__init__.py') and
                      r['sha256'] == sha(b''), 'empty input')
        if role in ROOTS:
            C.require((t, r['sha256']) == ROOTS[role], 'exact root pin')
        elif role == 'python':
            C.require(t == '/runtime/bin/python3', 'python target')
        elif role.startswith('code:'):
            name = role[5:]
            C.require(name in WORKER_CODE and t == '/code/' + name and r['sha256'] == hashes[name], 'worker code')
        elif role.startswith('archive:'):
            C.require(t == '/inputs/archives/' + C.leaf(role[8:]) and t.endswith('.tgz'), 'archive target')
        elif role.startswith('stdlib:'):
            C.require(re.fullmatch(r'/runtime/lib/python3\.[0-9]+/(?:[A-Za-z0-9_.+-]+/)*[A-Za-z0-9_.+-]+', t)
                      and not any(p in ('site-packages', 'dist-packages') for p in t.split('/')), 'stdlib')
        elif role.startswith(('nodelib:', 'pythonlib:')):
            C.require(re.fullmatch(r'/(?:lib|lib64|usr/lib|runtime/lib)/(?:[A-Za-z0-9_.+-]+/)*[A-Za-z0-9_.+-]+', t)
                      and '.so' in t.rsplit('/', 1)[-1] and
                      not any(p in ('site-packages', 'dist-packages') for p in t.split('/')), 'ELF closure')
        else:
            C.require(False, 'unknown role')
    C.require(total <= INPUT_MAX and all(k in roles for k in (*ROOTS, 'python')) and
              roles['node']['bytes'] == 124679552 and
              sum(k.startswith('nodelib:') for k in roles) == 7 and
              any(k.startswith('stdlib:') for k in roles) and
              sum(k.startswith('archive:') for k in roles) == 165 and
              {k[5:] for k in roles if k.startswith('code:')} == set(WORKER_CODE), 'input closure')
    return rows


def verify_archives(rows, read):
    by_role = {r['role']: r for r in rows}
    m = C.manifest(read(by_role['manifest']))
    expected = {'archive:' + a['filename'] for a in m['networkArchives']}
    C.require({k for k in by_role if k.startswith('archive:')} == expected, 'exact archive set')
    for a in m['networkArchives']:
        raw = read(by_role['archive:' + a['filename']])
        C.require(hashlib.sha512(raw).hexdigest() == a['sha512Hex'] == C.sri(a['integrity']), 'archive SRI')
    seed = m['seededTooling'][0]
    raw = read(by_role['seed'])
    C.require(len(raw) == seed['bytes'] and sha(raw) == seed['sha256'] and
              hashlib.sha512(raw).hexdigest() == C.sri(seed['integrity']), 'intact seed')
    return m


def namespaces():
    return {k: os.readlink('/proc/self/ns/' + k) for k in NS}


def projection(rows, review_hash, inv_hash, hashes, parent_ns):
    return dict(schema='ak5597-offline-provision-data.v1', task=5597, label=LABEL,
                reviewSha256=review_hash, inventorySha256=inv_hash, codeSha256=hashes,
                parentNamespaces=parent_ns, rows=[{k: v for k, v in r.items() if k != 'source'} for r in rows])


def private_projection(obj, rows, export_parent):
    """Only exact approved guest target fields may share host path spelling."""
    data(obj)
    C.require(obj['rows'] == [{k: v for k, v in r.items() if k != 'source'} for r in rows],
              'projection input mismatch')
    raw = C.encode(obj)
    C.require(export_parent.encode() not in raw, 'export parent disclosed')
    # Do not scan approved guest targets as host-only data: loader aliases can
    # intentionally use a path that is also another row's host source spelling.
    remainder = dict(obj, rows=[{k: v for k, v in r.items() if k != 'target'} for r in obj['rows']])
    rest = C.encode(remainder)
    C.require(all(r['source'].encode() not in rest for r in rows), 'host-only source disclosed')
    return raw


def data(obj):
    C.keys(obj, 'schema task label reviewSha256 inventorySha256 codeSha256 parentNamespaces rows')
    C.require(obj['schema'] == 'ak5597-offline-provision-data.v1' and type(obj['task']) is int
              and obj['task'] == 5597 and obj['label'] == LABEL, 'data identity')
    C.digest(obj['reviewSha256']); C.digest(obj['inventorySha256'])
    C.require(type(obj['codeSha256']) is dict and set(obj['codeSha256']) == set(CODE), 'data code')
    for k, v in obj['codeSha256'].items():
        C.digest(v)
        if k in BASE:
            C.require(v == BASE[k], 'base source')
    C.keys(obj['parentNamespaces'], ' '.join(NS))
    for k, v in obj['parentNamespaces'].items():
        C.require(type(v) is str and re.fullmatch(k + r':\[[0-9]+\]', v), 'namespace identity')
    C.require(type(obj['rows']) is list, 'data rows')
    for r in obj['rows']:
        C.keys(r, 'target bytes sha256 role')
    inventory(dict(schema='ak5597-offline-provision-inputs.v1', task=5597, label=LABEL,
                   rows=[dict(r, source=r['target']) for r in obj['rows']]), obj['codeSha256'])
    return obj


def argv(mounted, config_fd, out_fd):
    args = ['/usr/bin/bwrap', '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
            '--unshare-net', '--as-pid-1', '--new-session', '--die-with-parent', '--cap-drop', 'ALL',
            '--hostname', 'ak5597-offline', '--clearenv', '--proc', '/proc', '--remount-ro', '/proc']
    for r, fd in mounted:
        executable = r['role'] in ('node', 'python') or r['role'].startswith(('nodelib:', 'pythonlib:'))
        args += ['--perms', '0500' if executable else '0400', '--ro-bind-data', str(fd), r['target']]
    args += ['--perms', '0400', '--ro-bind-data', str(config_fd), '/inputs/provision.json',
             '--perms', '0700', '--size', str(GIB), '--tmpfs', '/work',
             '--bind-fd', str(out_fd), '/out', '--chdir', '/work', '--remount-ro', '/']
    for k, v in ENV.items():
        args += ['--setenv', k, v]
    return args + ['--', '/runtime/bin/python3', '-I', '-S', '-B', '/code/artifact-provision-worker.py']


def commands(manifest):
    prefix = ['/runtime/bin/node', '--max-old-space-size=512', '/work/tooling/npm/bin/npm-cli.js']
    flags = ['--cache=/work/cache', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
             '--update-notifier=false']
    result = [(prefix + ['cache', 'add', '/inputs/archives/' + a['filename']] + flags, 120)
              for a in manifest['networkArchives']]
    return result + [(prefix + ['ci'] + flags + ['--include=dev', '--include=optional', '--no-bin-links'], 600)]


def validate_observation(obs, projected):
    C.keys(obs, 'pid ppid uid euid gid egid namespaces capabilities fds mounts inputs environment beforeNode')
    C.require(all(type(obs[key]) is int and obs[key] == 1000 for key in ('uid', 'euid', 'gid', 'egid')),
              'observed numeric identity')
    C.require(type(obs['pid']) is int and obs['pid'] == 1 and type(obs['ppid']) is int and
              obs['ppid'] == 0 and obs['beforeNode'] is True and obs['environment'] == ENV, 'observed PID1/env')
    C.keys(obs['namespaces'], ' '.join(NS))
    for k, v in obs['namespaces'].items():
        C.require(type(v) is str and re.fullmatch(k + r':\[[0-9]+\]', v) and
                  v != projected['parentNamespaces'][k], 'observed namespace')
    C.keys(obs['capabilities'], 'CapInh CapPrm CapEff CapBnd CapAmb')
    C.require(all(type(v) is str and re.fullmatch('0{16}', v) for v in obs['capabilities'].values()), 'observed caps')
    C.keys(obs['fds'], '0 1 2')
    C.require(obs['fds']['0'] == '/dev/null' and all(type(obs['fds'][k]) is str and
              re.fullmatch(r'pipe:\[[0-9]+\]', obs['fds'][k]) for k in ('1', '2')), 'observed FDs')
    C.require(obs['inputs'] == projected['rows'], 'observed input byte pins')
    validate_mounts(obs['mounts'], projected['rows'])


def validate_mounts(mounts, rows):
    """Exact base plus only bwrap's four optional protective private-proc self-binds."""
    C.require(type(mounts) is dict, 'mount schema')
    base = {'/', '/proc', '/work', '/out', '/inputs/provision.json'} | {r['target'] for r in rows}
    actual = set(mounts)
    unknown, missing = actual - base - set(PROC_COVERS), base - actual
    if unknown or missing:
        bits = sum(1 << i for i, point in enumerate(PROC_COVERS) if point in actual)
        # Fixed finite presence bits and saturating counts, never raw unexpected paths.
        raise ValueError('mount surface', bits, min(len(unknown), 999), min(len(missing), 999))
    for point, m in mounts.items():
        proc = point == '/proc' or point in PROC_COVERS
        C.keys(m, 'fs options super procRoot procDevice' if proc else 'fs options super')
        C.require(type(m['fs']) is str and all(type(m[k]) is list and
                  all(type(v) is str for v in m[k]) for k in ('options', 'super')), 'mount schema')
        desired = 'rw' if point in ('/work', '/out') else 'ro'
        C.require(desired in m['options'] and ('ro' if desired == 'rw' else 'rw') not in m['options'], 'observed mount mode')
        if proc:
            C.require(m['fs'] == 'proc' and {'ro', 'nosuid', 'nodev', 'noexec'} <= set(m['options']) and
                      not {'rw', 'suid', 'dev', 'exec'} & set(m['options']), 'protective proc flags/type')
            C.require(type(m['procRoot']) is str and m['procRoot'] == ('/' if point == '/proc' else point[5:]),
                      'protective proc root')
            C.require(type(m['procDevice']) is str and
                      re.fullmatch(r'(?:0|[1-9][0-9]{0,9}):(?:0|[1-9][0-9]{0,9})', m['procDevice']) and
                      all(int(v) <= 2**32 - 1 for v in m['procDevice'].split(':')), 'protective proc device syntax')
        else:
            C.require(m['fs'] != 'proc', 'unexpected proc filesystem')
    for point in actual & set(PROC_COVERS):
        C.require(mounts[point]['procDevice'] == mounts['/proc']['procDevice'], 'protective proc device mismatch')
    # Readonly is a per-mount flag. A readonly proc bind may retain superblock rw.
    C.require(mounts['/work']['fs'] == 'tmpfs' and
              {'nosuid', 'nodev'} <= set(mounts['/work']['options']) and
              'size=1048576k' in mounts['/work']['super'], 'observed tmpfs/proc')


def settlement(row):
    C.keys(row, 'allChildrenSettled reaped termination')
    C.require(type(row['allChildrenSettled']) is bool and type(row['termination']) is bool, 'settlement booleans')
    C.integer(row['reaped'], 0, 2**31 - 1)


def verify_receipts(worker, pre, pre_raw, projected, projection_raw, manifest):
    binding = dict(reviewSha256=projected['reviewSha256'], inventorySha256=projected['inventorySha256'],
                   projectionSha256=sha(projection_raw), codeSha256=projected['codeSha256'],
                   inputSha256=C.INPUT_SHA256, proposedSha256={k: ROOTS[k][1] for k in ('package', 'lock')})
    C.keys(pre, 'schema binding observation')
    C.require(pre['schema'] == 'ak5597-offline-provision-pre-node.v2' and pre['binding'] == binding, 'pre-node binding')
    validate_observation(pre['observation'], projected)
    C.keys(worker, 'schema binding good error cancelled settlement rootFiles tree commands commandLogBytes preNodeSha256 qualification')
    C.require(worker['schema'] == 'ak5597-offline-provision-worker.v1' and worker['binding'] == binding and
              worker['preNodeSha256'] == sha(pre_raw) and worker['qualification'] is False and
              type(worker['good']) is bool and type(worker['cancelled']) is bool and
              (worker['error'] is None or type(worker['error']) is str and len(worker['error']) <= 128), 'worker identity')
    settlement(worker['settlement'])
    C.require(worker['settlement']['allChildrenSettled'], 'unknown PID1 settlement')
    C.integer(worker['commandLogBytes'], 0, LOG_MAX - 64 * 1024)
    C.keys(worker['rootFiles'], 'package.json package-lock.json')
    for role in ('package', 'lock'):
        r = worker['rootFiles'][ROOTS[role][0].rsplit('/', 1)[-1]]
        C.keys(r, 'sha256 unchanged')
        C.require(type(r['unchanged']) is bool and r['unchanged'] == (r['sha256'] == ROOTS[role][1]), 'root result')
        if r['sha256'] is not None:
            C.digest(r['sha256'])
    rows = worker['commands']; expected = commands(manifest)
    C.require(type(rows) is list and len(rows) <= 166, 'command receipt count')
    for i, r in enumerate(rows):
        C.keys(r, 'argvSha256 reason returncode adoptedReaped directStatusObserved settlement')
        C.require(r['argvSha256'] == sha(C.encode(expected[i][0])) and
                  r['reason'] in ('exited', 'launch-failed', 'cancelled', 'wall-or-deadman',
                                  'aggregate-log-limit', 'command-error') and type(r['directStatusObserved']) is bool, 'exact command order')
        C.integer(r['adoptedReaped'], 0, 2**31 - 1)
        if r['returncode'] is not None:
            C.integer(r['returncode'], -128, 255)
        settlement(r['settlement'])
        if i < len(rows) - 1:
            C.require(r['reason'] == 'exited' and r['returncode'] == 0 and
                      r['directStatusObserved'] and r['settlement']['allChildrenSettled'], 'continued after failure')
    if worker['tree'] is not None:
        tree = worker['tree']
        C.keys(tree, 'complete bytes sha256 entries inventoryBytes inventorySha256')
        C.require(tree['complete'] is True, 'tree completion')
        C.integer(tree['bytes'], 1024, GIB); C.integer(tree['entries'], 7, 100000)
        C.integer(tree['inventoryBytes'], 1, 32 * 1024 ** 2)
        C.digest(tree['sha256']); C.digest(tree['inventorySha256'])
    if worker['good']:
        C.require(not worker['cancelled'] and worker['error'] is None and worker['tree'] is not None and
                  len(rows) == 166 and all(r['unchanged'] for r in worker['rootFiles'].values()) and
                  all(r['reason'] == 'exited' and r['returncode'] == 0 and r['directStatusObserved'] and
                      r['settlement']['allChildrenSettled'] and not r['settlement']['termination'] for r in rows) and
                  not worker['settlement']['termination'], 'false worker success')
    return worker
