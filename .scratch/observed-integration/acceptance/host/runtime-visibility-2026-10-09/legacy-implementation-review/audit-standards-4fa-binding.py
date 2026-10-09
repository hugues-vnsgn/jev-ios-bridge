"""Rehash the sealed original-candidate Standards review without executing Source."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import stat

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
AUTHOR = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
PARENT = ROOT / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/legacy-implementation-review'
REVIEW = PARENT / 'standards/4fa9cc99'
MANIFEST_SHA = '3d95b24c60c4c14ea09ce1d0df4d5447e13db5d26ed5873cc35a8290587c2464'
REPORT_SHA = 'e5f30079e0ff7b0e62b58ecf8efeaa26b5c13410ca9da718fb77f95cf0f8281d'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def regular(path):
    assert path.is_absolute() and (path.is_relative_to(ROOT) or path.is_relative_to(AUTHOR))
    assert '.env' not in path.parts
    current = Path('/')
    for component in path.parts[1:]:
        current /= component
        assert not stat.S_ISLNK(current.lstat().st_mode), str(current)
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode), str(path)
    return info

os.umask(0o077)
regular_path = REVIEW / 'manifest.json'
regular(regular_path)
assert digest(regular_path) == MANIFEST_SHA
manifest = json.loads(regular_path.read_text())
assert manifest['base'] == '720cb380d07102d72b20a6a4f5f7787a0ab88f2b'
assert manifest['candidate'] == '4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d'
assert manifest['standardsVerdict'] == 'PASS' and manifest['specVerdict'].startswith('FAIL P1/P2')
assert manifest['reportSha256'] == REPORT_SHA and digest(REVIEW / 'report.md') == REPORT_SHA
assert manifest['boundedAuditPassed'] == 1555 and manifest['boundedAuditFailed'] == 0
assert manifest['noTestBuildNativeOrCorrectiveSourceOperations'] is True
assert manifest['selfExclusion'] == 'manifest.json excluded from its own hash; its hash is returned to Root'
assert len(manifest['regularFiles']) == 76
for relative, expected in manifest['regularFiles'].items():
    key = Path(relative)
    assert not key.is_absolute() and '..' not in key.parts
    path = REVIEW / key
    info = regular(path)
    assert info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600
    assert info.st_size == expected['bytes'] and digest(path) == expected['sha256']
assert digest(REVIEW / 'input-bindings.json') == manifest['inputBindingsSha256']
inputs = json.loads((REVIEW / 'input-bindings.json').read_text())
assert len(inputs) == 625
for absolute, expected in inputs.items():
    path = Path(absolute)
    info = regular(path)
    assert info.st_size == expected['bytes'] and digest(path) == expected['sha256'], absolute
audit = json.loads((REVIEW / 'support-audit.json').read_text())
assert len(audit['checks']) == 1555 and not audit['failed']
assert all(check['pass'] is True for check in audit['checks'])
assert len(audit['hunks']) == 11 and len(audit['fowlerBaseline']) == 12
assert len(audit['receipts']) == 28
actual_files = set()
for directory, dirs, names in os.walk(REVIEW, followlinks=False):
    assert stat.S_IMODE(Path(directory).lstat().st_mode) == 0o700
    assert all(not (Path(directory) / name).is_symlink() for name in dirs)
    for name in names:
        path = Path(directory) / name
        regular(path)
        actual_files.add(path.relative_to(REVIEW).as_posix())
assert actual_files == set(manifest['regularFiles']) | {'manifest.json'}
result = {
    'status': 'PASS', 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'base': manifest['base'], 'candidate': manifest['candidate'],
    'standardsVerdict': 'PASS', 'implementationAcceptance': 'FAIL Spec P1/P2',
    'reportSha256': REPORT_SHA, 'manifestSha256': MANIFEST_SHA,
    'scriptSha256': digest(Path(__file__)),
    'boundInputsRehashed': len(inputs), 'sealedFilesIncludingManifestRehashed': len(actual_files),
    'boundedReviewerChecksPassing': len(audit['checks']),
    'scope': 'Root independently rehashed precise relied-on inputs and every sealed output; no Source, test, build or native execution.',
    'qualification': 'Original Node24 failure and unresolved lower cause remain historical; candidate clean installed/startup and all live gates remain pending.'
}
target = PARENT / 'root-standards-4fa-review-binding.json'
with target.open('x') as stream:
    json.dump(result, stream, indent=2, sort_keys=True)
    stream.write('\n')
target.chmod(0o600)
print(json.dumps({'status': result['status'], 'inputs': len(inputs), 'outputs': len(actual_files), 'receipt': str(target), 'sha256': digest(target)}))
