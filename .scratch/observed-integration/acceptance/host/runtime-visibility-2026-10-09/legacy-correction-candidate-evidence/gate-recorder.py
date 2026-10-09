import argparse, datetime, fcntl, hashlib, json, os, re, subprocess, time
from pathlib import Path

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
EVIDENCE = ROOT / '.scratch/installed-legacy-volume-runtime/review-correction'
NODE = {'26': '/opt/homebrew/Cellar/node/26.8.1/bin/node',
        '24': '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'}
NODE_SHA = {'26': '902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253',
            '24': 'f28f6fdb2b24cdfc3785f4f8b46fa7b392b0ec5892b075b434049c7d05cfc956'}
NPM = '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js'
OWNED_TEST = 'tests/observed-legacy-volume-runtime.test.ts'
FOCUSED = [OWNED_TEST, 'tests/observed-cryptex-runtime.test.ts', 'tests/observed-allocation-config.test.ts',
           'tests/installed-plist.test.ts', 'tests/observed-allocation.test.ts', 'tests/observed-artifact.test.ts']
os.umask(0o077)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
def put(path, value):
    with path.open('x') as output: output.write(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)
def source(baseline):
    return {p: sha(ROOT / p) for p in baseline['source443']}
def compiled():
    return {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'dist').rglob('*')) if p.is_file() and not p.is_symlink()}
