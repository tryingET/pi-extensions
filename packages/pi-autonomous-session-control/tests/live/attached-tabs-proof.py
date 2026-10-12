#!/usr/bin/env python3
"""Explicit isolated Ghostty + real Pi/ASC qualification. Never retries an uncertain launch.
Controller provider is deterministic; two original children use the selected real provider.
Keyboard/focus operations target only the parent-proved nested compositor.
"""
import fcntl, glob, hashlib, json, os, pathlib, pty, re, select, shlex, signal, struct, subprocess, sys, termios, time
if os.environ.get('ASC_TABS_LIVE') != '1': sys.exit('Explicit ASC_TABS_LIVE=1 required')
root = pathlib.Path(os.environ['ASC_TABS_PROOF_ROOT']).resolve(); root.mkdir(mode=0o700, parents=True, exist_ok=True)
if any(root.iterdir()): sys.exit('Fresh proof root required; retained attempts are never replayed')
package = pathlib.Path(__file__).resolve().parent.parent.parent
helper = package.parent / 'pi-little-helpers'
guard = helper / 'tests/ghostty-observer-tab-harness.mjs'
subprocess.run(['node','--input-type=module','-e',"const m=await import(process.argv[1]); const r=m.observerIsolationRefusal(); if(r) throw new Error(r);",guard.as_uri()],check=True)
if os.environ.get('TERM_PROGRAM') != 'ghostty': sys.exit('Real isolated Ghostty controller required')
(root/'sessions').mkdir(mode=0o700)
fixture = pathlib.Path(__file__).with_name('attached-tabs-proof-extension.ts').resolve()
source_files = sorted((package/'extensions/self').glob('subagent-attachment*.ts')) + [package/'extensions/self/subagent-dashboard.ts',package/'attachments.ts',package/'extensions/self/subagent-commands.ts',helper/'extensions/sidequestSubagentDiagnostics.ts',helper/'extensions/sidequestSubagentTabs.ts',helper/'extensions/sidequestSubagentTabsProtocol.ts',helper/'extensions/sidequest.ts',helper/'extensions/sidequestGhostty.ts',helper/'extensions/sidequestGhosttyShell.ts',helper/'extensions/sidequestLaunch.ts',helper/'extensions/sidequestLaunchTypes.ts',fixture,pathlib.Path(__file__).resolve(),guard]
def hashes(): return {os.path.relpath(p,package):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files}
source_hashes=hashes(); installed=os.environ.get('ASC_TABS_PROOF_INSTALLED')=='1'
pid,fd=pty.fork()
if pid==0:
    os.environ['PI_ASC_OBSERVER']='auto'; os.environ['PI_ASC_OBSERVER_STATE_DIR']=str(root/'observers')
    os.environ['PI_SUBAGENT_SESSIONS_DIR']=str(root/'sessions'); os.environ['PI_SELF_MEMORY_PATH']=str(root/'self-memory.json')
    os.environ['PI_SUBAGENT_MODEL']=os.environ['ASC_TABS_PROOF_MODEL']
    args=['pi','--no-extensions','--no-skills','--no-prompt-templates','--no-mcp','--no-context-files','-e',str(fixture),'-e',str(helper/'extensions/sidequest.ts'),'--provider','tabs-proof','--model','controller','--session',str(root/'controller.jsonl')]
    if installed: args.remove('--no-extensions')
    os.execvp('pi',args)
fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',46,130,0,0))
log=open(root/'controller.ansi','wb',buffering=0); buffer=bytearray(); checks=[]
def pump(duration=.1):
    end=time.monotonic()+duration
    while time.monotonic()<end:
        r,_,_=select.select([fd],[],[],max(0,end-time.monotonic()))
        if r:
            try: data=os.read(fd,65536)
            except OSError: return
            if not data:return
            log.write(data);buffer.extend(data)
            if b'\x1b[6n' in data:os.write(fd,b'\x1b[1;1R')
            if b'\x1b[c' in data:os.write(fd,b'\x1b[?1;2c')
