"""Verify and preserve the frozen corrective packet; never execute product Source."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import stat
import subprocess

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
AUTHOR = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
PRIVATE = AUTHOR / '.scratch/installed-legacy-volume-runtime/review-correction'
PARENT = ROOT / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
REVIEW = PARENT / 'legacy-implementation-review'
DEST = PARENT / 'legacy-correction-candidate-evidence'
CANDIDATE = 'dcc06dc0939d73d860cae9e03d4f1f47bacbd279'
PINS = {
    'candidate-source.json': '0f4dfabdfb9d8059fa6b992c9f35eeca7880f2fb354c12340b78053866ef67fb',
    'evidence-manifest.json': '0dd519569eedfbbc5d7a4125a0d439b4bddd87fd005944cfd9be8d7593927bc0',
    'evidence-seal.json': 'a02a96e9f650a650d4898340a2a2141ee340b88ddaa25ccd87caeeb2d6bdc842',
    'verification-index.json': 'bade9078eba361c97910bcb79e3c6c49a2da13f11e8f2d618c0f3a3707f48576',
    'predefault-freeze-audit.json': '3819ca2d668fb7e8162f0df4c9c307d4522524e1e482d25ff75590858e7e105b',
    'correction-regression-matrix.json': '7ec6d36cce34b074ef8c40b0300e1d5a0c30d43d2a39a719ab1bd52083b705ed',
    'implementation-report.md': 'dd570978bca8e9445c7a8ba1cfea1d28c8eb5f99c0302d88b3004c2cc632f62f',
}
NODES = {
    '26': ('/opt/homebrew/Cellar/node/26.8.1/bin/node', 'v26.8.1', '902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253'),
    '24': ('/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node', 'v24.0.0', 'f28f6fdb2b24cdfc3785f4f8b46fa7b392b0ec5892b075b434049c7d05cfc956'),
}
SELECTORS = ['src', 'tests', 'docs', 'skills', 'scripts', '.github', 'package.json', 'package-lock.json',
             'README.md', 'AGENTS.md', 'GLOSSARY.md', 'tsconfig.json', 'tsconfig.build.json']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def regular(path, base):
    assert path.is_relative_to(base) and '.env' not in path.parts
    current = base
    assert not current.is_symlink()
    for component in path.relative_to(base).parts:
        current /= component
        assert not stat.S_ISLNK(current.lstat().st_mode), str(current)
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1, str(path)
    return info

def load(name):
    regular(PRIVATE / name, PRIVATE)
    return json.loads((PRIVATE / name).read_text())

def git(args, data=None):
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0'}
    return subprocess.run(['/usr/bin/git', *args], cwd=AUTHOR, env=env, input=data,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout

def git_hashes(paths):
    data = git(['cat-file', '--batch'], ''.join(CANDIDATE + ':' + p + '\n' for p in paths).encode())
    offset, result = 0, {}
    for p in paths:
        end = data.index(b'\n', offset)
        header = data[offset:end].split()
        assert len(header) == 3 and header[1] == b'blob'
        size = int(header[2]); offset = end + 1
        blob = data[offset:offset + size]
        assert len(blob) == size and data[offset + size:offset + size + 1] == b'\n'
        result[p] = hashlib.sha256(blob).hexdigest(); offset += size + 1
    assert offset == len(data)
    return result

def put(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, indent=2, sort_keys=True); stream.write('\n')
    path.chmod(0o600)

os.umask(0o077)
for name, expected in PINS.items():
    regular(PRIVATE / name, PRIVATE)
    assert sha(PRIVATE / name) == expected, name
context = load('candidate-source.json'); manifest = load('evidence-manifest.json'); seal = load('evidence-seal.json')
assert context['candidateCommit'] == manifest['candidateCommit'] == seal['candidateCommit'] == CANDIDATE
assert context['authorCwd'] == str(AUTHOR) and context['parentCommit'] == '4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d'
assert manifest['candidateContextSha256'] == seal['candidateContextSha256'] == PINS['candidate-source.json']
assert manifest['privateRoot'] == str(PRIVATE)
assert manifest['regularFileCount'] == len(manifest['regularFiles']) == 12911
assert manifest['symlinkCount'] == len(manifest['symlinks']) == 10
assert manifest['directoryCount'] == len(manifest['originalDirectoryModes']) == 19070
assert set(manifest['exclusions']) == {'evidence-manifest.json', 'evidence-seal.json', 'evidence-seal-FAIL.json'}
assert not (PRIVATE / 'evidence-seal-FAIL.json').exists() and not manifest['hardlinkGroups']
assert seal['manifestSha256'] == PINS['evidence-manifest.json'] and seal['regularFilesIncludingManifestAndSeal'] == 12913
actual_files, actual_links, actual_dirs = set(), {}, set()
for directory, dirs, names in os.walk(PRIVATE, followlinks=False):
    path = Path(directory); assert stat.S_IMODE(path.lstat().st_mode) == 0o700
    actual_dirs.add(path.relative_to(PRIVATE).as_posix())
    for name in list(dirs):
        child = path / name
        if child.is_symlink():
            actual_links[child.relative_to(PRIVATE).as_posix()] = os.readlink(child); dirs.remove(name)
    for name in names:
        child = path / name; key = child.relative_to(PRIVATE).as_posix()
        if child.is_symlink():
            actual_links[key] = os.readlink(child)
        else:
            info = regular(child, PRIVATE); assert stat.S_IMODE(info.st_mode) == 0o600
            actual_files.add(key)
assert actual_files == set(manifest['regularFiles']) | {'evidence-manifest.json', 'evidence-seal.json'}
assert actual_dirs == set(manifest['originalDirectoryModes'])
assert actual_links == {p: v['target'] for p, v in manifest['symlinks'].items()}
for p, expected in manifest['regularFiles'].items():
    info = regular(PRIVATE / p, PRIVATE)
    assert info.st_size == expected['sealedMetadata']['size'] and sha(PRIVATE / p) == expected['sha256'], p
assert git(['rev-parse', 'HEAD']).decode().strip() == CANDIDATE
paths = sorted(p for p in git(['ls-files', '-z', *SELECTORS]).decode().split('\0') if p)
assert len(paths) == 443 and set(paths) == set(context['source443'])
assert context['source443'] == context['gitSource443'] == git_hashes(paths)
for p, expected in context['source443'].items():
    regular(AUTHOR / p, AUTHOR); assert sha(AUTHOR / p) == expected, p
oracle = json.loads((REVIEW / 'baseline-oracle.json').read_text())
assert len(context['protected440']) == 440 and context['protected440'] == oracle['protected440']
assert set(context['owned3']) == {'src/observed/allocation-config.ts', 'tests/observed-legacy-volume-runtime.test.ts', 'tests/fixtures/observed-legacy-volume-runtime.ts'}
assert context['owned3'] == {p: context['source443'][p] for p in context['owned3']}
assert set(git(['diff', '--name-only', context['parentCommit'], CANDIDATE]).decode().splitlines()) == set(context['owned3'])
compiled = {}
for directory, dirs, names in os.walk(AUTHOR / 'dist', followlinks=False):
    assert all(not (Path(directory) / name).is_symlink() for name in dirs)
    for name in names:
        p = Path(directory) / name; regular(p, AUTHOR)
        compiled[p.relative_to(AUTHOR).as_posix()] = sha(p)
assert len(compiled) == 69 and compiled == context['compiled69']
index = load('verification-index.json'); pre = load('predefault-freeze-audit.json'); matrix = load('correction-regression-matrix.json')
assert len(index['checks']) == 23 and all(v['pass'] is True for v in index['checks'])
assert len(pre['checks']) == 74 and all(v['pass'] is True for v in pre['checks'])
assert pre['source443'] == context['source443'] and pre['compiled69'] == compiled
rows = matrix['rows']; assert len(rows) == 42 and [r['ordinal'] for r in rows] == list(range(1, 43))
assert len({r['testName'] for r in rows}) == 42
assert sum(r['finding'] == 'P1' for r in rows) == 18 and sum(r['finding'] == 'P2' for r in rows) == 24
assert matrix['original199']['bodyAndAssertionsPreserved'] is True
for row in rows:
    for version in ['26', '24']:
        old, new = row['nodes'][version]['red'], row['nodes'][version]['green']
        if row['finding'] == 'P1':
            assert old['changed'] and old['restored'] and old['accepted'] and old['readonlyXmlUnchanged']
            assert new['changed'] and not new['accepted'] and new['readonlyXmlUnchanged']
        else:
            assert old['abortObserved'] and any(x['operation'] == 'opened-stat' for x in old['postAbort'])
            assert new['abortObserved'] and [x['operation'] for x in new['postAbort']] == ['close']
            assert new['newEffects'] == new['newFixtureLaunches'] == 0
defaults = {}
for version, (node, expected_version, binary_sha) in NODES.items():
    label = 'actual-default-node' + version; command = load(label + '/command.json'); result = load(label + '/result.json')
    runtime = load(label + '/version.json'); output = (PRIVATE / label / 'stdout.txt').read_text()
    assert command['argv'] == [node, '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', 'run', 'check']
    assert command['cwd'] == str(AUTHOR) and command['runtime'] == expected_version and command['head'] == CANDIDATE
    assert runtime['stdout'] == expected_version + '\n' and runtime['executableSha256'] == binary_sha and runtime['exitCode'] == 0
    assert command['exitCode'] == result['exitCode'] == 0 and command['actualCloseRecorded'] and result['actualCloseRecorded']
    assert not command['signalSent'] and not command['addedOuterTimeout']
    assert command['candidateSource443'] == command['sourceAfter443'] == context['source443']
    assert command['compiledBefore69'] == command['compiledAfter'] == compiled
    assert command['protected440'] == context['protected440'] and command['sourceUnchanged'] and command['protected440Unchanged']
    assert command['parentUmask'] == '0077' and command['childUmask'] == '0022'
    assert set(command['absentEnvironment']) == {'TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS'}
    assert not set(command['absentEnvironment']).intersection(command['environment'])
    assert command['environment']['HOST_EVIDENCE_DIR'] == str(PRIVATE / label / 'host-fault-traces')
    for stream in ['stdout', 'stderr']:
        assert sha(PRIVATE / label / (stream + '.txt')) == command[stream + 'Sha256']
    counts = {name: int(value) for name, value in re.findall(r'^[#ℹ] (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$', output, re.M)}
    assert counts == result['counts'] == {'tests': 2240, 'pass': 2240, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
    assert result['defaultBuildReached'] and '> jev-ios-bridge@1.3.1 typecheck' in output
    assert '> jev-ios-bridge@1.3.1 build' in output and '> rm -rf dist && tsc -p tsconfig.build.json' in output
    assert result['commandSha256'] == sha(PRIVATE / label / 'command.json')
    defaults[version] = {'commandSha256': result['commandSha256'], 'counts': counts, 'start': command['startedAtUtc'], 'close': command['completedAtUtc']}
assert datetime.datetime.fromisoformat(defaults['26']['close']) < datetime.datetime.fromisoformat(defaults['24']['start'])
DEST.mkdir(mode=0o700, exist_ok=False)
copied = {}
for key in sorted(actual_files):
    source = PRIVATE / key; target = DEST / key
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    data = source.read_bytes()
    with target.open('xb') as stream: stream.write(data)
    target.chmod(0o600)
    expected = sha(source); assert sha(target) == expected
    copied[key] = {'sha256': expected, 'bytes': len(data), 'source': str(source)}
preservation = {'candidate': CANDIDATE, 'files': copied, 'regularFileCount': len(copied),
                'symlinksRecordedNotRecreatedOrFollowed': manifest['symlinks'], 'directoriesRecordedInOriginalManifest': 19070,
                'directoryCopyScope': 'Only directories needed for retained regular files; original complete directory inventory remains in evidence-manifest.json',
                'privacy': 'Root copy directories0700/files0600; no links or outside trees copied'}
put(DEST / 'root-preservation-index.json', preservation)
receipt = {'status': 'PASS', 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidate': CANDIDATE,
           'contextSha256': PINS['candidate-source.json'], 'source443': context['source443'], 'protected440': context['protected440'],
           'owned3': context['owned3'], 'compiled69': compiled, 'retainedRegularFiles': len(copied), 'recordedSymlinks': 10,
           'packetPins': PINS, 'defaults': defaults, 'regressionRows': 42, 'predefaultChecks': 74, 'finalVerificationChecks': 23,
           'scriptSha256': sha(Path(__file__)), 'preservationIndexSha256': sha(DEST / 'root-preservation-index.json'),
           'original4faFailureCause': 'UNRESOLVED; historical failure and diagnostics remain preserved',
           'scope': 'Exact frozen Source/Git/compiled and complete raw packet verified/preserved; independent reviews and candidate installed/startup/native gates pending. No Source or native execution.'}
put(REVIEW / 'root-correction-dcc-binding.json', receipt)
print(json.dumps({'status': 'PASS', 'candidate': CANDIDATE, 'regularFilesPreserved': len(copied),
                  'receiptSha256': sha(REVIEW / 'root-correction-dcc-binding.json'), 'preservationIndexSha256': receipt['preservationIndexSha256']}))
