"""Root retained-evidence audit; does not execute product or native operations."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

os.umask(0o077)
root = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
author = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
evidence = author / '.scratch/installed-cryptex-runtime'
review = Path(__file__).resolve().parent
candidate = '720cb380d07102d72b20a6a4f5f7787a0ab88f2b'
parent = 'dadde33a36440db6d9414adf84f80916caa9d2b3'
base = '38aa879c3954c9d7742ef04059cad4d2fc824c87'
checks = []

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(name, passed, detail=None):
    checks.append({'name': name, 'pass': bool(passed), 'detail': detail})
    assert passed, name

def git(*argv):
    return subprocess.check_output(['git', *argv], cwd=author, text=True).strip()

manifest_path = evidence / 'candidate-cli-source-precommit.json'
manifest = json.loads(manifest_path.read_text())
source = manifest['source441']
owned = manifest['owned5']
protected = manifest['protected436']
check('immutable candidate HEAD', git('rev-parse', 'HEAD') == candidate)
check('five owned / 441 Source / 436 protected', (len(owned), len(source), len(protected)) == (5, 441, 436))
check('exact five-file base delta', set(git('diff', '--name-only', base, candidate).splitlines()) == set(owned))
check('exact two-file successor delta', set(git('diff', '--name-only', parent, candidate).splitlines()) == {'tests/fixtures/observed-cli-server.ts', 'tests/observed-cryptex-runtime.test.ts'})
check('441 working bytes', all(sha(author / p) == expected for p, expected in source.items()))
check('441 candidate Git blobs', all(hashlib.sha256(subprocess.check_output(['git', 'show', candidate + ':' + p], cwd=author)).hexdigest() == expected for p, expected in source.items()))
check('436 Root accepted baseline bytes', all(sha(root / p) == expected for p, expected in protected.items()))
check('production unchanged from first green', source['src/observed/allocation-config.ts'] == '7d5798570970ca8de9fcca980b39662c4cf2b9be939e1ad31f23e9383e82fe62')
compiled = json.loads((evidence / 'build-cli-final-node26/compiled-manifest.json').read_text())
other = json.loads((evidence / 'build-cli-final-node24/compiled-manifest.json').read_text())
check('both actual builds / current compiled 69', len(compiled) == 69 and compiled == other and all(sha(author / p) == h for p, h in compiled.items()))
gates = {}
times = []
for stem, expected_count in [('cli-affected', 235), ('focused-cli-final', 505), ('typecheck-cli-final', None), ('coverage-cli-final', 354), ('build-cli-final', None)]:
    for runtime in ['26', '24']:
        name = stem + '-node' + runtime
        directory = evidence / name
        command = json.loads((directory / 'command.json').read_text())
        result = json.loads((directory / 'result.json').read_text())
        raw = (directory / 'stdout.txt').read_text()
        counts = {}
        for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
            found = re.findall(r'(?m)^(?:# |ℹ )' + key + r' (\d+)\s*$', raw)
            if found:
                counts[key] = int(found[-1])
        check(name + ' raw outputs', all(sha(directory / (s + '.txt')) == command[s + 'Sha256'] == result[s + 'Sha256'] for s in ['stdout', 'stderr']))
        check(name + ' receipt', sha(directory / 'command.json') == result['receiptSha256'])
        check(name + ' actual exit / close', command['exitCode'] == result['exitCode'] == 0 and result['actualCloseRecorded'])
        check(name + ' before / after Source', result['source441Before'] == source == result['source441After'] and result['protected436'] == protected and result['protected436Match'] and result['source441Match'])
        check(name + ' owned5 binding', command['owned5'] == owned and result['owned5Authoritative'])
        if expected_count is not None:
            check(name + ' raw counts', counts == {'tests': expected_count, 'pass': expected_count, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0} and all(result['counts'].get(k) == v for k, v in counts.items()))
        start = datetime.datetime.fromisoformat(command['startedAtUtc'].replace('Z', '+00:00'))
        end = datetime.datetime.fromisoformat(command['completedAtUtc'].replace('Z', '+00:00'))
        check(name + ' actual lifetime', start < end)
        times.append((start, end, name))
        gates[name] = {'receipt': str(directory / 'command.json'), 'sha256': sha(directory / 'command.json'), 'exit': 0, 'counts': counts, 'start': command['startedAtUtc'], 'close': command['completedAtUtc']}
times.sort()
check('all affected/final gates serial', all(a[1] <= b[0] for a, b in zip(times, times[1:])))
pure = {}
for color, expected in [('red', {'tests': 14, 'pass': 11, 'fail': 3, 'cancelled': 0, 'skipped': 0, 'todo': 0}), ('green', {'tests': 14, 'pass': 14, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0})]:
    for runtime in ['26', '24']:
        name = 'cli-map-' + color + '-node' + runtime
        directory = evidence / name
        command = json.loads((directory / 'command.json').read_text())
        counts = {}
        raw = (directory / 'stdout.txt').read_text()
        for key in expected:
            found = re.findall(r'(?m)^(?:# |ℹ )' + key + r' (\d+)\s*$', raw)
            if found:
                counts[key] = int(found[-1])
        check(name + ' genuine raw counts / exit', counts == expected and command['exitCode'] == (1 if color == 'red' else 0))
        check(name + ' raw hash', all(sha(directory / (s + '.txt')) == command[s + 'Sha256'] for s in ['stdout', 'stderr']))
        pure[name] = {'counts': counts, 'receiptSha256': sha(directory / 'command.json')}
host = json.loads((root / '.scratch/observed-integration/acceptance/host/accepted-host-freeze.json').read_text())['files']
check('original15 accepted host files preserved', len(host) == 15 and all(sha(root / p) == h for p, h in host.items()))
record = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidate': candidate, 'parent': parent, 'base': base, 'manifest': str(manifest_path), 'manifestSha256': sha(manifest_path), 'owned5': owned, 'source441': source, 'protected436': protected, 'compiled69': compiled, 'gates': gates, 'pureMapping': pure, 'checks': checks, 'fullDefaultGates': 'HELD pending separate Root grant', 'independentReview': 'new candidate pending; old Spec FAIL and Standards staticPASS preserved', 'actualInstalledCompatibility': 'UNVERIFIED', 'liveRows': 'L01-L05 UNVERIFIED'}
output = review / 'candidate-cli-context.json'
assert not output.exists(), 'Never replace an earlier context'
output.write_text(json.dumps(record, indent=2) + '\n')
output.chmod(0o600)
print(json.dumps({'candidate': candidate, 'checks': len(checks), 'source': len(source), 'protected': len(protected), 'compiled': len(compiled), 'output': str(output), 'sha256': sha(output)}))
