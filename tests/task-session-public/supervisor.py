# Unshipped resource constructor seam; no fake worker, policy or admission verdict.
import fcntl,hashlib,importlib.util,json,os,pathlib,sys
root=pathlib.Path(sys.argv[1]); c=json.loads((root/'public-fixture.json').read_text())
p=pathlib.Path(c['owner'])/'scripts/ak-task-session-supervisor.py'
s=importlib.util.spec_from_file_location('owner_supervisor',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
def observe(value):
    kind=value.get('kind',value.get('protocol',value.get('schema')))
    if kind not in ['ADMISSION_RESULT','T1_PUBLISHED','CLOSED']:return
    policy=json.loads((pathlib.Path(c['owner'])/'policy/ak-runtime-access.json').read_text())
    lock=pathlib.Path(policy['admission_gate']['lock_directory'])/('db-'+hashlib.sha256(policy['database']['path'].encode()).hexdigest()+'.lock')
    fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);available=True;fcntl.flock(fd,fcntl.LOCK_UN)
        except BlockingIOError:available=False
    finally:os.close(fd)
    with (root/'public-custody.jsonl').open('a') as out:out.write(json.dumps({'kind':kind,'available':available,'lockBytes':lock.stat().st_size})+'\n')
original_send,original_receive=m.send,m.receive
def send(channel,value,deadline):
    original_send(channel,value,deadline);observe(value)
def receive(channel,deadline):
    value=original_receive(channel,deadline);observe(value);return value
m.send,m.receive=send,receive
request=m.parse(sys.stdin.buffer.read(m.MAX_FRAME+1))
mode=sys.argv[2] if len(sys.argv)==3 else 'supervise'
assert mode in ('supervise','recover')
# Observation only: count actual native process starts, never replace worker verdicts.
original_popen=m.subprocess.Popen
def popen(argv,*args,**kwargs):
    if argv[0]==c['bindings']['worker']['path']:
        with (root/'public-native-starts.jsonl').open('a') as out:out.write(json.dumps({'mode':mode,'argv':argv})+'\n')
    return original_popen(argv,*args,**kwargs)
m.subprocess.Popen=popen
try:
    supervisor=m.Supervisor(pathlib.Path(c['owner'])/'policy/ak-runtime-access.json',pathlib.Path(c['host']),pathlib.Path(c['ns']),pathlib.Path(c['owner'])/'docs/project/contracts/task-session-protocol-v1.json')
    result=supervisor.startup(request) if mode=='supervise' else supervisor.recover(request)
    (root/('public-supervisor-result.json' if mode=='supervise' else 'public-recovery-result.json')).write_text(m.canonical(result).decode())
    if mode=='recover':print(m.canonical({'ok':True,'result':result}).decode())
except Exception as error:
    if mode!='recover':raise
    print(json.dumps({'ok':False,'reason':str(error)}));sys.exit(78)
