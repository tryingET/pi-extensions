# Unpublished PTY fixture: no Ghostty, shell, credential, live config, or provider.
import os, pty, select, subprocess, sys, pathlib
node, script, root, attempt=sys.argv[1:]
master,slave=pty.openpty()
child=subprocess.Popen([node,script,root,attempt],stdin=slave,stdout=slave,stderr=slave,close_fds=True,env={'PATH':'/usr/bin:/bin','TERM':'xterm-256color','LANG':'C.UTF-8'})
os.close(slave)
action='';output=b''
while child.poll() is None:
    path=pathlib.Path(root)/'viewer-action'
    if path.exists():
        next_action=path.read_text()
        if next_action != action:
            action=next_action;os.write(master,action.encode())
    ready,_,_=select.select([master],[],[],.03)
    if ready:
        try: output=(output+os.read(master,8192))[-65536:]
        except OSError: break
        (pathlib.Path(root)/'tty-output').write_bytes(output)
os.close(master)
sys.exit(child.wait())
