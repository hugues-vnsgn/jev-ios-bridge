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
AUTHOR = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-tracked-binding')
PRIVATE = AUTHOR / '.scratch/installed-tracked-runtime'
PARENT = ROOT / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
REVIEW = PARENT / 'legacy-implementation-review'
DEST = PARENT / 'tracked-candidate-evidence'
CANDIDATE = 'cc5d30e2fdaf065bec476a65df465dabb1569f2c'
PINS = {'candidate-source.json': '7de42479f3263694ed81fe17d43540d638d7d6259531508c28bfd4388fb8e7c9', 'evidence-manifest.json': '3db3c4bcf0a25d90301d576aa7955233959742c596236f9ee247e468e5c15682', 'evidence-seal.json': '7d4205515ceadd952bfc37a514191532496d9e259458a853d872844507e35267', 'verification-index.json': 'f355a1134c719bc0cff3a7817d224af9a2cbcb56dc1e01b0d25f7eb6e6d2a9e4', 'predefault-freeze-audit.json': '6c9b69b2d803d71a5244031f4793ef7260168b346f6006ee773af484b3b19106', 'restoration-matrix.json': '46577c87310c05124f0049c4dd28dca632a3d9a7676fe9c1bab08032c046b9b1', 'implementation-report.md': 'b3e6792721b5ce3deb7834a8c48195a3a8f8dcf7cc565cfb838981ded5972f33'}
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
assert context['authorCwd'] == str(AUTHOR) and context['parentCommit'] == 'dcc06dc0939d73d860cae9e03d4f1f47bacbd279'
assert manifest['candidateContextSha256'] == seal['candidateContextSha256'] == PINS['candidate-source.json']
assert manifest['privateRoot'] == str(PRIVATE)
assert manifest['regularFileCount'] == len(manifest['regularFiles']) == 12857
assert manifest['symlinkCount'] == len(manifest['symlinks']) == 10
assert manifest['directoryCount'] == len(manifest['originalDirectoryModes']) == 19035
assert set(manifest['exclusions']) == {'evidence-manifest.json', 'evidence-seal.json', 'evidence-seal-FAIL.json'}
assert not (PRIVATE / 'evidence-seal-FAIL.json').exists() and not manifest['hardlinkGroups']
assert seal['manifestSha256'] == PINS['evidence-manifest.json'] and seal['regularFilesIncludingManifestAndSeal'] == 12859
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
oracle = load('workspace-preparation.json')
assert len(context['protected439']) == 439 and context['protected439'] == oracle['protected439']
assert set(context['owned4']) == {'src/observed/allocation-config.ts', 'src/observed/allocation.ts', 'tests/observed-legacy-volume-runtime.test.ts', 'tests/fixtures/observed-legacy-volume-runtime.ts'}
assert context['owned4'] == {p: context['source443'][p] for p in context['owned4']}
assert set(git(['diff', '--name-only', context['parentCommit'], CANDIDATE]).decode().splitlines()) == set(context['actualChangedPaths'])
compiled = {}
for directory, dirs, names in os.walk(AUTHOR / 'dist', followlinks=False):
    assert all(not (Path(directory) / name).is_symlink() for name in dirs)
    for name in names:
        p = Path(directory) / name; regular(p, AUTHOR)
        compiled[p.relative_to(AUTHOR).as_posix()] = sha(p)
assert len(compiled) == 69 and compiled == context['compiled69']
index = load('verification-index.json'); pre = load('predefault-freeze-audit.json'); matrix = load('restoration-matrix.json')
assert len(index['checks']) == 22 and all(v['pass'] is True for v in index['checks'])
assert len(pre['checks']) == 121 and all(v['pass'] is True for v in pre['checks'])
assert pre['source443'] == context['source443'] and pre['compiled69'] == compiled
assert len(matrix) == 24
for version in ['26','24']:
    rows = [r for r in matrix if r['node'] == version]
    assert len(rows) == 12 and len({(r['kind'],r['leaf'],r['layer']) for r in rows}) == 12
    assert sum(r['classification'] == 'genuine regression' for r in rows) == 6
    for row in rows:
        old,new = row['red'],row['green']
        assert old['changed'] and new['changed'] and old['readonlyXmlUnchanged'] and new['readonlyXmlUnchanged']
        assert not new['accepted'] and new['metadataConversions'] == 0
        assert any(x['ino'] == '202' for x in new['mountObservations'])
        if row['classification'] == 'genuine regression':
            assert old['accepted'] and old['restored'] and old['metadataConversions'] == 1
        else:
            assert row['classification'] == 'previously passing invariant' and not old['accepted']
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
    assert command['protected439'] == context['protected439'] and command['sourceUnchanged'] and command['protected439Unchanged']
    assert command['parentUmask'] == '0077' and command['childUmask'] == '0022'
    assert set(command['absentEnvironment']) == {'TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS'}
    assert not set(command['absentEnvironment']).intersection(command['environment'])
    assert command['environment']['HOST_EVIDENCE_DIR'] == str(PRIVATE / label / 'host-fault-traces')
    for stream in ['stdout', 'stderr']:
        assert sha(PRIVATE / label / (stream + '.txt')) == command[stream + 'Sha256']
    counts = {name: int(value) for name, value in re.findall(r'^[#ℹ] (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$', output, re.M)}
    assert counts == result['counts'] == {'tests': 2258, 'pass': 2258, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
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
                'symlinksRecordedNotRecreatedOrFollowed': manifest['symlinks'], 'directoriesRecordedInOriginalManifest': 19035,
                'directoryCopyScope': 'Only directories needed for retained regular files; original complete directory inventory remains in evidence-manifest.json',
                'privacy': 'Root copy directories0700/files0600; no links or outside trees copied'}
put(DEST / 'root-preservation-index.json', preservation)
receipt = {'status': 'PASS', 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'candidate': CANDIDATE,
           'contextSha256': PINS['candidate-source.json'], 'source443': context['source443'], 'protected439': context['protected439'],
           'owned4': context['owned4'], 'compiled69': compiled, 'retainedRegularFiles': len(copied), 'recordedSymlinks': 10,
           'packetPins': PINS, 'defaults': defaults, 'regressionRows': 24, 'genuineRegressionsPerNode': 6, 'alreadyPassingInvariantsPerNode': 6, 'predefaultChecks': 121, 'finalVerificationChecks': 22,
           'scriptSha256': sha(Path(__file__)), 'preservationIndexSha256': sha(DEST / 'root-preservation-index.json'),
           'original4faFailureCause': 'UNRESOLVED; historical failure and diagnostics remain preserved',
           'scope': 'Exact frozen Source/Git/compiled and complete raw packet verified/preserved; independent reviews and candidate installed/startup/native gates pending. No Source or native execution.'}
put(REVIEW / 'root-tracked-cc5-binding.json', receipt)
print(json.dumps({'status': 'PASS', 'candidate': CANDIDATE, 'regularFilesPreserved': len(copied),
                  'receiptSha256': sha(REVIEW / 'root-tracked-cc5-binding.json'), 'preservationIndexSha256': receipt['preservationIndexSha256']}))
