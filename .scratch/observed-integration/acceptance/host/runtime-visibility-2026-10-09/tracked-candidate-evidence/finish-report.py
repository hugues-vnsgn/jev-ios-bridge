import datetime, hashlib, json, os, re
from pathlib import Path
R=Path.cwd();E=R/'.scratch/installed-tracked-runtime';os.umask(0o077)
sha=lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(name,value):
    with (E/name).open('x') as f: json.dump(value,f,indent=2);f.write('\n')
c=json.loads((E/'candidate-source.json').read_text());checks=[];records={};previous=None
for node in ['26','24']:
    label='actual-default-node'+node;d=E/label;r=json.loads((d/'result.json').read_text());v=json.loads((d/'command.json').read_text());raw=(d/'stdout.txt').read_text()
    for name,ok in {
        'counts2258':r['counts']=={'tests':2258,'pass':2258,'fail':0,'cancelled':0,'skipped':0,'todo':0},
        'exit0':v['exitCode']==0, 'actual-close':v['actualCloseRecorded'] and not v['signalSent'] and not v['addedOuterTimeout'],
        'official-argv':v['argv'][1:]==['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'],
        'all-package-steps':all(x in raw for x in ['> tsc --noEmit','> tsx --test tests/*.test.ts','> rm -rf dist && tsc -p tsconfig.build.json']),
        'raw-sha':sha(d/'stdout.txt')==v['stdoutSha256'] and sha(d/'stderr.txt')==v['stderrSha256'] and sha(d/'command.json')==r['commandSha256'],
        'source-frozen':v['candidateSource443']==v['sourceAfter443']==c['source443'],
        'compiled-frozen':v['compiledBefore69']==v['compiledAfter']==c['compiled69'],
        'serial-close':previous is None or previous<v['startedAtUtc'],
        'scrubbed-env':'TYPESAFE_API_KEY' not in v['environment'] and 'NODE_OPTIONS' not in v['environment'] and v['environment']['HOST_EVIDENCE_DIR']==str(d/'host-fault-traces'),
    }.items(): checks.append({'name':label+'-'+name,'pass':bool(ok)})
    previous=v['completedAtUtc'];records[label]={'commandSha256':sha(d/'command.json'),'counts':r['counts'],'actualClose':previous}
checks.append({'name':'working-source-frozen','pass':{p:sha(R/p) for p in c['source443']}==c['source443']})
checks.append({'name':'compiled-frozen','pass':{p.relative_to(R).as_posix():sha(p) for p in (R/'dist').rglob('*') if p.is_file() and not p.is_symlink()}==c['compiled69']})
assert all(x['pass'] for x in checks),checks
coverage={}
for node in ['26','24']:
    coverage[node]=[line for line in (E/('coverage-node'+node)/'stdout.txt').read_text().splitlines() if 'allocation-config.ts' in line and '|' in line]
put('verification-index.json',{'verdict':'AUTHOR VALIDATION PASS; independent Spec/Standards and installed/startup/native pending','candidateCommit':c['candidateCommit'],'candidateContextSha256':sha(E/'candidate-source.json'),'checks':checks,'defaults':records,'coverageRows':coverage,'source443':c['source443'],'protected439':c['protected439'],'compiled69':c['compiled69'],'owned4':c['owned4'],'actualChangedPaths':c['actualChangedPaths']})
report=f"""# Tracked allocation identity correction

Candidate `{c['candidateCommit']}`; parent `{c['parentCommit']}`. Owned4, protected439, Source443, compiled69. Actual new delta3: allocation-config.ts, allocation.ts, legacy runtime tests. Fixture is byte-identical to parent; original241 cases/assertions remain exact.

The real allocator now composes command tracking through trackAllocationSourceProcess. Registered factory expectations stay in the private invoker registry and flow through the tracking thunk per invocation; the callback sees only operation and thunk. Public SourceProcess remains three arguments, injected callbacks receive exactly three arguments, and production branding propagates through nested adapters. Existing deferred abort, tracking and diagnostics behavior is preserved at the allocator call site. No host trust policy is expanded.

## Regression evidence

Pure path isolation14/14 passed on each exact Node before fixture execution. Neutral extraction (real allocator wired, context not forwarded) yielded6 genuine conversion-restoration failures plus6 already-passing bootstrap invariants on each Node. All6 failures accepted observed changed mount identity and restored it before final validation. The repaired shared helper rejects all12 windows with zero target metadata conversions. The full paired diagnostics are in restoration-matrix.json; do not describe all12 cases as genuine reds.

Six additional semantics cases cover injected success/failure diagnostics and exact argument arity, deferred cancellation with no dispatch, nested production brand and fake allocator authority rejection, and concurrent same-factory calls with different captured identities in each namespace. The concurrent second lookup accepts its own fresh identity while the paused stale first lookup refuses; every tracking callback settles through diagnostics. These tests cross the exact shared helper used by allocation.ts. They do not claim complete production Allocator/native execution.

Both Nodes: owned259/259, focused764/764, coverage613/613, typecheck/build0; actual unmodified official npm run check2258/2258, zero fail/cancel/skip/todo and final build0. Defaults ran serially on frozen Source/compiled vectors with fresh HOST_EVIDENCE_DIR, recorded natural close, no added timeouts, concurrency flags, signals or automatic retries.

## Retained qualifications

The first repaired Node26 owned run passed258/259 and failed only the new brand-test assertion: it checked CONFIG_INVALID against Error.message instead of the existing code property. The new assertion was corrected to code equality, unused copied trace calculations removed, and final gates bind the resulting bytes. That original failed receipt and Source are retained under green-node26. Existing241 cases were not weakened.

The original4fa Node24 default failure's lower cause remains UNRESOLVED; later green runs do not explain it. All prior author/review checkouts remain frozen. No dependencies installed or modified, no key/environment file loaded, and no native/device/account/migration/app-build/SDK or candidate installed/startup operation was performed. Independent reviews, candidate clean37/wrapped startup, integration and later operational/live gates remain pending.

Context SHA256: {sha(E/'candidate-source.json')}. Verification index SHA256: {sha(E/'verification-index.json')}.
"""
with (E/'implementation-report.md').open('x') as f:f.write(report)
print(json.dumps({'candidateCommit':c['candidateCommit'],'checks':len(checks),'verificationIndexSha256':sha(E/'verification-index.json'),'reportSha256':sha(E/'implementation-report.md')}))
