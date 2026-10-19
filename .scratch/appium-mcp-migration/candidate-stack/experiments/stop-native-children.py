"""Inspect/stop exact recorded child incarnations, including escaped groups."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import time

spec = importlib.util.spec_from_file_location('owned_group', Path(__file__).with_name('stop-group.py'))
group = importlib.util.module_from_spec(spec)
spec.loader.exec_module(group)
directory, owner_path, mode = sys.argv[1:]
assert mode in ['inspect', 'stop']
root = Path(directory).resolve()
assert root.stat().st_uid == os.getuid() and root.stat().st_mode & 0o077 == 0
owner = json.loads(Path(owner_path).read_text())
records = []
for file in sorted((root / 'components').glob('*.json')):
    assert not file.is_symlink() and file.stat().st_uid == os.getuid() and file.stat().st_mode & 0o077 == 0
    record = json.loads(file.read_text())
    assert record['ownerPid'] == owner['pid'] and record['ownerIncarnation'] == owner['incarnation']
    records.append(record)
snapshot = root / 'descendants-before-stop.json'
if snapshot.exists():
    saved = json.loads(snapshot.read_text())
    records += [row for row in saved.get('candidates', []) if row.get('owned') and row['pid'] != owner['pid']]
rows = []
seen = set()
for record in records:
    assert record['ownerPid'] == owner['pid'] and record['ownerIncarnation'] == owner['incarnation']
    pid = record['pid']
    key = (pid, record['incarnation'])
    if key in seen:
        continue
    seen.add(key)
    assert isinstance(pid, int) and pid > 1 and pid not in [os.getpid(), owner['pid']]
    before = group.process_incarnation(pid)
    signals = []
    if before == record['incarnation']:
        command = group.process_command(pid)
        assert command, 'LIVE_COMPONENT_COMMAND_UNREADABLE'
        if group.is_shared_service(command):
            rows.append({**record, 'signals': [], 'stopped': False, 'excludedSharedService': True})
            continue
    if mode == 'stop' and before == record['incarnation']:
        for sig, timeout in [(signal.SIGTERM, 2), (signal.SIGKILL, 2)]:
            if group.process_incarnation(pid) != record['incarnation']:
                break
            try:
                os.kill(pid, sig)
                signals.append(sig.name)
            except ProcessLookupError:
                break
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline and group.process_incarnation(pid) == record['incarnation']:
                time.sleep(0.05)
    after = group.process_incarnation(pid)
    # A different incarnation is never signalled; the recorded one is absent.
    stopped = after is not None and after != record['incarnation']
    if not stopped:
        try:
            import subprocess
            stopped = subprocess.check_output(['ps', '-p', str(pid), '-o', 'stat='], text=True, timeout=2).strip().startswith('Z')
        except subprocess.CalledProcessError as error:
            stopped = error.returncode == 1
    rows.append({**record, 'beforeIncarnation': before, 'afterIncarnation': after, 'signals': signals, 'stopped': stopped})
complete = all(row['stopped'] or row.get('excludedSharedService') for row in rows)
print(json.dumps({'version': 1, 'mode': mode, 'components': rows, 'recordedChildrenStopped': complete}))
if mode == 'stop' and not complete:
    sys.exit(1)
