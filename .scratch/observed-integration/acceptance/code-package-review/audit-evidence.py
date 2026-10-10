"""Read-only audit of the fixed observed code/package acceptance packet.
Run from the isolated review checkout. Prints JSON; never executes product code,
follows proof symlinks, opens SQLite, or contacts native/account/network surfaces.
"""
import hashlib
import json
import pathlib
import re
import stat
import subprocess

ROOT = pathlib.Path.cwd()
P = ROOT / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
PACKET = P / 'root-tracked-final-gates'
BASE = 'b8c4a50942551bdf95d00036a6d2f7bb6142ff43'
FINAL = 'a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a'
VAULT = pathlib.Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-run-vault/tracked-root-gates-2026-10-10')
SCOPE = ['src', 'tests', 'scripts', '.github', 'docs', 'skills', 'package.json', 'package-lock.json', 'README.md', 'AGENTS.md', 'GLOSSARY.md', 'tsconfig.json', 'tsconfig.build.json', 'plugin', 'CHANGELOG.md', 'LICENSE']
result = {'base': BASE, 'final': FINAL, 'checks': {}, 'errors': []}

def digest(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError('Not a regular file: ' + str(path))
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def verify(path, expected):
    try:
        actual = digest(path)
        if actual != expected:
            raise ValueError('SHA mismatch')
    except Exception as error:
        result['errors'].append({'path': str(path), 'error': str(error)})

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

audit = json.loads((PACKET / 'root-audit.json').read_text())
verify(PACKET / 'root-audit.json', '9f12730b699705b15e10bb924d6b1bff4a098eb390112fe6cdb5ea7a881dfcdd')
result['rootAuditSha256'] = digest(PACKET / 'root-audit.json')
result['product'] = audit['productCommit']
for key in ['source443', 'originalHostFiles15']:
    for name, sha in audit[key].items():
        verify(ROOT / name, sha)
    result['checks'][key] = len(audit[key])
for name, info in audit['copied'].items():
    verify(PACKET / 'preserved' / name, info['sha256'])
result['checks']['copiedRegularArtifacts'] = len(audit['copied'])
for node, proof in audit['distribution'].items():
    private = VAULT / f'tracked-root-final-node{node}-proof-installed'
    assert private == pathlib.Path(proof['summary']['evidence'])
    for name, info in proof['files'].items():
        verify(private / name, info['sha256'])
    links = []
    for entry in proof['linksRecordedNotFollowed']:
        links.append(str((private / entry['path']).readlink()) == entry['target'])
    result['checks'][f'node{node}PrivateRegularFiles'] = len(proof['files'])
    result['checks'][f'node{node}Links'] = {'count': len(links), 'allMatched': all(links)}
    payloads = ['build-source', 'clean/node_modules/jev-ios-bridge', 'build-source/build/plugin/jev-ios-bridge', 'plugin']
    for payload in payloads:
        for name, sha in audit['compiled69'].items():
            verify(private / payload / name, sha)
    result['checks'][f'node{node}CompiledPayloads'] = {'payloads': payloads, 'filesEach': len(audit['compiled69'])}
    preserved = PACKET / 'preserved' / VAULT.name / private.name
    for name, sha in audit['compiled69'].items():
        verify(preserved / 'build-source' / name, sha)
    for kind, archive in proof['archivesVerified'].items():
        relative = pathlib.Path(archive['path']).relative_to(VAULT.parent)
        verify(PACKET / 'preserved' / relative, archive['sha256'])
    commands = [json.loads(line) for line in (preserved / 'commands.jsonl').read_text().splitlines()]
    raw_read = []
    for command in commands:
        for channel in ['stdout', 'stderr']:
            raw = preserved / (command['id'] + '.' + channel)
            text = raw.read_text()
            raw_read.append({'path': str(raw.relative_to(ROOT)), 'sha256': digest(raw), 'bytes': len(text.encode())})
    result['checks'][f'node{node}DistributionRaw'] = {'commandCount': len(commands), 'exits': [c['exit'] for c in commands], 'signals': [c['signal'] for c in commands], 'rawFiles': raw_read}
    check = PACKET / 'preserved' / VAULT.name / f'tracked-root-final-node{node}-check.log'
    text = check.read_text()
    counts = {key: int(re.search(r'^ℹ '+key+r' (\d+)$', text, re.M)[1]) for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
    verify(check, audit['fullChecks'][f'tracked-root-final-node{node}-check']['rawSha256'])
    result['checks'][f'node{node}FullRaw'] = {'path': str(check.relative_to(ROOT)), 'sha256': digest(check), 'counts': counts, 'typecheck': 'tsc --noEmit' in text, 'build': 'tsc -p tsconfig.build.json' in text}
result['checks']['evidenceOnlyCommitsProductDelta'] = git('diff', '--name-only', audit['productCommit'], FINAL, '--', *SCOPE).decode().splitlines()
result['checks']['candidateChangedPaths'] = git('diff', '--name-only', audit['candidateCommit'], audit['productCommit'], '--', *SCOPE).decode().splitlines()
result['productDiffSha256'] = hashlib.sha256(git('diff', BASE+'...'+FINAL, '--', *SCOPE)).hexdigest()
result['checks']['legacyGoldenDelta'] = git('diff', '--name-only', BASE, FINAL, '--', *[str(p) for p in pathlib.Path('tests/golden').glob('*') if not p.name.startswith('observed-')]).decode().splitlines()
result['checks']['androidProductionDelta'] = git('diff', '--name-only', BASE, FINAL, '--', 'src/device/android').decode().splitlines()
result['status'] = 'PASS' if not result['errors'] else 'FAIL'
print(json.dumps(result, indent=2))
