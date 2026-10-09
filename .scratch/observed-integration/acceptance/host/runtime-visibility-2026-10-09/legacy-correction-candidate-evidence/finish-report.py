import datetime, hashlib, json, os, re, stat, subprocess
from pathlib import Path

ROOT = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding')
EVIDENCE = ROOT / '.scratch/installed-legacy-volume-runtime/review-correction'
os.umask(0o077)
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
def put(name, value):
    path = EVIDENCE / name
    with path.open('x') as stream: json.dump(value, stream, indent=2); stream.write('\n')
    path.chmod(0o600)
    return sha(path)

context = json.loads((EVIDENCE / 'candidate-source.json').read_text())
audit = json.loads((EVIDENCE / 'predefault-freeze-audit.json').read_text())
commands = {}
checks = []
def check(name, value):
    checks.append({'name': name, 'pass': bool(value)})
    if not value: raise RuntimeError(name)
try:
    check('Source443 are regular nonalias files', all(not (ROOT / p).is_symlink()
          and stat.S_ISREG((ROOT / p).lstat().st_mode) and (ROOT / p).lstat().st_nlink == 1
          for p in context['source443']))
    check('Compiled dist contains no symlinks or nonregular leaves', not (ROOT / 'dist').is_symlink()
          and all(not p.is_symlink() and (p.is_dir() or stat.S_ISREG(p.lstat().st_mode))
                  for p in (ROOT / 'dist').rglob('*')))
    check('Current443 match frozen candidate', {p: sha(ROOT / p) for p in context['source443']} == context['source443'])
    check('Current69 compiled match frozen candidate', {p.relative_to(ROOT).as_posix(): sha(p)
          for p in sorted((ROOT / 'dist').rglob('*')) if p.is_file() and not p.is_symlink()} == context['compiled69'])
    head = subprocess.check_output(['/usr/bin/git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    check('HEAD remains corrected frozen candidate', head == context['candidateCommit'])
    check('Every final predefault gate binds current Source', all(row['pass'] for row in audit['checks'])
          and audit['source443'] == context['source443'] and audit['compiled69'] == context['compiled69'])
    for node in ['26', '24']:
        run = EVIDENCE / ('actual-default-node' + node)
        command = json.loads((run / 'command.json').read_text()); result = json.loads((run / 'result.json').read_text())
        commands[node] = command
        check('Node' + node + ' official unchanged default actual close exit0', command['mode'] == 'default'
              and command['exitCode'] == 0 and command['actualCloseRecorded']
              and command['argv'][1:] == ['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', 'run', 'check']
              and not command['signalSent'] and not command['addedOuterTimeout'])
        check('Node' + node + ' complete2240 counts', result['counts'] == {'tests': 2240, 'pass': 2240,
              'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0})
        check('Node' + node + ' raw stdout/stderr hashes and result binding', command['stdoutSha256'] == sha(run / 'stdout.txt')
              and command['stderrSha256'] == sha(run / 'stderr.txt') and result['commandSha256'] == sha(run / 'command.json'))
        check('Node' + node + ' Source443 and compiled69 unchanged', command['candidateSource443'] == context['source443']
              and command['sourceAfter443'] == context['source443'] and command['compiledBefore69'] == context['compiled69']
              and command['compiledAfter'] == context['compiled69'] and command['head'] == head)
        check('Node' + node + ' all3 contemporaneous owned Source archives',
              all(sha(run / 'owned-source' / p) == h for p, h in context['owned3'].items()))
        check('Node' + node + ' all69 compiled bytes retained',
              all(sha(run / 'compiled' / p) == h for p, h in context['compiled69'].items()))
        check('Node' + node + ' keys/loaders/warning suppression absent',
              set(command['absentEnvironment']) == {'TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS'}
              and not any(k in command['environmentNames'] for k in command['absentEnvironment'])
              and command['parentUmask'] == '0077' and command['childUmask'] == '0022')
        raw = (run / 'stdout.txt').read_text()
        markers = [{'line': index, 'text': line, 'lineSha256': hashlib.sha256(line.encode()).hexdigest()}
                   for index, line in enumerate(raw.splitlines(), 1)
                   if line == '> rm -rf dist && tsc -p tsconfig.build.json']
        check('Node' + node + ' exact raw final build command marker', len(markers) == 1 and result['defaultBuildReached'])
        put('actual-default-node' + node + '-derived-build-proof.json', {'commandSha256': sha(run / 'command.json'),
            'stdoutSha256': sha(run / 'stdout.txt'), 'marker': markers[0], 'actualCloseRecorded': True,
            'exitCode': 0, 'compiled69': context['compiled69'], 'claim': 'Exact build line plus command exit0 and compiled bytes'})
    check('Official defaults strictly serial after natural close', commands['26']['completedAtUtc'] <= commands['24']['startedAtUtc'])
    index = {'candidateCommit': head, 'candidateContextSha256': sha(EVIDENCE / 'candidate-source.json'),
             'verdict': 'AUTHOR VALIDATION PASS; independent reviews and installed/startup remain pending',
             'checks': checks, 'predefaultAuditSha256': sha(EVIDENCE / 'predefault-freeze-audit.json'),
             'regressionMatrixSha256': sha(EVIDENCE / 'correction-regression-matrix.json'), 'defaults': {}}
    for node in ['26', '24']:
        run = EVIDENCE / ('actual-default-node' + node)
        index['defaults'][node] = {name: {'path': str(run / name), 'sha256': sha(run / name)}
                                 for name in ['command.json', 'launch.json', 'result.json', 'stdout.txt', 'stderr.txt',
                                              'before.json', 'compiled-manifest.json', 'version.json']}
        index['defaults'][node]['derivedBuildProof'] = {
            'path': str(EVIDENCE / ('actual-default-node' + node + '-derived-build-proof.json')),
            'sha256': sha(EVIDENCE / ('actual-default-node' + node + '-derived-build-proof.json'))}
    index_digest = put('verification-index.json', index)

    table = '\n'.join(f'| {label} | {row["counts"].get("pass", "—")} | 0 | {row["completedAtUtc"]} |'
                      for label, row in audit['finalGates'].items())
    default_rows = '\n'.join(f'| Official default Node{node} | 2240 | 0 | {commands[node]["completedAtUtc"]} |'
                             for node in ['26', '24'])
    owned_rows = '\n'.join(f'| `{path}` | `{digest}` |' for path, digest in context['owned3'].items())
    text = f'''# Legacy mounted-runtime review correction

## Frozen candidate

Commit `{head}` over `{context['parentCommit']}` in `fix-installed-legacy-binding`.
Only three declared product paths changed. Git and working Source443 are equal;
all protected440 bytes are unchanged. Both final builds and both official defaults
produce the same 69 compiled bytes. Candidate context SHA:
`{sha(EVIDENCE / 'candidate-source.json')}`.

| Owned path | SHA256 |
|---|---|
{owned_rows}

The original `fix-installed-cryptex-runtime` checkout and its4fa evidence stayed
frozen. The original 4fa Standards review PASS does not override its Spec P1/P2 FAIL.
This is the author's implementation/validation report, not an independent verdict.

## Corrected behavior

P1/policy clause 27: each subsequent fresh mounted proof and path read compares the
initially enumerated candidate identity as each component is observed. A private
per-invocation context carries that mount snapshot and the caller's full file-path
snapshot into the registered production conversion invoker. The same context reaches
its closed-over diskutil bootstrap. The public factory and ordinary injected process
keep exactly three arguments; no public trust parameter, mutable current context,
global identity anchor or cached mount proof was introduced. Fresh read-only XML
proofs and all existing lossless identities, bounds and namespace rules remain.

P2/policy clause 23: the shared byte reader checks the signal immediately after
awaited open inside try/finally, after stat, and after every read including EOF.
Final byte confirmation checks again after cleanup. Once the shared signal aborts,
only the acquired handle's close may dispatch. The fixture adds observed identity
and awaited-result hooks; close cleanup does not depend on path presence.

## Genuine regression evidence

Both exact Nodes first passed the 14 existing pure mapping cases. Against original
production Source, both corrective runs recorded 42 tests, 0 pass, 42 genuine failures:
18 restored identity cases and 24 awaited open/EOF cancellation cases. Every
identity case actually observed inode 202, later restored 101, kept the read-only XML
unchanged and was incorrectly accepted. Every abort case dispatched a later
opened-stat. Each injection followed a valid successful compatibility lookup.

The 42 cases cover both legacy and Cryptex namespaces, all three metadata leaves,
caller conversion, production inner conversion and internal diskutil recursion;
abort cases cover both caller and production read layers. Final 42/42 runs on both
Nodes reject the actually observed identity mismatch before metadata conversion
and show exactly one post-abort close with no later Source effect or fake launch.
The matrix retains exact test names, ordinal rows and raw diagnostics per Node.

All original 199 case bodies/assertions are byte-preserved, with only an additive
Cryptex bundle import above them. Original parameter rows and the duplicate display
label qualification are retained. The fixture's pure mapper, identity view, Source
argv/env/output guards and fake launch implementation are byte-preserved. Red
test/fixture/Source archives are contemporaneous, not reconstructed. Intermediate
42/42/typecheck and 746/746 Node26 receipts remain separate: the later exact
three-argument injected-process fallback repair was followed by all final gates.

## Final exact-byte gates

Every listed final gate binds the frozen candidate's exact working bytes; the
predefault gates preceded the commit without any byte change. Each is serial,
retains raw stdout/stderr, command/runtime/environment names, before/after Source
vectors and actual child close. Final coverage is 98.77% lines, 94.55% branches,
89.16% functions in allocation-config.ts (raw reports retained).

| Gate | Passed tests | Exit | Actual close UTC |
|---|---:|---:|---|
{table}
{default_rows}

The official commands were the unchanged pinned Node plus official npm-cli
`run check`, whose package script is `npm run typecheck && npm test && npm run build`.
No test flags, concurrency/timeout changes, warning suppression, signal or retry
were added. Parent umask 077, ordinary child 022, empty private npm configs and a
minimal environment omitted the key, NODE_OPTIONS and NODE_NO_WARNINGS.
HOST_EVIDENCE_DIR retained the actual public/backend fake-host traces.

The 74-check predefault audit SHA is `{sha(EVIDENCE / 'predefault-freeze-audit.json')}`.
Final verification index SHA is `{index_digest}`. Exact raw build-line proofs bind
each completed official command to its 69 compiled payload. Full evidence manifests
describe every retained regular file, symlink, original mode and explicit exclusion;
symlink targets are recorded without following them.

## Limits and remaining execution

All these tests use hermetic temporary installed namespaces and fake launch seams.
They prove neither native compatibility nor kernel namespace pinning/device
acceptance. The original 4fa Node24 failed 2198-test default remains preserved;
its lower cause is unresolved. Later green comparisons and these corrected gates
do not establish a repair of that historical timing/fault failure.

Both independent corrected-candidate reviews remain Root's next step. The successor
installed/startup recorder is prepared only (SHA
`d5b7801ee715c2b7aef52a319f28ba828b12f8b050e5ae06f276c93cf35076db`).
Candidate clean37 packaging and wrapped startup execution remain held for later
Root dispatch after both reviews PASS. Root then integrates/revalidates; the sole
native operator stays idle until fresh installed and compatibility gates pass.
'''
    path = EVIDENCE / 'implementation-report.md'
    with path.open('x') as stream: stream.write(text)
    path.chmod(0o600)
    print(json.dumps({'verdict': 'AUTHOR VALIDATION PASS', 'checks': len(checks),
                     'verificationIndexSha256': index_digest, 'reportSha256': sha(path)}))
except Exception as error:
    put('final-verification-FAIL.json', {'checks': checks, 'error': str(error)})
    raise
