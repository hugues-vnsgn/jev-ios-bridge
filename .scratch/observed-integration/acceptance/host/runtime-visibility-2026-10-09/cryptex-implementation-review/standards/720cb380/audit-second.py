import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess

os.umask(0o077)
HERE = pathlib.Path(__file__).parent
AUTHOR = pathlib.Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
ROOT = HERE.parent.parent
EVIDENCE = AUTHOR / '.scratch/installed-cryptex-runtime'
BASE = '38aa879c3954c9d7742ef04059cad4d2fc824c87'
PARENT = 'dadde33a36440db6d9414adf84f80916caa9d2b3'
CANDIDATE = '720cb380d07102d72b20a6a4f5f7787a0ab88f2b'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    return pathlib.Path(path).read_bytes()

def obj(path):
    return json.loads(read(path))

def git(*args):
    return subprocess.check_output(['git', '-C', str(AUTHOR), *args])

def blob(ref, path):
    return git('show', f'{ref}:{path}')

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(data)
    path.chmod(0o600)

def json_write(path, data):
    write(path, (json.dumps(data, indent=2) + '\n').encode())

manifest = obj(EVIDENCE / 'candidate-cli-source.json')
context = obj(ROOT / 'candidate-cli-context.json')
oracle = obj(ROOT / 'oracle-cli-inputs.json')
scope = obj(EVIDENCE / 'cli-isolation-scope-proof.json')
checks = []
inputs = {}

def check(name, condition, detail=None):
    checks.append({'name': name, 'pass': bool(condition), 'detail': detail})
    if not condition:
        raise AssertionError(name)

def retain(path, name=None, expected=None):
    data = read(path)
    name = name or pathlib.Path(path).name
    if expected:
        check(f'input {name} sha', sha(data) == expected)
    write(HERE / 'inputs' / name, data)
    inputs[str(path)] = {'sha256': sha(data), 'bytes': len(data), 'retained': 'inputs/' + name}

check('frozen oracle hash', sha(read(ROOT / 'oracle-cli-inputs.json')) == 'eb5e488151620195f768555d8317ad83b99831109152aa709d701947f72765fd')
for group in ['authorFinalInputs', 'rootInputs']:
    for path, expected in oracle[group].items():
        retain(path, 'oracle/' + group + '/' + pathlib.Path(path).name, expected)

check('HEAD frozen', git('rev-parse', 'HEAD').decode().strip() == CANDIDATE)
check('441 Source / 436 protected / 5 owned', len(manifest['source441']) == 441 and len(manifest['protected436']) == 436 and len(manifest['owned5']) == 5)
check('context Source equals candidate manifest', context['source441'] == manifest['source441'])
check('context protected and owned equal manifest', context['protected436'] == manifest['protected436'] and context['owned5'] == manifest['owned5'])
check('441 committed blobs', all(sha(blob(CANDIDATE, p)) == h for p, h in manifest['source441'].items()))
check('441 current bytes', all(sha(read(AUTHOR / p)) == h for p, h in manifest['source441'].items()))
check('436 protected base blobs', all(sha(blob(BASE, p)) == h for p, h in manifest['protected436'].items()))
delta = git('diff', '--name-only', PARENT + '...' + CANDIDATE).decode().splitlines()
check('exact successor two paths', delta == ['tests/fixtures/observed-cli-server.ts', 'tests/observed-cryptex-runtime.test.ts'])
check('exact cumulative five owned paths', set(git('diff', '--name-only', BASE + '...' + CANDIDATE).decode().splitlines()) == set(manifest['owned5']))
check('three policy files unchanged from parent', all(blob(PARENT, p) == blob(CANDIDATE, p) for p in manifest['owned5'] if p not in delta))
diff = git('diff', '--unified=4', PARENT + '...' + CANDIDATE)
write(HERE / 'diff.txt', diff)
for p in manifest['owned5']:
    data = blob(CANDIDATE, p)
    write(HERE / 'inputs' / 'candidate' / p, data)
    inputs[f'git:{CANDIDATE}:{p}'] = {'sha256': sha(data), 'bytes': len(data), 'retained': 'inputs/candidate/' + p}