def send(text):os.write(fd,text.encode());pump(.35)
def until(predicate,label,seconds=120):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        pump(.15);value=predicate()
        if value:checks.append(label);print('PASS',label,flush=True);return value
    raise AssertionError('Timed out: '+label)
def read(path):
    try:return json.loads(pathlib.Path(path).read_text())
    except (FileNotFoundError,json.JSONDecodeError):return None
def status(name):return read(root/'sessions'/f'tab-{name}.status.json')
def cockpit(name):
    for file in glob.glob(str(root/'sessions/.cockpit-*/channel.json')):
        c=read(file)
        if c and c.get('sessionName')==f'tab-{name}':return c
    return None
def records():return [r for f in glob.glob(str(root/'sessions/.asc-attachments/*/channel.json')) if (r:=read(f))]
def ready_views():return {r['ticket']['sessionName']:r for r in records() if r.get('status')=='ready' and not r.get('detached')}
def start_ticks(p):
    try:return int(pathlib.Path(f'/proc/{p}/stat').read_text().rsplit(')',1)[1].split()[19])
    except (OSError,ValueError,IndexError):return None
def niri(command):return json.loads(subprocess.check_output(['niri','msg','-j',command],text=True))
def focused():return niri('focused-window')
def key(modifier,name):subprocess.run(['wtype','-M',modifier,'-k',name,'-m',modifier],check=True);pump(.5)
def cycle():
    subprocess.run(['wtype','-M','ctrl','-M','alt','-k','Left','-m','alt','-m','ctrl'],check=True);pump(.7)
def bus_call(target,path,interface,*args):
    return subprocess.check_output(['busctl','--address='+os.environ['DBUS_SESSION_BUS_ADDRESS'],'call',target,path,interface,*args],text=True)
def action(path,name,variant_type,value):
    return bus_call(bus_owner,path,'org.gtk.Actions','Activate','sava{sv}',name,'1',variant_type,str(value),'0')
def select_view(name):
    # Native presentation avoids the nested virtual keyboard's remapping/repeat hazard.
    view=ready_views()[f'tab-{name}']
    assert start_ticks(view['viewerPid'])==view['viewerStartedAt'],'target viewer no longer live'
    sid=view['viewerSurfaceId'];sid=int(sid,16) if sid.startswith('0x') else int(sid)
    action('/com/mitchellh/ghostty','present-surface','t',sid)
    def selected():
        window=focused()
        with open(root/'focus-observations.jsonl','a') as observations:
            observations.write(json.dumps({'select':name,'window':window})+'\n')
        return window if window and window['id']==window_id and f'Subagent · tab-{name}' in window.get('title','') else None
    return until(selected,'native presentation selected exact '+name,10)
clipboard_owners=[]
def type_view(name,text):
    select_view(name)
    # Use native bracketed paste; a zero-delay virtual-keyboard burst produced
    # duplicated character events in this nested compositor, not faithful input.
    copier=subprocess.Popen(['wl-copy','--foreground','--type','text/plain'],stdin=subprocess.PIPE)
    copier.stdin.write(text.encode());copier.stdin.close();clipboard_owners.append(copier);pump(.5)
    subprocess.run(['wtype','-M','ctrl','-M','shift','-k','v','-m','shift','-m','ctrl'],check=True);pump(.5)
    subprocess.run(['wtype','-k','Return'],check=True);pump(1)
def identity(name):
    s=status(name);c=cockpit(name)
    return (s['dispatchId'],s['attemptId'],s['pid'],s.get('pidStartedAt'),c['childPid'],c['childTicks'])