def git(*args):
    return subprocess.check_output(['/usr/bin/git', *args], cwd=ROOT, text=True,
                                   env={'PATH': '/usr/bin:/bin', 'HOME': '/Users/hugues_mini', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'})

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['isolation', 'red', 'owned', 'focused', 'coverage', 'typecheck', 'build', 'default'])
parser.add_argument('node', choices=['26', '24'])
parser.add_argument('label')
parser.add_argument('--freeze', help='Exact candidate-source.json required for default; no mutable Source across either default')
args = parser.parse_args()
assert Path.cwd() == ROOT and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', args.label)
assert sha(NODE[args.node]) == NODE_SHA[args.node]
baseline = json.loads((EVIDENCE / 'baseline.json').read_text())
with (EVIDENCE / 'author-validation.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    run = EVIDENCE / args.label; run.mkdir(mode=0o700, exist_ok=False)
    before = source(baseline); built_before = compiled(); head = git('rev-parse', 'HEAD').strip()
    assert len(before) == 443 and all(before[p] == h for p, h in baseline['protected440'].items())
    freeze = json.loads(Path(args.freeze).read_text()) if args.freeze else None
    if args.mode == 'default':
        assert freeze and head == freeze['candidateCommit'] and before == freeze['source443'] and built_before == freeze['compiled69']
    for p in baseline['owned3']:
        path = run / 'owned-source' / p; path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        path.open('xb').write((ROOT / p).read_bytes()); path.chmod(0o600)
    put(run / 'before.json', {'head': head, 'source443': before, 'protected440': baseline['protected440'], 'compiled69': built_before})
    (run / 'user.npmrc').open('x').close(); (run / 'global.npmrc').open('x').close()
    environment = {'PATH': str(Path(NODE[args.node]).parent) + ':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
                   'HOME': '/Users/hugues_mini', 'LANG': 'C', 'LC_ALL': 'C',
                   'NPM_CONFIG_USERCONFIG': str(run / 'user.npmrc'), 'NPM_CONFIG_GLOBALCONFIG': str(run / 'global.npmrc'),
                   'NPM_CONFIG_CACHE': str(run / 'npm-cache'), 'HOST_EVIDENCE_DIR': str(run / 'host-fault-traces')}
    version = subprocess.run([NODE[args.node], '--version'], env=environment, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    put(run / 'version.json', {'argv': [NODE[args.node], '--version'], 'exitCode': version.returncode,
                             'stdout': version.stdout.decode(), 'stderr': version.stderr.decode(), 'executableSha256': sha(NODE[args.node])})
    assert version.returncode == 0 and version.stdout.decode().strip() == ('v26.8.1' if args.node == '26' else 'v24.0.0')
    if args.mode in ['default', 'typecheck', 'build']:
        command = [NODE[args.node], NPM, 'run', 'check' if args.mode == 'default' else args.mode]
    else:
        command = [NODE[args.node], '--import', 'tsx']
        if args.mode == 'coverage': command += ['--experimental-test-coverage', '--test-coverage-include=**/src/observed/allocation-config.ts']
        command += ['--test']
        if args.mode in ['isolation', 'red']:
            command += ['--test-name-pattern=' + ('^pure legacy ' if args.mode == 'isolation' else '^review correction '), OWNED_TEST]
        else: command += [OWNED_TEST] if args.mode == 'owned' else FOCUSED[:4] if args.mode == 'coverage' else FOCUSED
    record = {'argv': command, 'cwd': str(ROOT), 'mode': args.mode, 'runtime': version.stdout.decode().strip(),
              'startedAtUtc': now(), 'environmentNames': sorted(environment), 'environment': environment,
              'absentEnvironment': ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS'],
              'parentUmask': '0077', 'childUmask': '0022', 'candidateSource443': before, 'protected440': baseline['protected440'],
              'owned3': {p: before[p] for p in baseline['owned3']}, 'compiledBefore69': built_before, 'head': head,
              'addedOuterTimeout': False, 'signalSent': False}
    start = time.monotonic()
    with (run / 'stdout.txt').open('xb') as stdout, (run / 'stderr.txt').open('xb') as stderr:
        child = subprocess.Popen(command, cwd=ROOT, env=environment, stdin=subprocess.DEVNULL,
                                 stdout=stdout, stderr=stderr, start_new_session=True, umask=0o022)
        record.update({'childPid': child.pid, 'childProcessGroup': os.getpgid(child.pid)})
        put(run / 'launch.json', record)
        code = child.wait()
    record.update({'exitCode': code, 'completedAtUtc': now(), 'durationSeconds': time.monotonic() - start,
                   'actualCloseRecorded': True, 'stdoutSha256': sha(run / 'stdout.txt'), 'stderrSha256': sha(run / 'stderr.txt')})
    after = source(baseline); built_after = compiled()
    record.update({'sourceAfter443': after, 'compiledAfter': built_after, 'sourceUnchanged': before == after,
                   'protected440Unchanged': all(after[p] == h for p, h in baseline['protected440'].items())})
    put(run / 'command.json', record)
    raw = (run / 'stdout.txt').read_text(errors='replace'); counts = {}
    for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
        matches = re.findall(r'(?m)^(?:# |ℹ )' + key + r' (\d+)\s*$', raw)
        if matches: counts[key] = int(matches[-1])
    put(run / 'result.json', {'exitCode': code, 'counts': counts, 'actualCloseRecorded': True,
                            'commandSha256': sha(run / 'command.json'), 'sourceUnchanged': before == after,
                            'compiledCountAfter': len(built_after), 'defaultBuildReached': '> rm -rf dist && tsc -p tsconfig.build.json' in raw})
    put(run / 'compiled-manifest.json', built_after)
    if args.mode == 'build' or (args.mode == 'default' and code == 0):
        for p in built_after:
            path = run / 'compiled' / p; path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            path.open('xb').write((ROOT / p).read_bytes()); path.chmod(0o600)
    print(json.dumps({'label': args.label, 'mode': args.mode, 'runtime': record['runtime'], 'exitCode': code,
                      'counts': counts, 'actualClose': record['completedAtUtc'], 'sourceUnchanged': before == after,
                      'commandSha256': sha(run / 'command.json')}), flush=True)
    assert before == after and record['protected440Unchanged']
    if args.mode == 'default': assert after == freeze['source443'] and built_after == freeze['compiled69']
    raise SystemExit(code)
