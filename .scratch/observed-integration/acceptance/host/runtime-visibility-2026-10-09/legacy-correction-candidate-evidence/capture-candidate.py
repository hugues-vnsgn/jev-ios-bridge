import datetime, hashlib, json, os, re, subprocess
from pathlib import Path

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
EVIDENCE = ROOT / '.scratch/installed-legacy-volume-runtime/review-correction'
os.umask(0o077)
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
def git(*args, input=None):
    return subprocess.run(['/usr/bin/git', *args], cwd=ROOT, input=input, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True, env={'PATH': '/usr/bin:/bin',
                          'HOME': '/Users/hugues_mini', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'}).stdout
def put(name, value):
    path = EVIDENCE / name
    with path.open('x') as stream: json.dump(value, stream, indent=2); stream.write('\n')
    path.chmod(0o600)
    return sha(path)

baseline = json.loads((EVIDENCE / 'baseline.json').read_text())
audit = json.loads((EVIDENCE / 'predefault-freeze-audit.json').read_text())
assert audit['verdict'] == 'PASS' and all(row['pass'] for row in audit['checks'])
head = git('rev-parse', 'HEAD').decode().strip()
parent = git('rev-parse', 'HEAD^').decode().strip()
assert parent == baseline['base'] and head != parent
assert set(git('diff-tree', '--no-commit-id', '--name-only', '-r', head).decode().splitlines()) == set(baseline['owned3'])
assert not git('status', '--porcelain', '--untracked-files=no')
source = {p: sha(ROOT / p) for p in baseline['source443']}
assert source == audit['source443']
selectors = ['src', 'tests', 'docs', 'skills', 'scripts', '.github', 'package.json', 'package-lock.json',
             'README.md', 'AGENTS.md', 'GLOSSARY.md', 'tsconfig.json', 'tsconfig.build.json']
paths = sorted(p for p in git('ls-files', '-z', *selectors).decode().split('\0') if p)
assert paths == sorted(source) and len(paths) == 443 and not any('.env' in Path(p).parts for p in paths)
request = ''.join(head + ':' + p + '\n' for p in paths).encode()
blobs = git('cat-file', '--batch', input=request)
offset = 0; git_source = {}
for path in paths:
    end = blobs.index(b'\n', offset); header = blobs[offset:end].decode().split(); offset = end + 1
    assert len(header) == 3 and header[1] == 'blob'
    size = int(header[2]); data = blobs[offset:offset + size]; offset += size
    assert blobs[offset:offset + 1] == b'\n'; offset += 1
    git_source[path] = hashlib.sha256(data).hexdigest()
assert offset == len(blobs) and git_source == source
compiled = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'dist').rglob('*'))
            if p.is_file() and not p.is_symlink()}
assert compiled == audit['compiled69'] and len(compiled) == 69
context = {'capturedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'authorCwd': str(ROOT), 'candidateCommit': head, 'parentCommit': parent,
           'source443': source, 'gitSource443': git_source, 'owned3': audit['owned3'],
           'protected440': baseline['protected440'], 'compiled69': compiled,
           'basisContextSha256': baseline['sourceContextSha256'],
           'dispatchSha256': baseline['dispatchSha256'], 'baselineSha256': sha(EVIDENCE / 'baseline.json'),
           'predefaultAuditSha256': sha(EVIDENCE / 'predefault-freeze-audit.json'),
           'genuineRedAuditSha256': sha(EVIDENCE / 'genuine-red-audit.json'),
           'candidatePackagingStartup': 'PREPARED ONLY; held for later Root dispatch after both reviews PASS',
           'nativeCompatibilityAndAcceptance': 'NOT RUN',
           'original4faDefaultFailureCause': 'UNRESOLVED; original failure and diagnostics preserved',
           'commitCommand': ['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', 'commit', '-m',
                             'fix: bind mounted metadata proofs to captured identity']}
