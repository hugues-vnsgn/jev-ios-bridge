import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess

os.umask(0o077)
HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
AUTHOR = pathlib.Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
EVIDENCE = AUTHOR / '.scratch/installed-cryptex-runtime'
CANDIDATE = '720cb380d07102d72b20a6a4f5f7787a0ab88f2b'
checks = []
inputs = {}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def obj(path):
    return json.loads(path.read_bytes())

def check(name, condition):
    checks.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)

def retain(path, name, expected=None):
    data = path.read_bytes()
    if expected:
        check(name + ' frozen hash', sha(data) == expected)
    target = HERE / 'inputs' / 'defaults' / name
    target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    target.write_bytes(data)
    target.chmod(0o600)
    inputs[str(path)] = {'sha256': sha(data), 'bytes': len(data), 'retained': str(target.relative_to(HERE))}

root_audit = ROOT / 'root-successor-default-audit.json'
retain(root_audit, 'root-successor-default-audit.json', '611fdc525d7376e7a2c8a07fdd4590dee9a6479bc403923620f9a6f442a61a29')
root = obj(root_audit)
for path, expected in root['frozenFinalInputs'].items():
    retain(pathlib.Path(path), 'author/' + pathlib.Path(path).name, expected)
retain(ROOT / 'root-successor-default-audit-first-failure.json', 'root-successor-default-audit-first-failure.json')
manifest = obj(EVIDENCE / 'candidate-cli-source.json')
summary = obj(EVIDENCE / 'actual-default-cli-summary.json')
check('candidate manifest remains frozen', sha((EVIDENCE / 'candidate-cli-source.json').read_bytes()) == 'de35d66204122d4b4561e60f20136d15545edf03ebc1c3cbaefd245888770b3b')
check('candidate HEAD frozen', subprocess.check_output(['git', '-C', str(AUTHOR), 'rev-parse', 'HEAD']).decode().strip() == CANDIDATE)
check('current441 Source remains frozen', all(sha((AUTHOR / p).read_bytes()) == h for p, h in manifest['source441'].items()))
package_bytes = (AUTHOR / 'package.json').read_bytes()
check('package hash-bound to frozen Source', sha(package_bytes) == manifest['source441']['package.json'])
package = json.loads(package_bytes)
check('unmodified package default scripts', package['scripts']['check'] == 'npm run typecheck && npm test && npm run build' and package['scripts']['test'] == 'tsx --test tests/*.test.ts')
retain(AUTHOR / 'package.json', 'package.json')
check('summary complete Source/owned/protected/compiled maps', all(summary[k] == manifest[k] for k in ['source441', 'owned5', 'protected436', 'compiled69']))
gates = []
for node, expected in summary['defaults'].items():
    receipt_path = AUTHOR / expected['receipt']
    receipt = obj(receipt_path)
    label = receipt_path.parent.name
    retain(receipt_path, label + '/command.json', expected['receiptSha256'])
    check(node + ' Root receipt binding', expected['receiptSha256'] == root['gates'][node]['receiptSha256'])
    result_path = AUTHOR / expected['result']
    retain(result_path, label + '/result.json', expected['resultSha256'])
    result = obj(result_path)
    raw = {}
    for stream in ['stdout', 'stderr']:
        data = (receipt_path.parent / (stream + '.txt')).read_bytes()
        check(node + ' ' + stream + ' hash/length', sha(data) == receipt[stream + 'Sha256'] == expected[stream + 'Sha256'] and len(data) == receipt[stream + 'Bytes'])
        retain(receipt_path.parent / (stream + '.txt'), label + '/' + stream + '.txt')
        raw[stream] = data.decode()
    counts = {k: int(v) for k, v in re.findall(r'^. (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw['stdout'], re.M)}
    check(node + ' raw seven counts1999', counts == expected['counts'] == result['counts'] == {'tests': 1999, 'suites': 0, 'pass': 1999, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0})
    check(node + ' actual exit0 close', receipt['exitCode'] == result['exitCode'] == 0 and result['actualCloseRecorded'] and receipt['completedAtUtc'] == result['completedAtUtc'])
    check(node + ' exact npm argv default', receipt['argv'][1:] == ['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', 'run', 'check'])
    check(node + ' no credential/runtime override environment', set(receipt['env']) == {'PATH', 'HOME', 'LANG', 'LC_ALL', 'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG', 'NPM_CONFIG_CACHE'} and receipt['commandChildUmask'] == '022')
    check(node + ' receipt full candidate binding', receipt['candidateSource441'] == manifest['source441'] and receipt['owned5'] == manifest['owned5'] and receipt['frozenCommit'] == CANDIDATE)
    check(node + ' result source before/after/protected/compiled binding', result['source441Before'] == manifest['source441'] and result['source441After'] == manifest['source441'] and result['protected436'] == manifest['protected436'] and result['compiled69After'] == manifest['compiled69'])
    markers = [f"> {package['name']}@{package['version']} {stage}" for stage in ['check', 'typecheck', 'test', 'build']]
    check(node + ' exact stage markers ordered', all(raw['stdout'].count(marker + '\n') == 1 for marker in markers) and [raw['stdout'].index(marker) for marker in markers] == sorted(raw['stdout'].index(marker) for marker in markers))
    for key in ['runtimeReceipt', 'buildProof', 'compiledManifest']:
        retain(AUTHOR / expected[key], label + '/' + pathlib.Path(expected[key]).name, expected[key + 'Sha256'])
    runtime_path = AUTHOR / expected['runtimeReceipt']
    runtime = obj(runtime_path)
    for stream in ['stdout', 'stderr']:
        data = (runtime_path.parent / (stream + '.txt')).read_bytes()
        check(node + ' retained runtime ' + stream + ' hash', sha(data) == runtime[stream + 'Sha256'])
        retain(runtime_path.parent / (stream + '.txt'), label + '/runtime-' + stream + '.txt')
    check(node + ' exact runtime version receipt', (runtime_path.parent / 'stdout.txt').read_text().strip() == ('v26.8.1' if node == '26' else 'v24.0.0') and runtime['exitCode'] == 0)
    compiled = obj(AUTHOR / expected['compiledManifest'])
    check(node + ' archived compiled69 map', compiled == manifest['compiled69'])
    check(node + ' actual archived compiled69 bytes', all(sha((receipt_path.parent / 'compiled' / p).read_bytes()) == h for p, h in compiled.items()))
    gates.append({'node': node, 'receiptSha256': expected['receiptSha256'], 'resultSha256': expected['resultSha256'], 'counts': counts, 'argv': receipt['argv'], 'startedAtUtc': receipt['startedAtUtc'], 'completedAtUtc': receipt['completedAtUtc'], 'exitCode': 0})
check('actual pair serial close', gates[0]['node'] == '26' and gates[1]['node'] == '24' and gates[0]['completedAtUtc'] < gates[1]['startedAtUtc'])
old = EVIDENCE / 'actual-default-node26/command.json'
retain(old, 'old-failed-default-command.json', '02c92c11b6b376ec1d1680bf1bf153e4ee3222870d9a7166f5139a59b1d103e5')
check('prior Standards manifest unchanged', sha((HERE.parent / 'manifest.json').read_bytes()) == '91ea0e45cfa6ff78646cb928dd3daaa30395f2e092adac90fcd2dca65af8ec78')
output = {'axis': 'Standards evidence association', 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidate': CANDIDATE, 'checks': checks, 'gates': gates, 'inputs': inputs, 'verdict': 'PASS', 'scope': 'Frozen successor Standards and retained author default gates only; no installed/native/live or Ticket12 acceptance.', 'rootAuditCorrectionLimit': obj(ROOT / 'root-successor-default-audit-first-failure.json')}
(HERE / 'default-audit.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'checks': len(checks), 'allPass': all(c['pass'] for c in checks), 'defaultCounts': '1999/1999 both', 'verdict': 'PASS'}))
