"""Guest mount observations: exact base plus bwrap PROC_COVERS. Same predicates as
artifact-provision-contract.validate_mounts (device match, readonly flags). No extra mounts.
Not a 1GiB tmpfs check; work size remains the reviewed 128 MiB envelope.
"""
PROC_COVERS = ('/proc/sys', '/proc/sysrq-trigger', '/proc/irq', '/proc/bus')
PROC_FLAGS = frozenset(('ro', 'nosuid', 'nodev', 'noexec'))
PROC_FORBIDDEN = frozenset(('rw', 'suid', 'dev', 'exec'))


def parse_mountinfo(text):
    mounts = {}
    for line in text.splitlines():
        before, after = line.rstrip().split(' - ')
        fields, rest = before.split(), after.split()
        prop = fields[6:]
        if any(x.startswith(('shared:', 'master:', 'propagate_from:')) for x in prop):
            raise ValueError('mount propagation')
        point = fields[4]
        if point in mounts:
            raise ValueError('duplicate mount')
        mounts[point] = {
            'fs': rest[0],
            'options': fields[5].split(','),
            'super': rest[2].split(',') if len(rest) > 2 else [],
            'procRoot': fields[3],
            'procDevice': fields[2],
        }
    return mounts


def validate_mounts(mounts, base):
    actual = set(mounts)
    unknown, missing = actual - set(base) - set(PROC_COVERS), set(base) - actual
    if unknown or missing:
        bits = sum(1 << i for i, point in enumerate(PROC_COVERS) if point in actual)
        raise ValueError('mount surface', bits, min(len(unknown), 999), min(len(missing), 999))
    for point, m in mounts.items():
        proc = point == '/proc' or point in PROC_COVERS
        desired = 'rw' if point == '/work' else 'ro'
        if desired not in m['options'] or ('ro' if desired == 'rw' else 'rw') in m['options']:
            raise ValueError('observed mount mode')
        if proc:
            opts = set(m['options'])
            if m['fs'] != 'proc' or not PROC_FLAGS <= opts or opts & PROC_FORBIDDEN:
                raise ValueError('protective proc flags/type')
            expected_root = '/' if point == '/proc' else point[5:]
            if m['procRoot'] != expected_root:
                raise ValueError('protective proc root')
            maj, _, minr = m['procDevice'].partition(':')
            if not maj.isdigit() or not minr.isdigit() or int(maj) > 2**32 - 1 or int(minr) > 2**32 - 1:
                raise ValueError('protective proc device syntax')
        elif m['fs'] == 'proc':
            raise ValueError('unexpected proc filesystem')
    for point in actual & set(PROC_COVERS):
        if mounts[point]['procDevice'] != mounts['/proc']['procDevice']:
            raise ValueError('protective proc device mismatch')
    if mounts['/work']['fs'] != 'tmpfs':
        raise ValueError('observed tmpfs')
    return True