digest = put('candidate-source.json', context)
put('postcommit-correspondence.json', {'candidateCommit': head, 'parentCommit': parent,
    'candidateContextSha256': digest, 'sourceGitWorking443Exact': True, 'protected440Exact': True,
    'compiled69ExactBothFinalBuilds': True, 'threeChangedPaths': sorted(baseline['owned3']),
    'trackedWorkingTreeClean': True, 'commitHooks': 'command-scoped disabled; no hook tests/gates invoked'})

def diagnostics(label):
    rows = []
    for line in (EVIDENCE / label / 'stdout.txt').read_text().splitlines():
        if line.startswith('ℹ {') or line.startswith('# {'):
            value = json.loads(line[2:])
            if value.get('kind') in ['legacy', 'cryptex'] and 'leaf' in value: rows.append(value)
    assert len(rows) == 42
    return rows
def key(row): return (row['kind'], row['leaf'], row['layer'], row.get('stage', 'identity'))
reds = {node: {key(row): row for row in diagnostics('red-node' + node)} for node in ['26', '24']}
greens = {node: {key(row): row for row in diagnostics('final-green-node' + node)} for node in ['26', '24']}
assert all(len(mapping) == 42 for mapping in [*reds.values(), *greens.values()])
assert set(reds['26']) == set(reds['24']) == set(greens['26']) == set(greens['24'])
matrix = []
for ordinal, case in enumerate(reds['26'], 1):
    kind, leaf, layer, stage = case
    if stage == 'identity':
        title = f'review correction {kind} binds {leaf} during restored {layer} identity'
        finding = 'P1'; clause = 27
    else:
        title = f'review correction {kind} {layer} {leaf} abort at {stage} permits close only'
        finding = 'P2'; clause = 23
    row = {'ordinal': ordinal, 'testName': title, 'finding': finding, 'policyClause': clause,
           'mountClass': kind, 'leaf': leaf, 'layer': layer, 'stage': stage, 'nodes': {}}
    for node in ['26', '24']:
        red, green = reds[node][case], greens[node][case]
        if stage == 'identity':
            assert red['accepted'] and red['changed'] and red['restored'] and red['readonlyXmlUnchanged']
            assert any(x['ino'] == '202' for x in red['mountObservations'])
            assert not green['accepted'] and green['changed'] and green['metadataConversions'] == 0
        else:
            assert red['abortObserved'] and [x['operation'] for x in red['postAbort']] == ['opened-stat', 'close']
            assert green['abortObserved'] and [x['operation'] for x in green['postAbort']] == ['close']
            assert not green['newEffects'] and not green['newFixtureLaunches']
        row['nodes'][node] = {'red': red, 'green': green,
                             'redCommandSha256': sha(EVIDENCE / ('red-node' + node) / 'command.json'),
                             'greenCommandSha256': sha(EVIDENCE / ('final-green-node' + node) / 'command.json')}
    matrix.append(row)
matrix_digest = put('correction-regression-matrix.json', {'candidateCommit': head, 'candidateContextSha256': digest,
    'rows': matrix, 'original199': {'bodyAndAssertionsPreserved': True,
        'predefaultAuditSha256': sha(EVIDENCE / 'predefault-freeze-audit.json'),
        'parameterRowsAndOriginalDuplicateDisplayLabelQualification': 'Retained from4fa; do not identify a case solely by display label'},
    'rawNewRedCounts': {'node26': {'tests': 42, 'pass': 0, 'fail': 42}, 'node24': {'tests': 42, 'pass': 0, 'fail': 42}},
    'rawFinalGreenCounts': {'node26': {'tests': 42, 'pass': 42, 'fail': 0}, 'node24': {'tests': 42, 'pass': 42, 'fail': 0}}})
print(json.dumps({'candidateCommit': head, 'parent': parent, 'contextSha256': digest,
                  'matrixSha256': matrix_digest, 'source': 443, 'protected': 440, 'compiled': 69}))