fixture = blob(CANDIDATE, delta[0]).decode()
prior_fixture = blob(PARENT, delta[0]).decode()
declaration = "export const mapPublicFixturePath = (root: string, path: string) =>\n  path === root || path.startsWith(root + '/') ? path\n    : path === '/' || /^\\/(?:Applications|Library|System|usr|private)(?:\\/|$)/.test(path) ? join(root, 'host', path) : path;\n\n"
old_map = "const map = (path: string) => /^\\/(?:Applications|Library|System|usr)(?:\\/|$)/.test(path) ? join(context.root, 'host', path) : path;"
new_map = "const map = (path: string) => mapPublicFixturePath(context.root, path);"
check('fixture only declaration/delegation/map delta', fixture.count(declaration) == 1 and fixture.replace(declaration, '').replace(new_map, old_map) == prior_fixture)
suite = blob(CANDIDATE, delta[1]).decode()
prior_suite = blob(PARENT, delta[1]).decode()
pure_import = "import { mapPublicFixturePath } from './fixtures/observed-cli-server.js';\n"
start = suite.index("const purePublicRoot = ")
anchor = "for (const path of ['/', '/private', cryptexInfo]) {"
first = suite.index(anchor, start)
end = suite.index(anchor, first + len(anchor))
check('original 166-case suite exact bytes', (suite[:start] + suite[end:]).replace(pure_import, '') == prior_suite)
red_fixture = read(EVIDENCE / 'cli-isolation-red-observed-cli-server.ts').decode()
green_fixture = read(EVIDENCE / 'cli-isolation-green-observed-cli-server.ts').decode()
red_declaration = "export const mapPublicFixturePath = (root: string, path: string) =>\n  /^\\/(?:Applications|Library|System|usr)(?:\\/|$)/.test(path) ? join(root, 'host', path) : path;\n\n"
check('red extraction exact original expression and delegation', red_fixture.replace(red_declaration, '').replace(new_map, old_map) == prior_fixture)
check('green fixture snapshot equals candidate', green_fixture == fixture)
check('pure assertions unchanged red to green', read(EVIDENCE / 'cli-isolation-red-observed-cryptex-runtime.test.ts') == suite.encode())
check('original snapshots equal parent', read(EVIDENCE / 'before-cli-isolation-observed-cli-server.ts') == prior_fixture.encode() and read(EVIDENCE / 'before-cli-isolation-observed-cryptex-runtime.test.ts') == prior_suite.encode())

