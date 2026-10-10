#!/usr/bin/env python3
"""Prepared outer recorder. Execute only after Root's frozen-candidate dispatch.

The protected packaging/startup helpers do the assertions. This module binds their
actual executions to the exact author candidate and retains raw process evidence.
It does not perform native lookup, Source repair, default gates, or retries.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import tarfile
import time
import zipfile

AUTHOR = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-tracked-binding')
INTEGRATION = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
PRIVATE = AUTHOR / '.scratch/installed-tracked-packaging'
PROOF = AUTHOR / 'tests/fixtures/observed-packaging/proof.mjs'
GUARD = INTEGRATION / 'tests/fixtures/observed-packaging/guard.mjs'
STARTUP = INTEGRATION / '.scratch/observed-integration/acceptance/host/faults/production-startup/review/final/probe.mjs'
ROOT_RUNNER = INTEGRATION / '.scratch/observed-integration/acceptance/host/installed-workflow/integration/root-gate-runner.py'
NPM = Path('/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js')
NODES = {
    '26': {'path': '/opt/homebrew/Cellar/node/26.8.1/bin/node', 'version': 'v26.8.1',
           'sha256': '902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253'},
    '24': {'path': '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node', 'version': 'v24.0.0',
           'sha256': 'f28f6fdb2b24cdfc3785f4f8b46fa7b392b0ec5892b075b434049c7d05cfc956'},
}
FIXED = {
    str(PROOF): '6aaf75a214d3dc89ddc2957b2be082ccf9eba7d93ade7511dd3bd652ae850635',
    str(GUARD): '000c19430aae956338a406a9b4daceb68e99eb76d70bc3a0340fccf52ae0d2f7',
    str(AUTHOR / 'tests/fixtures/observed-packaging/guard.mjs'): '000c19430aae956338a406a9b4daceb68e99eb76d70bc3a0340fccf52ae0d2f7',
    str(STARTUP): 'bf3b8b89d0ad11b03a30be23f2501b8e40aad8cf293b0ba94ce978f943ba0a4c',
    str(ROOT_RUNNER): '1a64e2143b07c99532456bc215090ee0dfbf631624670d8b0b013be0c7727efc',
    str(NPM): '8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7',
}
INVARIANTS_SHA = '5c46df509f99bc4886ab74268e116e9b5028a315d16e52966959def1b5e1f416'
SOURCE_SELECTORS = ['src', 'tests', 'docs', 'skills', 'scripts', '.github', 'package.json',
                    'package-lock.json', 'README.md', 'AGENTS.md', 'GLOSSARY.md',
                    'tsconfig.json', 'tsconfig.build.json']
OWNED = {'src/observed/allocation-config.ts', 'src/observed/allocation.ts', 'tests/observed-legacy-volume-runtime.test.ts',
         'tests/fixtures/observed-legacy-volume-runtime.ts'}
STARTUP_SECONDS = 60
TERM_GRACE_SECONDS = 2
KILL_CLOSE_SECONDS = 5
GROUP_SETTLE_SECONDS = 5
SHA_RE = re.compile(r'[0-9a-f]{64}\Z')
LABEL_RE = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z')


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def demand(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def put(path, value):
    with Path(path).open('x', encoding='utf8') as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write('\n')
    Path(path).chmod(0o600)


def regular_path(path, root):
    """No Source/installed metadata reads through a symlink or outside its root."""
    path, root = Path(path), Path(root)
    relative = path.relative_to(root)
    demand(not root.is_symlink(), 'Root is a symlink: ' + str(root))
    current = root
    for part in relative.parts:
        current = current / part
        info = current.lstat()
        demand(not stat.S_ISLNK(info.st_mode), 'Symlink in bound file path: ' + str(current))
    demand(stat.S_ISREG(path.lstat().st_mode), 'Expected regular file: ' + str(path))
    return path


def relative_key(key):
    path = PurePosixPath(key)
    demand(isinstance(key, str) and not path.is_absolute() and '..' not in path.parts
           and path.as_posix() == key and '.env' not in path.parts,
           'Invalid bound relative path')
    return key


def git(args, input_bytes=None):
    environment = {'PATH': '/usr/bin:/bin', 'HOME': '/Users/hugues_mini', 'LANG': 'C', 'LC_ALL': 'C',
                   'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0'}
    return subprocess.run(['/usr/bin/git', *args], cwd=AUTHOR, env=environment,
                          input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout


def git_blobs(commit, paths):
    data = git(['cat-file', '--batch'], ''.join(commit + ':' + p + '\n' for p in paths).encode())
    offset, hashes = 0, {}
    for path in paths:
        end = data.index(b'\n', offset)
        header = data[offset:end].split()
        demand(len(header) == 3 and header[1] == b'blob', 'Git object missing/not a blob: ' + path)
        size = int(header[2])
        offset = end + 1
        blob = data[offset:offset + size]
        demand(len(blob) == size and data[offset + size:offset + size + 1] == b'\n', 'Git batch truncation')
        hashes[path] = hashlib.sha256(blob).hexdigest()
        offset += size + 1
    demand(offset == len(data), 'Unexpected Git batch trailing data')
    return hashes


def tree_files(root):
    files, links = {}, {}
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in list(dirs):
            path = Path(directory) / name
            if path.is_symlink():
                links[path.relative_to(root).as_posix()] = os.readlink(path)
                dirs.remove(name)
        for name in names:
            path = Path(directory) / name
            key = path.relative_to(root).as_posix()
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode):
                links[key] = os.readlink(path)
            else:
                demand(stat.S_ISREG(info.st_mode), 'Unexpected special artifact: ' + str(path))
                files[key] = sha(path)
    return dict(sorted(files.items())), dict(sorted(links.items()))


def compiled(root, expected):
    demand(not root.is_symlink() and not (root / 'dist').is_symlink(), 'Symlink compiled root')
    files, links = tree_files(root / 'dist')
    actual = {'dist/' + name: digest for name, digest in files.items()}
    demand(not links and actual == expected, '69-file compiled payload differs: ' + str(root))
    return actual


def snapshot(context, invariants):
    head = git(['rev-parse', 'HEAD']).decode().strip()
    tracked = git(['ls-files', '-z', *SOURCE_SELECTORS]).decode().split('\0')
    tracked = sorted(p for p in tracked if p)
    source = {p: sha(regular_path(AUTHOR / p, AUTHOR)) for p in invariants['sourcePaths443']}
    extras = {p: sha(regular_path(AUTHOR / p, AUTHOR)) for p in invariants['packagingExtraInputs']}
    compiled_files, compiled_links = tree_files(AUTHOR / 'dist')
    return {'atUtc': now(), 'head': head, 'trackedSourcePaths': tracked, 'source443': source,
            'gitSource443': git_blobs(head, invariants['sourcePaths443']),
            'protected439': {p: source[p] for p in invariants['protected439']},
            'compiled69': {'dist/' + p: h for p, h in compiled_files.items()},
            'compiledSymlinks': compiled_links, 'packagingExtraInputs': extras,
            'gitPackagingExtraInputs': git_blobs(head, sorted(extras)),
            'fixedInputs': {p: sha(p) for p in FIXED}}


def validate_snapshot(value, context, invariants):
    demand(value['head'] == context['candidateCommit'], 'Candidate HEAD changed')
    demand(value['trackedSourcePaths'] == invariants['sourcePaths443'], 'Source selector path set changed')
    demand(value['source443'] == value['gitSource443'] == context['source443'], 'Source443 mismatch')
    demand(value['protected439'] == invariants['protected439'], 'Protected439 drift')
    demand(value['packagingExtraInputs'] == value['gitPackagingExtraInputs'] == invariants['packagingExtraInputs'],
           'Protected packaging inputs drift')
    demand(not value['compiledSymlinks'] and value['compiled69'] == context['compiled69']
           and value['fixedInputs'] == FIXED, 'Compiled/helper drift')


def load_context(path, digest, invariants):
    path = Path(path).resolve(strict=True)
    path.relative_to(PRIVATE)
    regular_path(path, PRIVATE)
    demand(SHA_RE.fullmatch(digest) and sha(path) == digest, 'Future context hash mismatch')
    context = json.loads(path.read_text())
    demand(re.fullmatch('[0-9a-f]{40}', context['candidateCommit']) is not None, 'Invalid candidate commit')
    demand(context['candidateCommit'] != invariants['basisCommit'], 'Parent candidate is not the tracked correction')
    demand(set(context['source443']) == set(invariants['sourcePaths443']), 'Expected exact Source443 paths')
    demand(context['source443'] == context['gitSource443'], 'Future Git/working vectors differ')
    demand(context['protected439'] == invariants['protected439'], 'Future protected paths changed')
    demand(set(context['owned4']) == OWNED and context['owned4'] == {p: context['source443'][p] for p in OWNED},
           'Future owned4 mismatch')
    demand(set(context['compiled69']) == set(invariants['compiledPaths69']), 'Expected exact compiled69 paths')
    for mapping in [context['source443'], context['compiled69']]:
        for key, value in mapping.items():
            relative_key(key)
            demand(isinstance(value, str) and SHA_RE.fullmatch(value), 'Invalid context digest')
    return path, context


def env_for(node, run):
    (run / 'user.npmrc').open('x').close()
    (run / 'global.npmrc').open('x').close()
    return {'HOME': '/Users/hugues_mini', 'LANG': 'C', 'LC_ALL': 'C',
            'PATH': str(Path(node).parent) + ':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            'NPM_CONFIG_USERCONFIG': str(run / 'user.npmrc'),
            'NPM_CONFIG_GLOBALCONFIG': str(run / 'global.npmrc'),
            'NPM_CONFIG_CACHE': str(run / 'outer-npm-cache')}


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False


def timeout_cleanup(child, pgid):
    """Keep the direct session leader unreaped until both group signals finish.

    That reserves its PID/PGID and prevents sending escalation to a reused group.
    Only this recorder's start_new_session tree is eligible. Signals are not close.
    """
    record = {'startedAtUtc': now(), 'ownedPid': child.pid, 'ownedPgid': pgid, 'signals': [],
              'sessionLeaderHeldUnreapedDuringSignals': True, 'actualRootClose': False,
              'groupAbsenceConfirmed': False}
    demand(child.returncode is None and os.getpgid(child.pid) == pgid and os.getsid(child.pid) == child.pid,
           'Timeout ownership cannot be verified')
    for number, pause in [(signal.SIGTERM, TERM_GRACE_SECONDS), (signal.SIGKILL, 0)]:
        event = {'atUtc': now(), 'signal': signal.Signals(number).name, 'target': 'owned process group',
                 'pidReservedByUnreapedDirectChild': child.returncode is None}
        demand(child.returncode is None, 'Session leader was unexpectedly reaped before escalation')
        try:
            os.killpg(pgid, number)
            event['delivery'] = 'sent'
        except ProcessLookupError:
            event['delivery'] = 'group absent'
        record['signals'].append(event)
        if pause:
            time.sleep(pause)
    try:
        record['exitCode'] = child.wait(timeout=KILL_CLOSE_SECONDS)
        record['actualRootClose'] = True
        record['rootClosedAtUtc'] = now()
    except subprocess.TimeoutExpired:
        record['rootCloseUncertainty'] = 'Bounded post-SIGKILL wait expired; no further signals/retry'
    deadline = time.monotonic() + GROUP_SETTLE_SECONDS
    while group_exists(pgid) and time.monotonic() < deadline:
        time.sleep(0.05)
    record['groupAbsenceConfirmed'] = not group_exists(pgid)
    record['completedAtUtc'] = now()
    return record


def launch(command, environment, run, phase):
    record = {'command': command, 'cwd': str(AUTHOR), 'startedAtUtc': now(),
              'environmentNames': sorted(environment), 'parentUmask': '0077', 'childUmask': '0022',
              'scrubStrategy': 'Minimal allowlisted environment; no inherited credentials/loaders/config',
              'absentNames': ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS'],
              'outerTimeoutSeconds': STARTUP_SECONDS if phase == 'startup' else None,
              'actualCloseRecorded': False, 'timedOut': False, 'cleanup': None}
    started = time.monotonic()
    with (run / 'stdout.txt').open('xb') as stdout, (run / 'stderr.txt').open('xb') as stderr:
        child = subprocess.Popen(command, cwd=AUTHOR, env=environment, stdin=subprocess.DEVNULL,
                                 stdout=stdout, stderr=stderr, start_new_session=True, umask=0o022)
        pgid = os.getpgid(child.pid)
        demand(pgid == child.pid and os.getsid(child.pid) == child.pid, 'Expected owned fresh session')
        record.update({'childPid': child.pid, 'childPgid': pgid, 'childSession': child.pid})
        put(run / 'launch.json', record)
        try:
            code = child.wait(timeout=STARTUP_SECONDS if phase == 'startup' else None)
            record.update({'exitCode': code, 'actualCloseRecorded': True, 'closedAtUtc': now()})
        except subprocess.TimeoutExpired:
            record['timedOut'] = True
            record['timeoutAtUtc'] = now()
            try:
                record['cleanup'] = timeout_cleanup(child, pgid)
                record['actualCloseRecorded'] = record['cleanup']['actualRootClose']
                record['exitCode'] = record['cleanup'].get('exitCode')
                record['closedAtUtc'] = record['cleanup'].get('rootClosedAtUtc')
            except Exception as error:
                record['cleanup'] = {'ownershipOrSettlementUncertainty': str(error), 'atUtc': now(),
                                     'ownedPid': child.pid, 'ownedPgid': pgid,
                                     'actualRootClose': False, 'groupAbsenceConfirmed': False}
        record['durationSeconds'] = time.monotonic() - started
        record['groupAbsentAfterClose'] = not group_exists(pgid)
    record['stdoutSha256'] = sha(run / 'stdout.txt')
    record['stderrSha256'] = sha(run / 'stderr.txt')
    record['rawHashCapturedAtUtc'] = now()
    record['rawComplete'] = record['actualCloseRecorded'] and record['groupAbsentAfterClose']
    put(run / 'command.json', record)
    return record


def archive_payload(path, expected, archive_kind):
    files, links = {}, {}
    if archive_kind == 'tar':
        with tarfile.open(path, 'r:*') as archive:
            for entry in archive.getmembers():
                relative_key(entry.name.rstrip('/'))
                if entry.isfile():
                    demand(entry.name not in files, 'Duplicate tar member')
                    with archive.extractfile(entry) as stream:
                        files[entry.name] = hashlib.file_digest(stream, 'sha256').hexdigest()
                elif entry.issym() or entry.islnk():
                    links[entry.name] = entry.linkname
                else:
                    demand(entry.isdir(), 'Unexpected tar member type')
    else:
        with zipfile.ZipFile(path) as archive:
            for entry in archive.infolist():
                relative_key(entry.filename.rstrip('/'))
                if entry.is_dir():
                    continue
                demand(entry.filename not in files, 'Duplicate zip member')
                demand(not stat.S_ISLNK(entry.external_attr >> 16), 'Symlink zip member')
                with archive.open(entry) as stream:
                    files[entry.filename] = hashlib.file_digest(stream, 'sha256').hexdigest()
    payload = {}
    for key, digest in expected.items():
        names = [name for name in files if name == key or name.endswith('/' + key)]
        demand(len(names) == 1 and files[names[0]] == digest, 'Archive compiled payload mismatch: ' + key)
        payload[key] = {'member': names[0], 'sha256': digest}
    return {'path': str(path), 'sha256': sha(path), 'regularMembers': dict(sorted(files.items())),
            'symlinkOrHardlinkMembers': dict(sorted(links.items())), 'compiled69': payload}


def packaging_result(proof, context, node):
    summary = json.loads(regular_path(proof / 'summary.json', proof).read_text())
    demand(summary['status'] == 'PASS' and summary['node'] == node['version'], 'Packaging summary not PASS/exact Node')
    demand(summary['commandCount'] == 37 and summary['skips'] == 0 and summary['forbiddenEffects'] == 0,
           'Packaging count/skips/forbidden effects mismatch')
    records = [json.loads(line) for line in (proof / 'commands.jsonl').read_text().splitlines()]
    demand(len(records) == 37 and [r['id'] for r in records] == [f'{i:03d}' for i in range(1, 38)],
           'Missing or duplicate packaging close receipts')
    close_records = []
    for value in records:
        demand(value['node'] == node['version'] and value['signal'] is None and type(value['exit']) is int,
               'Packaging child incomplete/incorrect runtime')
        stdout = regular_path(Path(value['stdout']), proof)
        stderr = regular_path(Path(value['stderr']), proof)
        close_records.append({**value, 'stdoutSha256': sha(stdout), 'stderrSha256': sha(stderr),
                              'settlementEvidence': 'Original helper command record; run() awaits close; mcp() may use an already set exitCode. Outer actual root close and owned group absence are recorded separately.'})
    locations = {'buildSnapshot': proof / 'build-source', 'npmInstalled': proof / 'clean/node_modules/jev-ios-bridge',
                 'pluginBuilt': proof / 'build-source/build/plugin/jev-ios-bridge', 'pluginInstalled': proof / 'plugin'}
    payloads = {name: compiled(path, context['compiled69']) for name, path in locations.items()}
    for name in ['npm', 'plugin']:
        demand((proof / (name + '-forbidden.jsonl')).read_bytes() == b'', 'Forbidden packaging effect')
    archives = {}
    for name, kind in [('tarball', 'tar'), ('pluginZip', 'zip')]:
        path = regular_path(Path(summary[name]['path']), proof)
        demand(sha(path) == summary[name]['sha256'], 'Helper archive hash mismatch')
        archives[name] = archive_payload(path, context['compiled69'], kind)
    return {'helperSummary': summary, 'originalHelperCommandReceipts37': close_records,
            'compiledPayloads69Each': payloads, 'archives': archives,
            'scope': 'Candidate offline npm/plugin installations, not native compatibility or live acceptance'}


def startup_result(output, proof, node):
    summary = json.loads(regular_path(output / 'summary.json', output).read_text())
    demand(summary['status'] == 'PASS' and summary['node'] == node['version'], 'Startup summary not PASS/exact Node')
    demand(summary['installedProof'] == str(proof) and summary['loader'] == str(GUARD)
           and summary['loaderSha256'] == FIXED[str(GUARD)], 'Startup proof/guard mismatch')
    demand(summary['cliCommands'] == 2 and summary['mcpCalls'] == 3
           and summary['sdkDriverChildEffects'] == 0 and summary['productionAccountRootOperations'] == 0,
           'Startup bounds/effects mismatch')
    records = json.loads(regular_path(output / 'commands.json', output).read_text())
    demand(len(records) == 3 and {r['label'] for r in records} == {'cli-allocation', 'cli-action', 'mcp'},
           'Missing startup close receipts')
    for value in records:
        demand(value['node'] == node['version'] and value['signal'] is None
               and value['code'] == (0 if value['label'] == 'mcp' else 3)
               and not value.get('spawnError') and not value.get('stdinError'), 'Startup child failure/incomplete close')
        for key in ['stdout', 'stderr']:
            value[key + 'Sha256'] = sha(regular_path(output / value[key], output))
        effects = [json.loads(line) for line in (output / value['guardLog']).read_text().splitlines()]
        demand(effects == [{'forbidden': 'Admission.open'}], 'Startup attempted extra effect')
    return {'helperSummary': summary, 'actualChildCloseReceipts3': records,
            'scope': 'Guarded installed production Admission.open error translation; no account/native execution'}


def seal(run):
    """Privatize only owned artifacts, never follow/chmod symlinks into checkout deps."""
    for directory, dirs, names in os.walk(run, followlinks=False):
        Path(directory).chmod(0o700)
        for name in list(dirs):
            path = Path(directory) / name
            if path.is_symlink():
                dirs.remove(name)
        for name in names:
            path = Path(directory) / name
            if not path.is_symlink():
                info = path.lstat()
                demand(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
                       'Cannot chmod a special file or hardlink alias while sealing')
                path.chmod(0o600)
    files, links = tree_files(run)
    demand('artifact-seal.json' not in files, 'Seal must be fresh')
    put(run / 'artifact-seal.json', {'regularFiles': files,
                                   'symlinksNotFollowed': {p: {'target': t} for p, t in links.items()},
                                   'regularFileCount': len(files), 'symlinkCount': len(links),
                                   'selfExclusion': 'artifact-seal.json', 'otherExclusions': [],
                                   'privacy': 'Directories0700/regularFiles0600 after actual gate close; links not followed/chmodded',
                                   'helperChildUmask': '0022 during original execution'})


def verify_seal(run):
    value = json.loads(regular_path(run / 'artifact-seal.json', run).read_text())
    files, links = tree_files(run)
    files.pop('artifact-seal.json')
    demand(files == value['regularFiles'] and links == {p: v['target'] for p, v in value['symlinksNotFollowed'].items()},
           'Prior packaging artifacts changed')
    return sha(run / 'artifact-seal.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['packaging', 'startup'])
    parser.add_argument('runtime', choices=['26', '24'])
    parser.add_argument('label', help='Fresh private run label')
    parser.add_argument('--context', required=True, help='Frozen context under installed-tracked-packaging/')
    parser.add_argument('--context-sha256', required=True)
    parser.add_argument('--packaging-label', help='Closed same-candidate packaging label required by startup')
    args = parser.parse_args()
    os.umask(0o077)
    demand(Path.cwd() == AUTHOR and AUTHOR.resolve() == AUTHOR and Path(__file__).resolve().parent == PRIVATE,
           'Recorder must run in the fixed author checkout from its granted private directory')
    demand(not PRIVATE.is_symlink() and stat.S_IMODE(PRIVATE.stat().st_mode) == 0o700,
           'Granted recorder directory must remain private0700')
    demand(LABEL_RE.fullmatch(args.label), 'Invalid fresh label')
    demand(sha(PRIVATE / 'invariants.json') == INVARIANTS_SHA, 'Prepared invariant binding changed')
    invariants = json.loads((PRIVATE / 'invariants.json').read_text())
    context_path, context = load_context(args.context, args.context_sha256, invariants)
    node = NODES[args.runtime]
    demand(sha(node['path']) == node['sha256'], 'Pinned Node binary changed')
    demand(all(sha(p) == digest for p, digest in FIXED.items()), 'Fixed helper/npm/Root runner changed')
    for p, digest in invariants['protected439'].items():
        demand(context['source443'][p] == digest, 'Context changed protected Source')
    with (PRIVATE / 'serial.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runs = PRIVATE / 'runs'
        runs.mkdir(mode=0o700, exist_ok=True)
        demand(not runs.is_symlink() and stat.S_IMODE(runs.stat().st_mode) == 0o700, 'Runs root must be private0700')
        run = runs / args.label
        run.mkdir(mode=0o700, exist_ok=False)
        before = snapshot(context, invariants)
        put(run / 'before.json', before)
        validate_snapshot(before, context, invariants)
        proof, packaging_binding = run / 'installed-proof', None
        if args.phase == 'startup':
            demand(args.packaging_label and LABEL_RE.fullmatch(args.packaging_label), 'Startup needs a packaging label')
            prior = runs / args.packaging_label
            demand(not prior.is_symlink(), 'Packaging run cannot be a symlink')
            prior_result = json.loads(regular_path(prior / 'result.json', prior).read_text())
            demand(prior_result['status'] == 'PASS' and prior_result['phase'] == 'packaging'
                   and prior_result['candidateCommit'] == context['candidateCommit']
                   and prior_result['contextSha256'] == args.context_sha256 and prior_result['runtime'] == args.runtime,
                   'Startup must use same-candidate same-Node closed PASS packaging')
            packaging_binding = {'run': str(prior), 'resultSha256': sha(prior / 'result.json'),
                                 'sealSha256': verify_seal(prior)}
            proof = prior / 'installed-proof'
            packaging_result(proof, context, node)
        else:
            demand(args.packaging_label is None, 'Packaging does not consume a prior label')
        environment = env_for(node['path'], run)
        selected_npm = shutil.which('npm', path=environment['PATH'])
        demand(selected_npm and Path(selected_npm).resolve() == NPM.resolve(), 'PATH npm is not the pinned official CLI')
        if args.phase == 'packaging':
            environment['JEV_PACKAGING_EVIDENCE_DIR'] = str(proof)
            command = [node['path'], 'tests/fixtures/observed-packaging/proof.mjs']
        else:
            command = [node['path'], str(STARTUP), str(proof), str(run / 'startup-proof')]
        put(run / 'context-binding.json', {'candidateCommit': context['candidateCommit'], 'contextPath': str(context_path),
                                         'contextSha256': args.context_sha256, 'recorderSha256': sha(__file__),
                                         'runtime': node, 'selectedNpm': selected_npm,
                                         'fixedInputs': FIXED, 'packaging': packaging_binding,
                                         'authorCwd': str(AUTHOR), 'noNativeGate': True})
        execution = launch(command, environment, run, args.phase)
        result = {'phase': args.phase, 'runtime': args.runtime, 'candidateCommit': context['candidateCommit'],
                  'contextSha256': args.context_sha256, 'actualCloseRecorded': execution['actualCloseRecorded'],
                  'commandSha256': sha(run / 'command.json'), 'status': 'FAIL', 'failures': []}
        try:
            after = snapshot(context, invariants)
            put(run / 'after.json', after)
            validate_snapshot(after, context, invariants)
            result['source443AndCompiled69Unchanged'] = True
        except Exception as error:
            result['failures'].append('After-snapshot: ' + str(error))
            put(run / 'after-snapshot-failure.json', {'atUtc': now(), 'message': str(error)})
        if execution.get('exitCode') != 0 or not execution['actualCloseRecorded'] or execution['timedOut']:
            result['failures'].append('Helper nonzero/unsettled/outer timeout; preserve original, no retry')
        if not execution['groupAbsentAfterClose']:
            result['failures'].append('Owned group settlement uncertain; no PASS or subsequent gate')
        try:
            payload = (packaging_result(proof, context, node) if args.phase == 'packaging'
                       else startup_result(run / 'startup-proof', proof, node))
            put(run / 'derived-proof.json', payload)
            result['derivedProofSha256'] = sha(run / 'derived-proof.json')
            if packaging_binding:
                demand(verify_seal(Path(packaging_binding['run'])) == packaging_binding['sealSha256'],
                       'Startup changed prior packaging evidence')
        except Exception as error:
            result['failures'].append('Derived helper proof: ' + str(error))
        result['status'] = 'FAIL' if result['failures'] else 'PASS'
        result['completedAtUtc'] = now()
        put(run / 'result.json', result)
        if execution['actualCloseRecorded'] and execution['groupAbsentAfterClose']:
            seal(run)
            seal_digest = sha(run / 'artifact-seal.json')
        else:
            put(run / 'settlement-uncertainty.json', {
                'status': 'UNSETTLED', 'atUtc': now(), 'childPid': execution['childPid'],
                'childPgid': execution['childPgid'], 'artifactSealCreated': False,
                'qualification': 'Raw hashes are a captured snapshot, not immutable final output. Preserve this label; hold all later gates for Root-owned settlement diagnosis.'})
            seal_digest = None
        print(json.dumps({'status': result['status'], 'phase': args.phase, 'runtime': node['version'],
                          'candidateCommit': context['candidateCommit'], 'result': str(run / 'result.json'),
                          'resultSha256': sha(run / 'result.json'), 'sealSha256': seal_digest}), flush=True)
        return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
