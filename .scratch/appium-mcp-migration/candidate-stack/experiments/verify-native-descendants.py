"""One bounded pinned-stack inventory; unknown ownership retains quarantine."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

spec = importlib.util.spec_from_file_location('ownership', Path(__file__).with_name('process-ownership.py'))
ownership = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ownership)
directory, owner_path, mode = sys.argv[1:]
assert mode in ['snapshot', 'verify']
root = Path(directory).resolve()
receipt = {'version': 2, 'mode': mode, 'scanCount': 1, 'readOnly': True,
           'inspectionComplete': False, 'sharedServicesStopped': False, 'verified': False, 'quarantined': True}
try:
    owner = json.loads(Path(owner_path).read_text())
    profile = json.loads((root / 'profile.json').read_text())
    if mode == 'verify':
        previous = json.loads((root / 'descendants-before-stop.json').read_text())
        assert previous.get('inspectionComplete'), 'PRE_STOP_INVENTORY_UNVERIFIED'
    candidates = ownership.scan(root, owner, profile)
    receipt['candidates'] = candidates
    receipt['inspectionComplete'] = True
    unknown = [row for row in candidates if row['active'] and not row['owned'] and not row['excludedSharedService'] and not row['deviceInternal']]
    if mode == 'verify':
        for row in previous['candidates']:
            if row.get('excludedSharedService') or not row['active']:
                continue
            if row.get('deviceInternal') and any(current['pid'] == row['pid'] and current['incarnation'] == row['incarnation'] and current['deviceInternal'] for current in candidates):
                continue
            identity = ownership.group.process_incarnation(row['pid'])
            if row['incarnation'] is None or identity is None or identity == row['incarnation']:
                check = subprocess.run(['ps', '-p', str(row['pid']), '-o', 'stat='], capture_output=True, text=True, timeout=2)
                if not ((check.returncode == 1 and not check.stdout.strip()) or
                        (check.returncode == 0 and check.stdout.strip().startswith('Z'))):
                    unknown.append({**row, 'reason': 'RECORDED_PROCESS_STILL_ACTIVE'})
        receipt['priorCandidatesAbsent'] = not unknown
        unknown += [row for row in candidates if row['active'] and row['owned']]
    receipt['unverifiedComponents'] = unknown
    receipt['verified'] = not unknown
    receipt['quarantined'] = bool(unknown)
except Exception as error:
    receipt['reason'] = 'HOST_INVENTORY_DEADLINE_EXCEEDED' if isinstance(error, subprocess.TimeoutExpired) else type(error).__name__ + ': ' + str(error)
print(json.dumps(receipt))
if not receipt['verified']:
    sys.exit(1)
