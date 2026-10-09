"""Read retained author predefault receipts; no tests or native operations."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
os.umask(0o077)
root = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
author = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
parent = Path(__file__).resolve().parent
out = parent / 'root-predefault-author-correspondence.json'
assert not out.exists(), 'Retain every audit attempt'
def read(base, name):
    p = base / name
    assert p.is_relative_to(base) and not p.is_symlink() and p.is_file(), name
    return p.read_bytes()
def sha(b): return hashlib.sha256(b).hexdigest()
checks = []
def check(name, passed):
    checks.append({'name': name, 'pass': bool(passed)})
    assert passed, name
oracle = json.loads(read(parent, 'baseline-oracle.json'))
prepath = '.scratch/installed-legacy-volume-runtime/predefault-audit.json'
prebytes = read(author, prepath)
pre = json.loads(prebytes)
source, compiled = pre['source443'], pre['compiled69']
check('approved baseline', pre['base'] == oracle['baselineCandidate'])
check('443 candidate Source and three owned paths', len(source) == 443 and set(pre['owned3']) == set(oracle['ownedModified'] + oracle['ownedNew']))
check('440 baseline paths protected', pre['protected440'] == oracle['protected440'])
check('full candidate Source current', all(sha(read(author, p)) == h for p, h in source.items()))
check('69 candidate compiled current', len(compiled) == 69 and all(sha(read(author, p)) == h for p, h in compiled.items()))
check('only allocation compiled delta', pre['compiledChangedFromBase'] == ['dist/observed/allocation-config.js'])
last = None
records = {}
for label in pre['serialFinalGateOrder']:
    directory = '.scratch/installed-legacy-volume-runtime/' + label
    resultbytes = read(author, directory + '/result.json')
    result = json.loads(resultbytes)
    commandbytes = read(author, directory + '/command.json')
    command = json.loads(commandbytes)
    stdout = read(author, directory + '/stdout.txt')
    stderr = read(author, directory + '/stderr.txt')
    check(label + ' raw/result receipt bindings', sha(commandbytes) == result['receiptSha256'] and sha(stdout) == command['stdoutSha256'] == result['stdoutSha256'] and sha(stderr) == command['stderrSha256'] == result['stderrSha256'])
    check(label + ' actual closed successful', command['exitCode'] == result['exitCode'] == 0 and result['actualCloseRecorded'])
    check(label + ' Source unchanged protected', command['candidateSource443'] == result['source443'] == source and result['source443Unchanged'] and command['protected440Match'] and result['protected440Match'])
    runtime = label[-2:]
    executable = '/opt/homebrew/Cellar/node/26.8.1/bin/node' if runtime == '26' else '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
    check(label + ' bound exact executable and cwd', command['argv'][0] == executable and command['cwd'] == str(author))
    check(label + ' serial close before next start', last is None or last <= command['startedAtUtc'])
    last = command['completedAtUtc']
    check(label + ' credential/loader scrub', command['credentialAndNodeOverridesScrubbed'] and all(k not in command['env'] for k in ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS']))
    counts = {}
    text = stdout.decode()
    for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
        matches = re.findall(r'(?m)^(?:# |ℹ )' + key + r' (\d+)\s*$', text)
        if matches: counts[key] = int(matches[-1])
    if label.startswith(('focused-', 'coverage-')):
        total = 704 if label.startswith('focused-') else 553
        expected = {'tests': total, 'pass': total, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
        check(label + ' complete raw count agreement', counts == expected and all(result['counts'].get(k) == v for k, v in counts.items()))
    if label.startswith('build-'):
        check(label + ' compiled Source correspondence', result['compiled69'] == compiled)
    records[label] = {'receipt': directory + '/command.json', 'receiptSha256': sha(commandbytes), 'resultSha256': sha(resultbytes), 'stdoutSha256': sha(stdout), 'stderrSha256': sha(stderr), 'counts': counts, 'completedAtUtc': last}
host = json.loads(read(root, '.scratch/observed-integration/acceptance/host/accepted-host-freeze.json'))['files']
check('original15 host preserved', len(host) == 15 and all(sha(read(root, p)) == h for p, h in host.items()))
record = {'atUtc': datetime.now(timezone.utc).isoformat(), 'status': 'PASS predefault provenance only', 'authorPredefaultAudit': prepath, 'authorPredefaultAuditSha256': sha(prebytes), 'source443': source, 'compiled69': compiled, 'owned3': pre['owned3'], 'protected440': pre['protected440'], 'records': records, 'checks': checks, 'scope': 'Repository-only read of already closed focused/coverage/typecheck/build receipts. Implementation review, actual unmodified defaults, integration/distribution, native compatibility and live acceptance remain pending.'}
out.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'status': record['status'], 'checks': len(checks), 'sha256': sha(out.read_bytes()), 'output': str(out)}))
