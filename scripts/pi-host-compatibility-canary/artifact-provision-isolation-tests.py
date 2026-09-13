"""UNEXECUTED SOURCE. Separate fixture admission required; no runtime proof.
Future execution reads only four sibling source files, loading non-main definitions.
No package imports, real proc/namespace/process/signal operations or fixture writes.
Every exercised runtime I/O boundary uses explicit doubles, never ambient fallback.
The existing 53 fixtures are separate; this file does not discover or import them.
"""
import copy
from pathlib import Path
import os
import stat
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent


def load(name, **extra):
    path = HERE / name
    raw = path.read_bytes()
    if len(raw) > 50 * 1024:
        raise ValueError('fixture source bound')
    scope = dict(__name__='isolation_fixture_non_main', __file__=str(path), **extra)
    exec(compile(raw, str(path), 'exec'), scope)
    return NS(**scope)


C = load('artifact-contract.py')
P = load('artifact-provision-contract.py', C=C)
W = load('artifact-provision-worker.py')
H = load('artifact-provision.py')


def forbidden(*args, **kwargs):
    raise AssertionError('forbidden runtime effect')


class Latch:
    def __init__(self): self.pending = False
    def record(self, *_): self.pending = True
    def check(self):
        if self.pending: raise InterruptedError('synthetic cancellation')