retained_gates = []
gates = dict(manifest['finalGates'])
gates.update({k: v for k, v in scope['pureChecks'].items()})
for label, expected in gates.items():
    path = AUTHOR / expected['receipt']
    receipt = obj(path)
    retain(path, 'receipts/' + path.parent.name + '/command.json', expected['receiptSha256'])
    raw = {}
    for stream in ['stdout', 'stderr']:
        data = read(path.parent / (stream + '.txt'))
        check(label + ' ' + stream + ' hash/length', sha(data) == receipt[stream + 'Sha256'] and len(data) == receipt[stream + 'Bytes'])
        retain(path.parent / (stream + '.txt'), 'receipts/' + path.parent.name + '/' + stream + '.txt')
        raw[stream] = data.decode()
    counts = {k: int(v) for k, v in re.findall(r'^. (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw['stdout'], re.M)}
    check(label + ' exact seven raw counts', counts == expected['counts'])
    check(label + ' exit and actual completion', receipt['exitCode'] == expected['exitCode'] and bool(receipt.get('completedAtUtc')))
    source = receipt['candidateSource441']
    expected_source = dict(manifest['source441'])
    if label.startswith('red-'):
        expected_source[delta[0]] = sha(red_fixture.encode())
    check(label + ' exact Source association', source == expected_source)
    if 'result' in expected:
        rp = AUTHOR / expected['result']
        result = obj(rp)
        retain(rp, 'receipts/' + path.parent.name + '/result.json', expected['resultSha256'])
        check(label + ' result source before/after and protected', result['source441Before'] == expected_source and result['source441After'] == expected_source and result['protected436'] == manifest['protected436'] and result['actualCloseRecorded'])
    retained_gates.append({'label': path.parent.name, 'receiptSha256': sha(read(path)), 'argv': receipt['argv'], 'counts': counts, 'exitCode': receipt['exitCode'], 'startedAtUtc': receipt['startedAtUtc'], 'completedAtUtc': receipt['completedAtUtc'], 'stdoutSha256': receipt['stdoutSha256'], 'stderrSha256': receipt['stderrSha256']})

compiled = manifest['compiled69']
check('compiled69 manifest size', len(compiled) == 69)
for label in ['build-cli-final-node26', 'build-cli-final-node24', 'build-final-node26', 'build-final-node24']:
    cp = EVIDENCE / label / 'compiled-manifest.json'
    cm = obj(cp)
    mapping = cm.get('files', cm)
    if mapping != compiled:
        # Older manifests retain the map directly under compiled69.
        mapping = cm.get('compiled69', cm)
    check(label + ' archived compiled map equals candidate', mapping == compiled)
    check(label + ' actual compiled bytes', all(sha(read(EVIDENCE / label / 'compiled' / p)) == h for p, h in compiled.items()))
    retain(cp, 'compiled/' + label + '.json')

for name in ['candidate-cli-source.json', 'verification-index-cli.json', 'clause-regression-matrix-cli.json', 'cli-isolation-report.md', 'cli-isolation-scope-proof.json', 'cli-isolation-extraction.json', 'cli-isolation-job-schema-note.json', 'cli-packaging-selector-failed.json', 'cli-packaging-selector-corrected.json', 'cli-freeze-inventory-assertion.json', 'cli-isolation-red-observed-cli-server.ts', 'cli-isolation-green-observed-cli-server.ts', 'cli-isolation-red-observed-cryptex-runtime.test.ts', 'before-cli-isolation-observed-cli-server.ts', 'before-cli-isolation-observed-cryptex-runtime.test.ts']:
    retain(EVIDENCE / name, 'author/' + name)
for name in ['candidate-cli-context.json', 'oracle-cli-inputs.json', 'root-successor-audit-first-failure.json', 'audit-successor-first.py', 'audit-successor.py']:
    retain(ROOT / name, 'root/' + name)
retain(ROOT.parent / 'cryptex-public-fixture-map-ownership.json', 'root/cryptex-public-fixture-map-ownership.json')
retain(ROOT.parent / 'cryptex-fixture-map-ownership.json', 'root/cryptex-fixture-map-ownership.json')
retain(ROOT.parent / 'cryptex-policy-proposal.md', 'root/cryptex-policy-proposal.md')
retain(ROOT.parent / 'owner-cryptex-trust-decision.json', 'root/owner-cryptex-trust-decision.json')
retain(HERE.parent / 'static-audit.json', 'prior/static-audit.json')
retain(HERE.parent / 'report.md', 'prior/report.md')
retain(HERE.parent / 'manifest.json', 'prior/manifest.json', '91ea0e45cfa6ff78646cb928dd3daaa30395f2e092adac90fcd2dca65af8ec78')
for name in ['AGENTS.md', 'docs/agents/domain.md', 'docs/agents/issue-tracker.md', 'GLOSSARY.md', 'docs/domain-boundaries.md', 'docs/adr/0002-mobilebuildmcp-as-device-layer.md', 'docs/adr/0005-the-1-0-stability-contract.md', 'docs/adr/0008-durable-ios-admission.md', 'docs/adr/0009-bounded-simulator-creation.md']:
    retain(AUTHOR / name, 'standards/' + name, manifest['protected436'][name])

audit = {'reviewer': 'installed_path_standards_review', 'axis': 'Standards', 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'base': BASE, 'parent': PARENT, 'candidate': CANDIDATE, 'ownedHashes': manifest['owned5'], 'checks': checks, 'retainedGates': retained_gates, 'inputs': inputs, 'perHunk': [
    {'file': delta[0], 'hunk': '@@ -15,8 +15,12 @@', 'lines': '19-21', 'documentedBreaches': [], 'materialHeuristicFindings': [], 'assessment': 'Explicit fixture-only pure path seam; owned root identity first, exact slash and anchored installed namespaces mapped. No public product interface or deep-module policy changes. Names describe function; primitive strings match filesystem fixture interface; no unnecessary domain type.'},
    {'file': delta[0], 'hunk': '@@ -31,9 +35,9 @@', 'lines': '39', 'documentedBreaches': [], 'materialHeuristicFindings': [], 'assessment': 'Local delegation retains context ownership and every fs/process guard. The seam makes exact original behavior observable and is necessary for authorized pure regression; no material Middle Man or speculative hook.'},
    {'file': delta[1], 'hunk': '@@ -9,11 +9,34 @@', 'lines': '12-35', 'documentedBreaches': [], 'materialHeuristicFindings': [], 'assessment': 'Import plus fourteen pure string expectations, four distinct behavior families. Original 166-case suite byte-equal after removal. Loops match existing parameterized test shape; no repeated production dispatch or scattered product policy.'}
], 'findings': [], 'staticVerdict': 'PASS', 'defaultGateVerdict': 'HELD pending fresh actual default pair', 'limits': [
    'Bounded successor review reuses sealed dadde33a cumulative static audit after exact unchanged policy-byte verification; no Source authored, tests/builds run or native operations by reviewer.',
    'Stale owned4/protected437 inherited seed note, two private packaging assertions, Root six-vs-seven count audit error and correction preserved; their documented original-script/stderr retention limits remain.',
    'Old candidate Node26 1985/1858/127 failures and exact24 held remain separate and unchanged. Historical initial-red test/fixture reconstruction is exact hash matched but noncontemporaneous.',
    'Installed compatibility, native/live L01-L05, and Ticket12 acceptance are unverified.'
    , 'Reviewer first audit used an incorrect compiled archive path by removing dist/; FileNotFoundError retained with exact first script/stdout/stderr. Corrected to the actual manifest-relative archive path; no Source, receipts or product gates changed.'
]}
json_write(HERE / 'static-audit.json', audit)
print(json.dumps({'checks': len(checks), 'allPass': all(c['pass'] for c in checks), 'receipts': len(retained_gates), 'hunks': len(audit['perHunk']), 'findings': 0, 'held': True}))
