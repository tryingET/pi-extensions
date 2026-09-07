# Unpublished fixture: the actual owner supervisor, explicit synthetic identity only.
import importlib.util, pathlib, sys, json
sys.dont_write_bytecode=True
root=pathlib.Path(sys.argv[1])
source=pathlib.Path(__file__).with_name('ak-supervisor.py')
spec=importlib.util.spec_from_file_location('owner_supervisor',source)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
supervisor=m.Supervisor(root/'policy.json',root/'host',root,root/'protocol.json')
result=supervisor.startup(m.parse(sys.stdin.buffer.read(m.MAX_FRAME+1)))
print(json.dumps(result))
