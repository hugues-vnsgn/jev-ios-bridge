"""Audit retained integrated gates and complete package bytes without executing them."""
import argparse
from collections import Counter
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--evidence', required=True)
args = parser.parse_args()
os.umask(0o077)
root = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
parent = Path(__file__).resolve().parent
gates = Path(args.evidence).resolve()
context = json.loads((parent / 'cryptex-implementation-review/candidate-cli-context.json').read_text())
source = context['source441']
compiled = context['compiled69']
checks = []

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(name, passed):
    checks.append({'name': name, 'pass': bool(passed)})
    assert passed, name

check('441 integrated Source', len(source) == 441 and all(sha(root / p) == h for p, h in source.items()))
check('69 current compiled', len(compiled) == 69 and all(sha(root / p) == h for p, h in compiled.items()))
records = {}
for runtime, version in [('26', 'v26.8.1'), ('24', 'v24.0.0')]:
    for mode, label in [('check', 'cryptex-root-node' + runtime), ('proof', 'cryptex-installed-node' + runtime)]:
        path = gates / (label + '.json')
        record = json.loads(path.read_text())
        check(label + ' raw binding', sha(Path(record['rawLog'])) == record['rawSha256'])
        check(label + ' runtime/exit/mode', record['node'] == version and record['exit'] == 0 and record['mode'] == mode)
        check(label + ' all441 before/after', record['sourceBefore'] == source == record['sourceAfter'] and record['sourceUnchanged'])
        if mode == 'check':
            check(label + ' 1999 raw-backed counts', record['counts'] == {'tests': 1999, 'pass': 1999, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0})
        records[label] = {'receipt': str(path), 'sha256': sha(path), 'logSha256': record['rawSha256']}
    proof = gates / ('cryptex-installed-node' + runtime + '-installed')
    summary = json.loads((proof / 'summary.json').read_text())
    commands = [json.loads(line) for line in (proof / 'commands.jsonl').read_text().splitlines()]
    check(runtime + ' clean37-command proof', summary['status'] == 'PASS' and summary['node'] == version and summary['commandCount'] == len(commands) == 37 and summary['forbiddenEffects'] == 0 and summary['skips'] == 0)
    check(runtime + ' actual command closes', Counter(c['exit'] for c in commands) == {0: 19, 3: 18} and all(c['signal'] is None for c in commands))
    locations = ['build-source', 'clean/node_modules/jev-ios-bridge', 'plugin', 'build-source/build/plugin/jev-ios-bridge']
    for location in locations:
        payload = proof / location
        paths = {str(p.relative_to(payload)) for p in (payload / 'dist').rglob('*.js')}
        check(runtime + ' complete69 ' + location, paths == set(compiled) and all(sha(payload / p) == h for p, h in compiled.items()))
    snapshot = proof / 'build-source'
    copied = [p for p in source if (snapshot / p).is_file()]
    required_snapshot = {p for p in source if p.startswith(('src/', 'scripts/', 'skills/', 'docs/guide/')) or p in {'package.json', 'package-lock.json', 'tsconfig.build.json', 'tsconfig.json', 'README.md'}}
    check(runtime + ' snapshot Source association', required_snapshot.issubset(copied) and all(sha(snapshot / p) == source[p] for p in copied))
    archive = Path(summary['tarball']['path'])
    check(runtime + ' tarball digest', sha(archive) == summary['tarball']['sha256'])
    with tarfile.open(archive) as tar:
        members = [m for m in tar.getmembers() if m.name.startswith('package/dist/') and m.name.endswith('.js')]
        check(runtime + ' tarball complete69 set', len(members) == 69 and {m.name.removeprefix('package/') for m in members} == set(compiled))
        check(runtime + ' tarball complete69 bytes', all(m.isfile() and hashlib.sha256(tar.extractfile(m).read()).hexdigest() == compiled[m.name.removeprefix('package/')] for m in members))
    archive = Path(summary['pluginZip']['path'])
    check(runtime + ' plugin zip digest', sha(archive) == summary['pluginZip']['sha256'])
    with zipfile.ZipFile(archive) as zip:
        matches = {p: [n for n in zip.namelist() if n == p or n.endswith('/' + p)] for p in compiled}
        check(runtime + ' plugin zip complete69 unique', all(len(names) == 1 for names in matches.values()))
        check(runtime + ' plugin zip complete69 bytes', all(hashlib.sha256(zip.read(matches[p][0])).hexdigest() == h for p, h in compiled.items()))
    proof_summary = summary
    startup = root / '.scratch/observed-run-vault/root-isolated-probes' / ('cryptex-startup-node' + runtime)
    result = json.loads((startup / 'result.json').read_text())
    summary = json.loads((startup / 'execution/summary.json').read_text())
    check(runtime + ' wrapped startup actual close', result['exit'] == 0 and result['signal'] is None and not result['timedOut'] and result['sourceUnchanged'] and not result['cleanupErrors'])
    check(runtime + ' wrapped startup raw hashes', sha(startup / 'stdout') == result['stdoutSha256'] and sha(startup / 'stderr') == result['stderrSha256'])
    check(runtime + ' installed startup association', summary['status'] == 'PASS' and summary['node'] == version and Path(summary['installedProof']) == proof and summary['cliCommands'] == 2 and summary['mcpCalls'] == 3 and summary['sdkDriverChildEffects'] == summary['productionAccountRootOperations'] == 0)
    records['proof-node' + runtime] = {'summary': str(proof / 'summary.json'), 'sha256': sha(proof / 'summary.json'), 'commandCount': 37, 'snapshotSourceCount': len(copied), 'compiled69Locations': locations, 'tarballSha256': proof_summary['tarball']['sha256'], 'pluginZipSha256': proof_summary['pluginZip']['sha256'], 'startupSummary': str(startup / 'execution/summary.json'), 'startupSha256': sha(startup / 'execution/summary.json')}
host = json.loads((root / '.scratch/observed-integration/acceptance/host/accepted-host-freeze.json').read_text())['files']
check('original15 host hashes preserved', len(host) == 15 and all(sha(root / p) == h for p, h in host.items()))
output = parent / 'root-repaired-distribution-binding.json'
assert not output.exists(), 'Preserve every prior binding'
record = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'integrationHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(), 'candidate': context['candidate'], 'source441': source, 'compiled69': compiled, 'records': records, 'checks': checks, 'scope': 'Integrated physical host checks and fresh npm/plugin payload/startup correspondence; original H rows and repair reviews apply within their recorded limits. Actual installed compatibility and live entry remain unverified.'}
output.write_text(json.dumps(record, indent=2) + '\n')
output.chmod(0o600)
print(json.dumps({'checks': len(checks), 'output': str(output), 'sha256': sha(output)}))
