#!/usr/bin/python3
"""Test-only constructor seam; unmodified production Supervisor + hash-bound native ELF."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

sys.dont_write_bytecode = True
root = Path(sys.argv[1])
config = json.loads((root / 'fixture.json').read_text())
source = Path(config['akRoot']) / 'scripts/ak-task-session-supervisor.py'
spec = importlib.util.spec_from_file_location('actual_ak_supervisor', source)
owner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owner)

def observe(frame, event, arg):
    # Passive Python call/return observation; no monkeypatch, fake worker or changed outcomes.
    if frame.f_code.co_filename != str(source):
        return
    name = frame.f_code.co_name
    value = {'event': event, 'function': name, 'at': int(time.time() * 1000)}
    if event == 'call' and name == 'send':
        value['kind'] = frame.f_locals['value'].get('kind', frame.f_locals['value'].get('schema'))
    elif event == 'return' and name == 'worker':
        value['result'] = arg
    elif name not in ('acquire', 'startup', 'recover'):
        return
    with (root / 'supervisor-trace.jsonl').open('a') as stream:
        stream.write(json.dumps(value) + '\n')

try:
    sys.setprofile(observe)
    supervisor = owner.Supervisor(root / 'policy.json', root / 'host', root, Path(config['protocol']))
    request = owner.parse(sys.stdin.buffer.read(owner.MAX_FRAME + 1))
    result = supervisor.recover(request) if sys.argv[2] == 'recover' else supervisor.startup(request)
    print(json.dumps(result))
except Exception as error:
    (root / 'supervisor-error.json').write_text(json.dumps({'type': type(error).__name__, 'reason': str(error)}))
    # Deliberately no finally unlock, worker retry, host cleanup or matching-state inference.
    sys.exit(78)
