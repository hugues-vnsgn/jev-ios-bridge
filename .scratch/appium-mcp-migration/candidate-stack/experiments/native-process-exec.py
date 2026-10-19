"""Persist an owned child's precise identity BEFORE the intended executable."""
import hashlib
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys

os.umask(0o077)
spec = importlib.util.spec_from_file_location('owned_group', Path(__file__).with_name('stop-group.py'))
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)
directory = Path(sys.argv[1]).resolve()
owner = json.loads(Path(sys.argv[2]).read_text())
assert os.getppid() == owner['pid'], 'UNRECORDED_PARENT_REFUSED'
command, argv0, *args = sys.argv[3:]
executable = shutil.which(command)
if executable is None:
    raise RuntimeError('NATIVE_EXECUTABLE_UNAVAILABLE')
executable = str(Path(executable).resolve())
db = sqlite3.connect('file:' + str(directory / 'stop-journal.sqlite') + '?mode=ro', uri=True, timeout=5)
try:
    state = json.loads(db.execute('SELECT state FROM run WHERE id=1').fetchone()[0])
finally:
    db.close()
identity = group.process_incarnation(os.getpid())
record = {'version': 1, 'runId': state['runId'], 'pid': os.getpid(), 'ppid': os.getppid(), 'pgid': os.getpgrp(), 'sid': os.getsid(0),
          'incarnation': identity, 'ownerPid': owner['pid'], 'ownerIncarnation': owner['incarnation'],
          'executable': executable, 'executableSha256': hashlib.sha256(Path(executable).read_bytes()).hexdigest(),
          'argumentsSha256': hashlib.sha256(json.dumps([argv0, *args], separators=(',', ':')).encode()).hexdigest(),
          'commandId': state['commands'][-1]['id'] if state['commands'] else None,
          'disposition': 'refused-before-exec' if state['closed'] else 'authorized-exec'}
assert os.environ.get('JEV_PHASE1_RUN_MARKER') == owner['runMarker'], 'MISSING_RUN_MARKER'
chain = json.loads(base64.urlsafe_b64decode(os.environ['JEV_PHASE1_ANCESTRY']))
assert chain[0] == owner['launchChain'][0], 'UNRECORDED_ANCESTRY'
chain.append({'pid': record['pid'], 'incarnation': identity})
record['runMarker'] = owner['runMarker']
record['launchChain'] = chain
os.environ['JEV_PHASE1_ANCESTRY'] = base64.urlsafe_b64encode(json.dumps(chain, separators=(',', ':')).encode()).decode()
record_path = directory / 'components' / (str(os.getpid()) + '-' + hashlib.sha256(identity.encode()).hexdigest() + '.json')
with record_path.open('x') as file:
    json.dump(record, file)
    file.flush()
    os.fsync(file.fileno())
fd = os.open(record_path.parent, os.O_RDONLY)
try:
    os.fsync(fd)
finally:
    os.close(fd)
if state['closed'] or group.process_incarnation(owner['pid']) != owner['incarnation']:
    raise RuntimeError('DISPATCH_CLOSED')
os.execvpe(executable, [argv0, *args], os.environ)
