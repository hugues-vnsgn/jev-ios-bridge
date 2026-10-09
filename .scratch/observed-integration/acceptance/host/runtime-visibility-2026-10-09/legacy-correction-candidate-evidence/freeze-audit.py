import datetime, hashlib, json, os, re, subprocess
from pathlib import Path

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
EVIDENCE = ROOT / '.scratch/installed-legacy-volume-runtime/review-correction'
os.umask(0o077)
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
data_sha = lambda data: hashlib.sha256(data).hexdigest()
def git(*args, input=None):
    return subprocess.run(['/usr/bin/git', *args], cwd=ROOT, input=input, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True,
                          env={'PATH': '/usr/bin:/bin', 'HOME': '/Users/hugues_mini',
                               'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_NOSYSTEM': '1'}).stdout
def put(name, value):
    path = EVIDENCE / name
    with path.open('x') as stream: json.dump(value, stream, indent=2); stream.write('\n')
    path.chmod(0o600)
    return sha(path)

baseline = json.loads((EVIDENCE / 'baseline.json').read_text())
checks = []
def check(name, value):
    checks.append({'name': name, 'pass': bool(value)})
    if not value: raise RuntimeError(name)

try:
    current = {p: sha(ROOT / p) for p in baseline['source443']}
    owned = {p: current[p] for p in baseline['owned3']}
    check('Source443 and protected440 cardinality', len(current) == 443 and len(baseline['protected440']) == 440)
    check('Every protected baseline byte preserved', all(current[p] == h for p, h in baseline['protected440'].items()))
    check('All original owned bytes retained before edits', all(sha(EVIDENCE / 'base-owned-bytes' / p) == h for p, h in baseline['owned3'].items()))
    changed = git('diff', '--name-only').decode().splitlines()
    check('Exactly the three declared product paths changed', set(changed) == set(owned))
    check('Diff whitespace check', git('diff', '--check') == b'')

    test = 'tests/observed-legacy-volume-runtime.test.ts'
    old_test = (EVIDENCE / 'base-owned-bytes' / test).read_text()
    new_test = (ROOT / test).read_text()
    old_prefix = new_test.split('\nconst correctionLeaves =', 1)[0]
    old_prefix = old_prefix.replace("import { cryptexMount, cryptexBundle }", "import { cryptexMount }")
    check('All original199 case bodies and assertions byte-preserved; one additive import', old_prefix == old_test)
    fixture = 'tests/fixtures/observed-legacy-volume-runtime.ts'
    old_fixture = (EVIDENCE / 'base-owned-bytes' / fixture).read_text()
    new_fixture = (ROOT / fixture).read_text()
    guard_start = '  const effects: '
    guard_end = '  return { ...base, host, source, launch, launches'
    old_guard = old_fixture[old_fixture.index(guard_start):old_fixture.index(guard_end)]
    new_guard = new_fixture[new_fixture.index(guard_start):new_fixture.index(guard_end)]
    check('Fixture process argv/env/output guard and fake-launch implementation byte-preserved', old_guard == new_guard)
    check('Fixture pure mapper, identity view and namespace guard byte-preserved',
          old_fixture[:old_fixture.index('  const reads: ')] == new_fixture[:new_fixture.index('  const reads: ')])

    source = 'src/observed/allocation-config.ts'
    old_source = (EVIDENCE / 'base-owned-bytes' / source).read_text()
    new_source = (ROOT / source).read_text()
    for declaration in re.findall(r'(?m)^export (?:async )?(?:function|const|type) [^\n]+', old_source):
        check('Public declaration preserved: ' + declaration.split('(')[0], declaration in new_source)
    check('Ordinary injected process private adapter has exactly three forwarded arguments',
          '?? ((executable, args, options) => process(executable, args, options));' in new_source)
    check('Public production factory has exactly three forwarded arguments',
          'const process: SourceProcess = (executable, args, options) => invoke(executable, args, options);' in new_source)

    gate_specs = {'final-green': ('red', 42), 'final-focused': ('focused', 746),
                  'final-coverage': ('coverage', 595), 'final-typecheck': ('typecheck', None),
                  'final-build': ('build', None)}
    gates = {}
    for stem, (mode, count) in gate_specs.items():
        for node in ['26', '24']:
            label = f'{stem}-node{node}'; run = EVIDENCE / label
            command = json.loads((run / 'command.json').read_text())
            result = json.loads((run / 'result.json').read_text())
            check(label + ' actual close exit0, no signal or outer timeout', command['actualCloseRecorded']
                  and command['exitCode'] == 0 and not command['signalSent'] and not command['addedOuterTimeout'])
            check(label + ' complete raw receipt hashes', command['stdoutSha256'] == sha(run / 'stdout.txt')
                  and command['stderrSha256'] == sha(run / 'stderr.txt') and result['commandSha256'] == sha(run / 'command.json'))
            check(label + ' exact final Source443 before/after and owned archives', command['candidateSource443'] == current
                  and command['sourceAfter443'] == current
                  and all(sha(run / 'owned-source' / p) == h for p, h in owned.items()))
            check(label + ' exact runtime/mode/cwd', command['mode'] == mode and command['cwd'] == str(ROOT)
                  and command['runtime'] == ('v26.8.1' if node == '26' else 'v24.0.0'))
            if count is not None:
                check(label + ' complete expected counts', result['counts'] == {'tests': count, 'pass': count,
                      'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0})
            gates[label] = {'commandSha256': sha(run / 'command.json'), 'resultSha256': sha(run / 'result.json'),
                            'stdoutSha256': sha(run / 'stdout.txt'), 'stderrSha256': sha(run / 'stderr.txt'),
                            'counts': result['counts'], 'startedAtUtc': command['startedAtUtc'],
                            'completedAtUtc': command['completedAtUtc'], 'durationSeconds': command['durationSeconds']}

    compiled = json.loads((EVIDENCE / 'final-build-node26/compiled-manifest.json').read_text())
    check('Both final builds have identical69 compiled bytes', len(compiled) == 69
          and compiled == json.loads((EVIDENCE / 'final-build-node24/compiled-manifest.json').read_text()))
    check('Current dist matches final69 and has no extra regular files', compiled == {
          p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'dist').rglob('*')) if p.is_file() and not p.is_symlink()})
    for node in ['26', '24']:
        check('Final build retained exact69 bytes Node' + node,
              all(sha(EVIDENCE / f'final-build-node{node}/compiled' / p) == h for p, h in compiled.items()))
    check('Serial final gates do not overlap', all(a['completedAtUtc'] <= b['startedAtUtc']
          for a, b in zip(sorted(gates.values(), key=lambda g: g['startedAtUtc']),
                          sorted(gates.values(), key=lambda g: g['startedAtUtc'])[1:])))
    report = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'verdict': 'PASS',
              'authorCwd': str(ROOT), 'base': baseline['base'], 'headBeforeCommit': git('rev-parse', 'HEAD').decode().strip(),
              'checks': checks, 'source443': current, 'owned3': owned, 'protected440': baseline['protected440'],
              'compiled69': compiled, 'finalGates': gates, 'originalFixtureGuardSha256': data_sha(old_guard.encode()),
              'originalTestPrefixSha256': data_sha(old_test.encode()), 'baselineSha256': sha(EVIDENCE / 'baseline.json'),
              'redAuditSha256': sha(EVIDENCE / 'genuine-red-audit.json'),
              'excludedClaims': ['Independent review', 'Candidate installed clean37/startup execution',
                                 'Native compatibility/device acceptance', 'Original4fa default failure root cause']}
    digest = put('predefault-freeze-audit.json', report)
    print(json.dumps({'verdict': 'PASS', 'checks': len(checks), 'source': len(current), 'protected': 440,
                      'compiled': len(compiled), 'owned3': owned, 'auditSha256': digest}))
except Exception as error:
    put('predefault-freeze-audit-FAIL.json', {'checks': checks, 'error': str(error)})
    raise