def specimen():
    hashes = dict.fromkeys(P.CODE, 'a' * 64); hashes.update(P.BASE)
    rows = []
    def add(role, target, size=1, digest='a' * 64):
        rows.append(dict(role=role, target=target, bytes=size, sha256=digest,
                         source='/fixture/f' + str(len(rows))))
    for role, (target, digest) in P.ROOTS.items():
        add(role, target, 124679552 if role == 'node' else 1, digest)
    add('python', '/runtime/bin/python3')
    for name in P.WORKER_CODE: add('code:' + name, '/code/' + name, 1, hashes[name])
    for i in range(7): add('nodelib:lib' + str(i), '/lib/lib' + str(i) + '.so')
    add('stdlib:empty', '/runtime/lib/python3.11/x/__init__.py', 0, P.sha(b''))
    for i in range(165):
        name = 'sha256-' + format(i, '064x') + '.tgz'
        add('archive:' + name, '/inputs/archives/' + name)
    data = P.projection(rows, 'b'*64, 'c'*64, hashes, {k: k + ':[10]' for k in P.NS})
    points = {'/', '/proc', '/work', '/out', '/inputs/provision.json'} | {r['target'] for r in rows}
    mounts = {p: dict(fs='tmpfs', options=['rw' if p in ('/work', '/out') else 'ro'],
                      super=['rw']) for p in sorted(points)}
    mounts['/proc'] = dict(fs='proc', options=['ro', 'nosuid', 'nodev', 'noexec'],
                          super=['rw'], procRoot='/', procDevice='0:42')
    mounts['/work'].update(options=['rw', 'nosuid', 'nodev'], super=['size=1048576k'])
    obs = dict(pid=1, ppid=0, uid=1000, euid=1000, gid=1000, egid=1000,
               namespaces={k: k + ':[20]' for k in P.NS},
               capabilities={k: '0'*16 for k in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb')},
               fds={'0': '/dev/null', '1': 'pipe:[1]', '2': 'pipe:[2]'}, mounts=mounts,
               inputs=copy.deepcopy(data['rows']), environment=P.ENV.copy(), beforeNode=True)
    manifest = dict(networkArchives=[dict(filename=r['target'].rsplit('/', 1)[-1])
                                    for r in rows if r['role'].startswith('archive:')])
    return rows, data, obs, manifest


def settled(terminate=False, known=True):
    return dict(allChildrenSettled=known, reaped=0, termination=terminate)


def command(args):
    return dict(argvSha256=P.sha(C.encode(args)), reason='exited', returncode=0,
                adoptedReaped=0, directStatusObserved=True, settlement=settled())


def root_hashes():
    return {P.ROOTS[k][0].rsplit('/', 1)[-1]: dict(sha256=P.ROOTS[k][1], unchanged=True)
            for k in ('package', 'lock')}


def tree_summary():
    return dict(complete=True, bytes=10240, entries=7, sha256='d'*64,
                inventoryBytes=7, inventorySha256='e'*64)


def receipts(data, obs, manifest):
    raw = C.encode(data)
    binding = dict(reviewSha256=data['reviewSha256'], inventorySha256=data['inventorySha256'],
                   projectionSha256=P.sha(raw), codeSha256=data['codeSha256'],
                   inputSha256=C.INPUT_SHA256, proposedSha256={k: P.ROOTS[k][1] for k in ('package', 'lock')})
    pre = dict(schema='ak5597-offline-provision-pre-node.v2', binding=binding, observation=obs)
    worker = dict(schema='ak5597-offline-provision-worker.v1', binding=binding, good=True,
                  error=None, cancelled=False, settlement=settled(), rootFiles=root_hashes(),
                  tree=tree_summary(), commands=[command(a) for a, _ in P.commands(manifest)],
                  commandLogBytes=0, preNodeSha256=P.sha(C.encode(pre)), qualification=False)
    return pre, worker


class IsolationPort(unittest.TestCase):
    def test_prefix_and_unchanged_seven_code_guest_protocol(self):
        rows, data, _, manifest = specimen(); P.data(data)
        self.assertEqual(P.CODE, ('artifact-contract.py', 'artifact-driver.py',
            'artifact-provision-contract.py', 'artifact-provision-tree.py',
            'artifact-provision-lifetime.py', 'artifact-provision-worker.py', 'artifact-provision.py'))
        args = P.argv([(r, 100+i) for i, r in enumerate(rows)], 800, 801)
        original = args.copy(); wrapped = H.wrapped(args)
        self.assertEqual(wrapped[:7], ['/usr/bin/unshare', '--user', '--map-current-user',
                                      '--mount', '--propagation', 'private', '--'])
        self.assertEqual(wrapped[7:], original); self.assertEqual(args, original)
        self.assertFalse({'--fork', '--map-root-user', '--pid'} & set(wrapped[:7]))
        self.assertEqual(wrapped[-1], '/code/artifact-provision-worker.py')
        for bad in ([], ['/wrong-helper']):
            with self.assertRaises(ValueError): H.wrapped(bad)
        commands = P.commands(manifest)
        self.assertEqual(len(commands), 166)
        for i, (args, seconds) in enumerate(commands):
            self.assertEqual(args[:3], ['/runtime/bin/node', '--max-old-space-size=512',
                                       '/work/tooling/npm/bin/npm-cli.js'])
            self.assertTrue({'--offline', '--ignore-scripts', '--no-audit', '--no-fund',
                             '--update-notifier=false'} <= set(args))
            self.assertEqual(seconds, 120 if i < 165 else 600)
        self.assertTrue({'--include=dev', '--include=optional', '--no-bin-links'} <= set(commands[-1][0]))

    def test_actual_pin_open_uses_cloexec_no_follow(self):
        opened, closed = [], []
        fakeOS = NS(O_RDONLY=os.O_RDONLY, O_NOFOLLOW=os.O_NOFOLLOW, O_CLOEXEC=os.O_CLOEXEC,
                    O_NONBLOCK=os.O_NONBLOCK, close=closed.append)
        def opened_file(name, flags, *, dir_fd):
            opened.append((name, flags, dir_fd)); return 42
        fakeOS.open = opened_file
        # Patch the exec-created function's dictionary, not a copied NS attribute.
        with patch.dict(C.open_file.__globals__, os=fakeOS, open_dir=lambda path: 41,
                        regular=lambda fd, maximum: None):
            self.assertEqual(C.open_file('/usr/bin/unshare', 16*1024**2), 42)
        self.assertEqual(closed, [41]); self.assertEqual(opened[0][0::2], ('unshare', 41))
        self.assertEqual(opened[0][1], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)

    def pin_case(self, change=None):
        nodes = {path: copy.deepcopy(row) for pin in H.HOST_PINS for path, row in pin['chain'].items()}
        opened, live = [], {}
        def lstat(path):
            r = nodes[path]
            return NS(st_dev=r['dev'], st_ino=r['ino'], st_mode=r['mode'], st_uid=r['uid'], st_gid=r['gid'])
        def open_file(path, maximum):
            self.assertEqual(maximum, 16*1024**2)
            pin = next(p for p in H.HOST_PINS if p['resolved'] == path)
            fd = 90 + len(live); live[fd] = pin; return fd
        def fstat(fd):
            pin = live[fd]; row = lstat(pin['resolved'])
            row.st_size, row.st_mtime_ns, row.st_ctime_ns = pin['identity'][2:]
            return row
        fakeC = NS(**vars(C)); fakeC.open_file = open_file
        fakeC.read_fd = lambda fd, bound: live[fd]['sha256']
        fakeOS = NS(getuid=lambda:1000, geteuid=lambda:1000, getgid=lambda:1000, getegid=lambda:1000,
            lstat=lstat, fstat=fstat, readlink=lambda path:nodes[path]['link'],
            stat=lambda path, **kw:fstat(next(fd for fd,p in live.items() if p['resolved']==path)),
            path=NS(lexists=lambda path:False,
                    realpath=lambda path:next(p['resolved'] for p in H.HOST_PINS if p['path']==path)))
        # A digest-comparison double, explicitly NOT byte/hash/OS-pin proof.
        fakeHash = NS(sha256=lambda raw:NS(hexdigest=lambda:raw))
        if change: change(fakeOS, fakeC, nodes)
        with patch.dict(H.host_setup.__globals__, os=fakeOS, hashlib=fakeHash):
            H.host_setup(fakeC, {}, opened)
        return opened

    def test_four_host_pins_aliases_preload_and_mismatches(self):
        self.assertEqual([p['path'] for p in H.HOST_PINS], ['/usr/bin/unshare',
            '/lib64/ld-linux-x86-64.so.2', '/usr/lib/libc.so.6', '/etc/ld.so.cache'])
        self.assertEqual(self.pin_case(), [90, 91, 92, 93])
        changes = [lambda o,c,n:setattr(o, 'geteuid', lambda:0),
                   lambda o,c,n:setattr(o.path, 'lexists', lambda path:True),
                   lambda o,c,n:setattr(o.path, 'realpath', lambda path:'/wrong'),
                   lambda o,c,n:n['/lib64'].update(link='wrong'),
                   lambda o,c,n:n['/usr/bin'].update(mode=stat.S_IFDIR | 0o777)]
        for pin in H.HOST_PINS:
            path = pin['resolved']
            changes.extend([lambda o,c,n,p=path:n[p].update(uid=1000),
                            lambda o,c,n,p=path:n[p].update(ino=0),
                            lambda o,c,n,p=path:setattr(c, 'read_fd',
                                lambda fd,bound:'0'*64 if H.HOST_PINS[fd-90]['resolved']==p
                                else H.HOST_PINS[fd-90]['sha256'])])
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError): self.pin_case(change)

    def test_host_setup_is_first_preflight_checkpoint(self):
        events = []
        def stop(*args): events.append('host_setup'); raise ValueError('synthetic stop')
        with patch.dict(H.preflight.__globals__, host_setup=stop, os=NS(), sys=NS()):
            with self.assertRaisesRegex(ValueError, '^synthetic stop$'):
                H.preflight((C, None, P, None, None, {}, {}, None), 'a'*64, [], Latch())
        self.assertEqual(events, ['host_setup'])

    def test_worker_getters_strict_once_invalid_or_missing(self):
        getters = ('getuid', 'geteuid', 'getgid', 'getegid')
        for getter in getters:
            for value in (0, 1001, -1, 1000.0, '1000', True, False, None):
                calls = []
                fakeOS = NS(getpid=lambda:1, getppid=lambda:0, getcwd=lambda:'/work')
                for name in getters:
                    setattr(fakeOS, name, lambda n=name,v=value if name==getter else 1000:
                            (calls.append(n) or v))
                with patch.dict(W.observations.__globals__, os=fakeOS, open=forbidden, proc_read=forbidden):
                    with self.assertRaisesRegex(ValueError, '^worker numeric identity$') as caught:
                        W.observations(C, P, {})
                self.assertEqual(calls, list(getters))
                self.assertEqual(W.failure_code(caught.exception, 'OBSERVATIONS'), 'ValueError:OBS_NUMERIC_IDENTITY')
            delattr(fakeOS, getter)
            with patch.dict(W.observations.__globals__, os=fakeOS, open=forbidden, proc_read=forbidden):
                with self.assertRaises(AttributeError): W.observations(C, P, {})

    def test_actual_observations_all_guards_with_only_doubles(self):
        _, data, obs, _ = specimen(); reads, getters = [], []
        mount_raw = ''.join('%d 1 %s %s %s %s - %s none %s\n' % (
            i+10, m.get('procDevice', '0:99'), m.get('procRoot', '/'), point,
            ','.join(m['options']), m['fs'], ','.join(m['super']))
            for i,(point,m) in enumerate(obs['mounts'].items())).encode()
        status = ''.join(k + ': ' + v + '\n' for k,v in obs['capabilities'].items()).encode()
        def proc(path, maximum):
            reads.append((path, maximum))
            return {'/proc/self/status':status, '/proc/self/mountinfo':mount_raw}[path]
        fakeC = NS(**vars(C)); targets = {r['target']:r for r in data['rows']}
        fakeC.hash_file = lambda path, bound:(targets[path]['bytes'], targets[path]['sha256'], None)
        fakeP = NS(**vars(P)); fakeP.namespaces = lambda:obs['namespaces']
        fakeOS = NS(getpid=lambda:1, getppid=lambda:0, getcwd=lambda:'/work', environ=P.ENV.copy(),
                    listdir=lambda path:list(obs['fds']),
                    readlink=lambda path:obs['fds'][path.rsplit('/',1)[-1]])
        for field in ('uid', 'euid', 'gid', 'egid'):
            setattr(fakeOS, 'get'+field, lambda f=field:(getters.append(f) or 1000))
        fakeSys = NS(version_info=(3,11), flags=NS(isolated=True,no_site=True), dont_write_bytecode=True)
        with patch.dict(W.observations.__globals__, os=fakeOS, sys=fakeSys, proc_read=proc, open=forbidden):
            actual = W.observations(fakeC, fakeP, data)
        self.assertEqual(actual, obs); P.validate_observation(actual, data)
        self.assertEqual(getters, ['uid', 'euid', 'gid', 'egid'])
        self.assertEqual(reads, [('/proc/self/status',16384), ('/proc/self/mountinfo',512*1024)])

    def test_bound_identity_schema_rejects_invalid_missing_extra_and_old(self):
        _, data, obs, manifest = specimen(); pre, worker = receipts(data, obs, manifest)
        def verify(p, w): return P.verify_receipts(w, p, C.encode(p), data, C.encode(data), manifest)
        self.assertIs(verify(pre, worker), worker)
        mutations = [lambda p:p.update(schema='ak5597-offline-provision-pre-node.v1'),
                     lambda p:p.update(schema='ak5597-pre-node-observation-pre-node.v2'),
                     lambda p:p['observation'].update(extra=True)]
        for field in ('uid', 'euid', 'gid', 'egid'):
            mutations.append(lambda p,k=field:p['observation'].pop(k))
            for value in (0, 1001, -1, 1000.0, '1000', True, False, None):
                mutations.append(lambda p,k=field,v=value:p['observation'].update({k:v}))
        for mutate in mutations:
            p, w = copy.deepcopy((pre, worker)); mutate(p)
            w['preNodeSha256'] = P.sha(C.encode(p))  # Semantic rejection, NOT stale digest proxy.
            with self.subTest(mutation=mutate), self.assertRaises(ValueError): verify(p, w)

    def test_actual_run_continues_to_165_cache_ci_and_settled_tree(self):
        for mode in ('success', 'cancel-before-preparation', 'cancel-command', 'unknown-settlement', 'missing-getter'):
            _, data, obs, manifest = specimen(); events, writes, commands = [], {}, []
            latch = Latch(); fakeC = NS(**vars(C)); fakeP = NS(**vars(P))
            fakeC.open_dir = lambda path:42
            fakeC.owned_dir = lambda fd:None; fakeC.directory_names = lambda fd:[]
            fakeC.create = lambda *args:43
            fakeC.read_file = lambda path,*args:b'synthetic bytes, never extracted'
            def put(fd, name, raw, maximum=None):
                writes[name] = raw; events.append(name)
                if mode=='cancel-before-preparation' and name=='pre-node.json': latch.record()
            fakeC.put = put
            fakeP.verify_archives = lambda *args:(events.append('verify_archives') or manifest)
            def execute(args, seconds, *_):
                commands.append((args, seconds)); events.append('command')
                if mode=='cancel-command': latch.record()
                return command(args)
            def settle(terminate):
                events.append(('settle', terminate)); return settled(terminate, mode!='unknown-settlement')
            fakeL = NS(WALL=2700, Latch=lambda:latch, limits=lambda:events.append('limits'),
                       command=execute, settle=settle)
            fakeT = NS(TOP=('cache','config','home','install','logs','tmp','tooling'),
                       extract_seed=lambda *args:events.append('extract_seed'),
                       export_tree=lambda *args:(events.append('export_tree') or tree_summary()))
            fakeOS = NS(umask=lambda mode:None, close=lambda fd:None, fsync=lambda fd:None, environ={},
                        mkdir=lambda path,mode:events.append(('mkdir',path)))
            fakeSignal = NS(SIGTERM=15,SIGINT=2,SIGHUP=1,SIGALRM=14,SIGCHLD=17,SIG_DFL=0,
                            signal=lambda *args:None, alarm=lambda n:self.assertEqual(n,2700))
            def observe(*args):
                events.append('observations')
                if mode=='missing-getter':
                    fake = NS(getpid=lambda:1,getppid=lambda:0,getcwd=lambda:'/work')
                    with patch.dict(W.observations.__globals__, os=fake, proc_read=forbidden, open=forbidden):
                        return W.observations(C, P, data)
                return obs
            with patch.dict(W.run.__globals__, os=fakeOS, signal=fakeSignal, time=NS(monotonic=lambda:0),
                            bootstrap=lambda:(fakeC,fakeP,fakeT,fakeL,data,C.encode(data)),
                            observations=observe, roots=lambda *args:root_hashes(), open=forbidden):
                result = W.run()
            worker = C.decode(writes['worker.json'])
            self.assertEqual(result, 0 if mode=='success' else 1)
            self.assertIs(worker['good'], mode=='success'); self.assertFalse(worker['qualification'])
            self.assertEqual(len([e for e in events if isinstance(e,tuple) and e[0]=='settle']),1)
            if mode=='missing-getter':
                self.assertNotIn('pre-node.json', writes); self.assertEqual(worker['error'],'AttributeError')
            else:
                pre = C.decode(writes['pre-node.json'])
                self.assertEqual(pre['schema'],'ak5597-offline-provision-pre-node.v2')
            if mode in ('cancel-before-preparation','missing-getter'):
                self.assertNotIn('verify_archives',events); self.assertEqual(commands,[])
            else:
                self.assertLess(events.index('observations'),events.index('verify_archives'))
                self.assertLess(events.index('verify_archives'),events.index('extract_seed'))
                self.assertLess(events.index('extract_seed'),events.index('command'))
                self.assertEqual(commands, P.commands(manifest)[:1] if mode=='cancel-command' else P.commands(manifest))
                if mode=='unknown-settlement': self.assertNotIn('export_tree',events)
                else: self.assertLess(events.index(('settle',mode=='cancel-command')),events.index('export_tree'))
            if mode=='success':
                P.verify_receipts(worker,pre,writes['pre-node.json'],data,C.encode(data),manifest)

    def test_actual_operation_export_fd_exclusion_and_cancellation(self):
        modes = ('success','settled-failure','helper-unknown','helper-status-mismatch',
                 'cancel-before-helper','cancel-in-helper','cancel-in-copy','post-pin-failure')
        for mode in modes:
            rows,data,obs,manifest = specimen(); pre,worker = receipts(data,obs,manifest)
            events, closed, owned, pinfds, writes, passed = [], [], [], [], {}, []
            cancel=Latch(); mounted=[(r,100+i) for i,r in enumerate(rows)]
            config,tmp,export,bwrap,output = 800,810,811,812,813
            review=dict(exportName=P.LABEL+'-fixture',authorizationReference='SYNTHETIC-NOT-AUTHORITY')
            if mode=='settled-failure':
                worker.update(good=False,error='CommandFailure',commands=worker['commands'][:1],settlement=settled(True))
                worker['commands'][0]['returncode']=1
            def pins(c,r,fds):
                events.append('pins'); extra=list(range(900+len(pinfds),904+len(pinfds)))
                pinfds.extend(extra); fds.extend(extra); owned.extend(extra)
                if mode=='post-pin-failure' and len(pinfds)==12: raise ValueError('synthetic pin drift')
            def preflight(prepared,review_hash,fds,latch):
                events.append('preflight'); pins(prepared[0],review,fds)
                extra=[fd for _,fd in mounted]+[config,tmp,export,bwrap]
                fds.extend(extra); owned.extend(extra)
                return mounted,config,data,C.encode(data),manifest,tmp,export,bwrap,{}
            def helper(args,inherited,helper_tmp,latch,deadline):
                latch.check(); events.append('helper'); passed.append(inherited)
                self.assertEqual(args,H.wrapped(P.argv(mounted,config,output)))
                self.assertEqual(inherited,[fd for _,fd in mounted]+[config,output])
                self.assertFalse(set(inherited)&set(pinfds+[tmp,export,bwrap]))
                self.assertEqual((helper_tmp,deadline),('/fake/new-run/work/tmp',2700))
                if mode=='cancel-in-helper': latch.record()
                return dict(helperReaped=mode!='helper-unknown',reason='exited',cancelled=latch.pending,
                            returncode=1 if mode in ('settled-failure','helper-status-mismatch') else 0)
            def newdir(fd,name):
                events.append(name)
                if fd==tmp: owned.append(output); return output
                self.assertEqual(fd,export); return 814
            def copying(c,src,dst,name,maximum):
                events.append(('copy',name))
                if mode=='cancel-in-copy': cancel.record()
            fakeC=NS(**vars(C)); fakeC.new_dir=newdir
            fakeC.directory_names=lambda fd:['pre-node.json','worker.json','provisioned-tree.tar']
            fakeC.put=lambda fd,name,raw,*args:writes.__setitem__(name,raw)
            fakeC.create=lambda fd,name:816
            fakeT=NS(TAR_MAX=1024**3,validate_tar=lambda *args:(events.append('validate_tar') or tree_summary()))
            fakeL=NS(WALL=2700,helper=helper)
            identity=NS(st_dev=1,st_ino=2,st_size=3,st_mtime_ns=4,st_ctime_ns=5)
            def umask(mode_value):
                if mode=='cancel-before-helper': cancel.record()
            fakeOS=NS(fstat=lambda fd:identity,stat=lambda *a,**kw:identity,umask=umask,
                      close=closed.append,fsync=lambda fd:None,rename=lambda *a,**kw:None,
                      open=lambda *a,**kw:815,O_RDONLY=os.O_RDONLY,O_NOFOLLOW=os.O_NOFOLLOW,
                      O_CLOEXEC=os.O_CLOEXEC,environ={'TMPDIR':'/fake/new-run/work/tmp'})
            prepared=(fakeC,None,P,fakeT,fakeL,review,{},'/fake/source')
            with patch.dict(H.operation.__globals__,preflight=preflight,host_setup=pins,os=fakeOS,
                            time=NS(monotonic=lambda:0),copy_at=copying,
                            read_at=lambda c,fd,name,bound:C.encode(pre if name=='pre-node.json' else worker)):
                try: result=H.operation(prepared,data['reviewSha256'],cancel)
                except (ValueError,InterruptedError): result=False
            self.assertIs(result,mode=='success')
            self.assertEqual([fd for fd in closed if fd in owned],list(reversed(owned)))
            self.assertEqual(len(closed),len(set(closed)))
            self.assertEqual(len(passed),0 if mode=='cancel-before-helper' else 1)
            if mode in ('success','settled-failure','cancel-in-helper','cancel-in-copy'):
                receipt=C.decode(writes['export.json'])
                self.assertIs(receipt['good'],mode=='success'); self.assertTrue(receipt['complete'])
                self.assertFalse(receipt['qualification']); self.assertTrue(receipt['acceptancePending'])
                self.assertEqual(events[:6],['preflight','pins','provision-out','pins','helper','pins'])
                self.assertIn('validate_tar',events)
                self.assertEqual(receipt['supervision']['argvSha256'],P.sha(C.encode(H.wrapped(P.argv(mounted,config,output)))))
            else: self.assertEqual(writes,{})


if __name__ == '__main__':
    unittest.main()
