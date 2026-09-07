# A newly owned synthetic PTY, never Ghostty/desktop placement.
import json,os,pathlib,pty,subprocess,sys,time
root=pathlib.Path(sys.argv[1]);c=json.loads((root/'public-fixture.json').read_text());master,slave=pty.openpty()
p=subprocess.Popen(['/usr/bin/node','--import',str(pathlib.Path(__file__).with_name('view-loader.mjs')),c['runtime']+'/dist/task-session/viewer-entry.js',sys.argv[2]],stdin=slave,stdout=slave,stderr=slave,env={**os.environ,'TASK5480_FIXTURE_ROOT':str(root)},start_new_session=True)
os.close(slave)
(root/'public-viewer-pid.json').write_text(json.dumps({'pid':p.pid,'start':pathlib.Path('/proc/'+str(p.pid)+'/stat').read_text().split(') ')[1].split()[19]}))
# Keep the PTY master alive in a separate owned helper, allowing the transport command to return.
if os.fork(): os.close(master);sys.exit(0)
os.setsid()
null=os.open('/dev/null',os.O_RDWR)
for fd in (0,1,2): os.dup2(null,fd)
os.close(null)
try:
    with (root/'public-pty.log').open('wb') as log:
        while True:
            data=os.read(master,65536)
            if not data: break
            log.write(data);log.flush()
except OSError: pass
