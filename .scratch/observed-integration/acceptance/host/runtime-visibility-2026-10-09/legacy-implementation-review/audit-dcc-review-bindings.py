"""Rehash both sealed dcc review packets and their actually relied-on inputs."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import stat

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
AUTHOR = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
OLD_AUTHOR = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
PARENT = ROOT / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/legacy-implementation-review'
CANDIDATE = 'dcc06dc0939d73d860cae9e03d4f1f47bacbd279'
BASE = '4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def regular(path):
    assert path.is_absolute() and any(path.is_relative_to(root) for root in [ROOT, AUTHOR, OLD_AUTHOR])
    assert '.env' not in path.parts
    cursor = Path('/')
    for component in path.parts[1:]:
        cursor /= component
        assert not stat.S_ISLNK(cursor.lstat().st_mode), str(cursor)
    info = path.lstat(); assert stat.S_ISREG(info.st_mode), str(path)
    return info

def bound_files(files):
    for absolute, expected in files.items():
        path = Path(absolute); info = regular(path)
        assert info.st_size == expected['bytes'] and sha(path) == expected['sha256'], absolute

def outputs(directory, files, self_name):
    for relative, expected in files.items():
        p = Path(relative); assert not p.is_absolute() and '..' not in p.parts
        path = directory / p; info = regular(path)
        assert info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600
        assert info.st_size == expected['bytes'] and sha(path) == expected['sha256'], relative
    actual = set()
    for path, dirs, names in os.walk(directory, followlinks=False):
        assert stat.S_IMODE(Path(path).lstat().st_mode) == 0o700
        assert all(not (Path(path) / name).is_symlink() for name in dirs)
        for name in names:
            file = Path(path) / name; regular(file); actual.add(file.relative_to(directory).as_posix())
    assert actual == set(files) | {self_name}
    return len(actual)

os.umask(0o077)
spec = PARENT / 'spec/dcc06dc0'
regular(spec / 'freeze.json')
assert sha(spec / 'freeze.json') == '5b026b33e79fed06d0d791f72159a04e9f7c3807c98a1604b41e027bcd369da8'
freeze = json.loads((spec / 'freeze.json').read_text())
assert freeze['candidate'] == CANDIDATE and freeze['correctionBase'] == BASE and freeze['verdict'] == 'FAIL'
assert freeze['auditChecks'] == 2479 and freeze['auditFailures'] == 0 and freeze['reliedInputFiles'] == 673
assert sha(spec / 'report.md') == '13539096f9e47bdce966a8b1e7367637f88b58724eaffd972ad8ebf1ef7b1d17'
spec_outputs = outputs(spec, freeze['outputs'], 'freeze.json')
inputs = json.loads((spec / 'input-manifest.json').read_text())
assert inputs['count'] == len(inputs['files']) == 673; bound_files(inputs['files'])
audit = json.loads((spec / 'audit.json').read_text())
assert len(audit['checks']) == audit['passed'] == 2479 and not audit['failed']
assert all(check['pass'] is True for check in audit['checks'])
standards = PARENT / 'standards/dcc06dc0'
regular(standards / 'manifest.json')
assert sha(standards / 'manifest.json') == 'c524626f207156b759e03fa7fc6037b7a744b4c7f7c31c55bf3f8f94364efbec'
manifest = json.loads((standards / 'manifest.json').read_text())
assert manifest['candidate'] == CANDIDATE and manifest['correctionBase'] == BASE and manifest['verdict'].startswith('FAIL one material design judgment D1')
assert manifest['checksPassed'] == 2337 and manifest['checksFailed'] == 0 and manifest['changedHunks'] == 15
assert manifest['baselineHeuristics'] == 12 and manifest['rawReceipts'] == 14 and manifest['inputsActuallyBound'] == 606
assert sha(standards / 'report.md') == manifest['reportSha256'] == '317c489f0e887544c952b428f1ee061c6180328e3cac49fc8aff076bb71262a4'
standards_outputs = outputs(standards, manifest['regularFiles'], 'manifest.json')
assert standards_outputs == 91
assert sha(standards / 'input-bindings.json') == manifest['inputBindingsSha256']
standard_inputs = json.loads((standards / 'input-bindings.json').read_text())
assert len(standard_inputs) == 606; bound_files(standard_inputs)
standard_audit = json.loads((standards / 'support-audit.json').read_text())
assert len(standard_audit['checks']) == 2337 and not standard_audit['failedChecks']
assert all(check['pass'] is True for check in standard_audit['checks'])
receipt = {
    'status': 'PASS review provenance; implementation FAIL',
    'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'candidate': CANDIDATE, 'correctionBase': BASE,
    'spec': {'verdict': 'FAIL remaining P1; P2 resolved', 'inputsRehashed': 673, 'outputsIncludingFreezeRehashed': spec_outputs,
             'reportSha256': sha(spec / 'report.md'), 'freezeSha256': sha(spec / 'freeze.json'), 'checksPassing': 2479},
    'standards': {'verdict': manifest['verdict'], 'inputsRehashed': 606, 'outputsIncludingManifestRehashed': standards_outputs,
                  'reportSha256': manifest['reportSha256'], 'manifestSha256': sha(standards / 'manifest.json'), 'checksPassing': 2337},
    'finding': 'Real allocation.ts trackedProcess wrapper hides the private registered factory invoker. Direct-only tests omit the production composition seam.',
    'held': ['Candidate clean package/startup', 'Source integration', 'Native compatibility', 'Operational entry', 'L01-L05', 'Ticket12'],
    'scope': 'Root rehashed exact relied-on inputs/outputs and positive correspondence checks; no Source, test, build or native execution.',
    'readerQualification': 'An earlier shape-inspection tool call queried nonexistent Standards failed; actual key failedChecks was inspected before this audit. Tool transcript retains that KeyError; no product/reviewer inputs or assertion weakened.',
    'scriptSha256': sha(Path(__file__))
}
target = PARENT / 'root-dcc-review-bindings.json'
with target.open('x') as stream:
    json.dump(receipt, stream, indent=2, sort_keys=True); stream.write('\n')
target.chmod(0o600)
print(json.dumps({'status': receipt['status'], 'specInputs': 673, 'specOutputs': spec_outputs, 'standardsInputs': 606,
                  'standardsOutputs': standards_outputs, 'receiptSha256': sha(target)}))