try:
    until(lambda:read(root/'ready.json'),'native controller ready',45)
    assert read(root/'ready.json')['mode']=='tui'
    assert read(root/'ready.json')['subagentCommands']==['subagents'],read(root/'ready.json')
    checks.append('native command registry exposes only subagents; retired aliases absent')
    windows=niri('windows');assert len(windows)==1,windows
    window_id=windows[0]['id'];surface=os.environ['GHOSTTY_SURFACE_ID']
    clients=subprocess.check_output(['busctl','--address='+os.environ['DBUS_SESSION_BUS_ADDRESS'],'--no-pager','--no-legend','list'],text=True).splitlines()
    owners=[fields[0] for line in clients if len(fields:=line.split())>=2 and fields[0].startswith(':') and fields[1]==str(windows[0]['pid'])]
    assert len(owners)==1,owners
    bus_owner=owners[0]
    bus_pid=int(shlex.split(bus_call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetConnectionUnixProcessID','s',bus_owner))[1])
    assert bus_pid==windows[0]['pid'],'private bus owner is not test Ghostty'
    paths=subprocess.check_output(['busctl','--address='+os.environ['DBUS_SESSION_BUS_ADDRESS'],'tree','--list',bus_owner],text=True).splitlines()
    window_paths=[p.strip() for p in paths if re.fullmatch(r'/com/mitchellh/ghostty/window/\d+',p.strip())]
    assert len(window_paths)==1,window_paths
    window_path=window_paths[0]
    send('START_TWO_ORIGINAL_CHILDREN\r')
    for name in ['alpha','beta']:
        until(lambda n=name:(c if (c:=cockpit(n)) and c['phase']=='open' and any(e.get('toolName')=='bash' for e in c['events']) else None),'original '+name+' tool running')
    identities={name:identity(name) for name in ['alpha','beta']}
    offset=len(buffer);send('/subagents status\r')
    until(lambda:b'Subagents (current session):' in buffer[offset:] and b'running=2' in buffer[offset:],'single command read-only status reports original children',10)
    offset=len(buffer);send('/subagents diagnose observer status\r')
    until(lambda:b'ASC observer: idle' in buffer[offset:],'advanced observer status stays idle without launching',10)
    offset=len(buffer);send('/subagents diagnose clear\r')
    until(lambda:b'preserved subagent sessions' in buffer[offset:],'advanced maintenance preserves traces without delete opt-in',10)
    assert all(identity(name)==identities[name] for name in ['alpha','beta'])
    assert len(niri('windows'))==1
    assert not (root/'observers').exists() or not list((root/'observers').iterdir())
    offset=len(buffer);send('/subagents\r')
    views=until(lambda:(v if len(v:=ready_views())==2 else None),'two existing children attached as native Pi viewers',25)
    assert len(niri('windows'))==1 and niri('windows')[0]['id']==window_id,'view tabs created another window'
    surfaces={v['viewerSurfaceId'] for v in views.values()};assert len(surfaces)==2 and surface not in surfaces,surfaces
    viewer_pids={name:views[f'tab-{name}']['viewerPid'] for name in ['alpha','beta']}
    for name,p in viewer_pids.items():
        # Pi's setupCli rewrites process.title and OS argv storage. Validate its strict
        # logical argv receipt, observed PID/TTY and fresh native SDK safety instead.
        observed=views[f'tab-{name}']; argv=observed['viewerArgv']
        assert '--no-session' in argv and '--no-tools' in argv and '--offline' in argv
        assert '--session' not in argv and not any(a.endswith('.jsonl') for a in argv),argv
        assert start_ticks(p)==observed['viewerStartedAt']
        assert os.readlink(f'/proc/{p}/fd/0').startswith('/dev/pts/')
        safe=until(lambda n=name:ready_views()[f'tab-{n}'].get('viewerSafety'),'native SDK safety available for '+name,10)
        assert safe['sdk']=={'noSession':True,'activeToolsCount':0,'inertModelSelected':True},safe
        assert all(safe['instrumented'].values()) and all(v==0 for v in safe['attempts'].values()),safe
        assert identity(name)==identities[name]
    assert b'Children  ' not in buffer[offset:] and b'Enter timeline' not in buffer[offset:],'default command opened old overlay'
    checks.append('same controller window, distinct native surfaces, original identity and no-session argv verified')
    send('/subagents\r');pump(3)
    assert {n:ready_views()[f'tab-{n}']['viewerPid'] for n in ['alpha','beta']}==viewer_pids,'repeated request duplicated views'
    checks.append('repeated command reused both live viewers')
    send('/proof-refuse-tabs\r')
    until(lambda:read(root/'refusal.json'),'unavailable zero target refused by native command',10)
    assert len(niri('windows'))==1 and niri('windows')[0]['id']==window_id
    assert {n:ready_views()[f'tab-{n}']['viewerPid'] for n in ['alpha','beta']}==viewer_pids
    assert b'no overlay/window fallback' in buffer
    checks.append('unavailable target produced visible refusal, no alternate window or duplicate viewers')
    guidance={name:f'For this proof, replace your final word with TYPED_TAB_{name.upper()}. No additional tools or edits.' for name in ['alpha','beta']}
    type_view('alpha',guidance['alpha'])
    until(lambda:len(cockpit('alpha')['requests'])==1,'typed native viewer guidance queued to original alpha',10)
    assert cockpit('alpha')['requests'][0]['status']=='queued' and cockpit('alpha')['requests'][0]['message']==guidance['alpha'],'native alpha input was duplicated or altered'
    safety_alpha=until(lambda:(s if (s:=ready_views()['tab-alpha'].get('viewerSafety')) and s['inputObservations']['after']>=1 else None),'fresh post-input safety for alpha',10)
    assert all(v==0 for v in safety_alpha['attempts'].values()),safety_alpha
    select_view('beta')
    # Focus-dependent native close, safe only in this exclusively controlled single
    # window/unsplit fixture after exact target presentation and PID/window checks.
    # Transport acceptance alone is not target existence or closure proof.
    action(window_path,'close-tab','s','this');pump(1)
    old_beta_pid=viewer_pids['beta'];old_beta_ticks=views['tab-beta']['viewerStartedAt']
    until(lambda:start_ticks(old_beta_pid)!=old_beta_ticks,'closed viewer process death proven',15)
    assert status('beta')['status']=='running' and identity('beta')==identities['beta'],'closing view cancelled/replaced child'
    alpha_after_close=ready_views().get('tab-alpha')
    assert alpha_after_close and alpha_after_close['viewerPid']==viewer_pids['alpha'] and start_ticks(viewer_pids['alpha'])==views['tab-alpha']['viewerStartedAt'], 'native close also detached sibling: '+json.dumps(records())
    checks.append('native beta close leaves original child running and alpha viewer unchanged')
    send('/subagents tab-beta\r')
    new_beta=until(lambda:(r if (r:=ready_views().get('tab-beta')) and r['viewerPid']!=old_beta_pid else None),'explicit reopen created one new viewer after proven death',25)
    assert len(niri('windows'))==1 and niri('windows')[0]['id']==window_id
    assert ready_views()['tab-alpha']['viewerPid']==viewer_pids['alpha']
    type_view('beta',guidance['beta'])
    until(lambda:len(cockpit('beta')['requests'])==1,'reopened native view guides original beta',10)
    assert cockpit('beta')['requests'][0]['status']=='queued' and cockpit('beta')['requests'][0]['message']==guidance['beta'],'native beta input was duplicated or altered'
    safety_beta=until(lambda:(s if (s:=ready_views()['tab-beta'].get('viewerSafety')) and s['inputObservations']['after']>=1 else None),'fresh post-input safety for beta',10)
    assert all(v==0 for v in safety_beta['attempts'].values()),safety_beta
    (root/'release').write_text('explicit test boundary release\n')
    for name in ['alpha','beta']:
        until(lambda n=name:any(r['status']=='delivered' for r in cockpit(n)['requests']),'native guidance committed to original '+name)
        ended=until(lambda n=name:(s if (s:=status(n)) and s['status']!='running' else None),'original '+name+' settled')
        assert ended['status']=='done',ended
        assert f'TYPED_TAB_{name.upper()}' in ended.get('resultPreview',''),ended
        assert identity(name)==identities[name]
        transcript=[json.loads(line) for line in (root/'sessions'/f'tab-{name}.jsonl').read_text().splitlines()]
        calls=[part for entry in transcript if entry.get('message',{}).get('role')=='assistant' for part in entry['message'].get('content',[]) if isinstance(part,dict) and part.get('type')=='toolCall']
        expected_command=f"printf 'TAB_{name.upper()}_STARTED\\n'; while [ ! -f '{root}/release' ]; do sleep 0.2; done; printf 'TAB_{name.upper()}_FINISHED\\n'"
        assert len(calls)==1 and calls[0]['name']=='bash' and calls[0]['arguments']['command']==expected_command,'fixture child did not use exact single intended command'
        committed=[r for r in transcript if r.get('customType')=='asc.subagent-guidance.v1']
        assert len(committed)==1 and committed[0]['content']==guidance[name], 'committed native guidance differs from exact operator input'
    checks.append('exactly one byte-faithful guidance request committed per original child')
    checks.append('real original children followed native-view guidance without restart or clone')
    assert ready_views()['tab-alpha']['viewerPid']==viewer_pids['alpha'],'terminal child history view disappeared'
    assert ready_views()['tab-beta']['viewerPid']==new_beta['viewerPid']
    until(lambda:b'done=2' in buffer,'controller count strip observes both settled children',10)
    send('/reload\r');pump(15)
    send('/subagents tab-alpha\r');pump(4)
    assert ready_views()['tab-alpha']['viewerPid']==viewer_pids['alpha'],'idle extension reload duplicated view'
    assert len(niri('windows'))==1 and niri('windows')[0]['id']==window_id
    checks.append('terminal history remains, count-only completion, idle reload reuses original view')
    # Persist both representative native tabs; not asserted as pixel/layout fitness.
    for name in ['alpha','beta']:
        select_view(name)
        subprocess.run(['niri','msg','action','screenshot-window','--path',str(root/f'native-tab-{name}.png')],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    assert hashes()==source_hashes,'source changed during qualification'
    (root/'proof.json').write_text(json.dumps({'checks':checks,'sourceSha256':source_hashes,'installedExtensions':installed,'windowId':window_id,'controllerSurfaceId':surface,'initialViewSurfaces':sorted(surfaces),'originalIdentities':identities,'initialViewerPids':viewer_pids,'reopenedBetaPid':new_beta['viewerPid'],'postInputSafety':{'alpha':safety_alpha,'beta':safety_beta},'model':os.environ['ASC_TABS_PROOF_MODEL'],'scope':'real Pi/ASC original children and native Ghostty attachment tabs, actual nested keyboard; deterministic controller, real child provider; no broad platform/placement-race guarantee'},indent=2))
    print('PROOF',root/'proof.json',flush=True)
except BaseException as error:
    subprocess.run(['niri','msg','action','screenshot-window','--path',str(root/'failure.png')],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    (root/'failure.json').write_text(json.dumps({'checks':checks,'error':str(error),'sourceSha256':source_hashes,'attachmentsBeforeCleanup':records(),'viewerProcStartBeforeCleanup':{str(r.get('viewerPid')):start_ticks(r['viewerPid']) for r in records() if r.get('viewerPid')}},indent=2));print('FAIL',error,'retained',root,flush=True);raise
finally:
    # Stop only exact test-owned viewer processes, then controller; never signal original children directly.
    for copier in clipboard_owners:
        if copier.poll() is None: copier.terminate()
        try: copier.wait(timeout=3)
        except subprocess.TimeoutExpired: print('retained own nested clipboard process',copier.pid,flush=True)
    for r in records():
        p=r.get('viewerPid');ticks=r.get('viewerStartedAt')
        if p and start_ticks(p)==ticks:
            try:os.kill(p,signal.SIGTERM)
            except ProcessLookupError:pass
    try:os.kill(pid,signal.SIGTERM)
    except ProcessLookupError:pass
    end=time.monotonic()+10
    while time.monotonic()<end:
        pump(.1);done,_=os.waitpid(pid,os.WNOHANG)
        if done:break
    else:
        if start_ticks(pid) is not None:os.kill(pid,signal.SIGKILL)
        os.waitpid(pid,0)
    log.close();os.close(fd)
