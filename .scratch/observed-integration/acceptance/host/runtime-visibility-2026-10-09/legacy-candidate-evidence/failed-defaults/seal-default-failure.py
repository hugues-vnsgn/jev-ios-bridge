from pathlib import Path
import datetime,hashlib,json,os,stat,subprocess
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
c=json.loads((r/'candidate-source.json').read_text());pre=json.loads((r/'predefault-evidence-manifest.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==c['candidateCommit']
assert subprocess.check_output(['git','diff','HEAD','--name-only'],text=True)==''
assert {p:sha(p) for p in c['source443']}==c['source443']
for p,info in pre['immutableEvidenceFiles'].items():assert sha(r/p)==info['sha256']
defaults={};previous=None
for node in ['26','24']:
    d=r/('actual-default-node'+node);rc=json.loads((d/'command.json').read_text());rr=json.loads((d/'result.json').read_text())
    assert rr['actualCloseRecorded'] and rr['receiptSha256']==sha(d/'command.json')
    assert rc['argv'][1:]==['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check']
    assert rc['candidateSource443']==c['source443'] and rr['compiled69']==c['compiled69']
    assert rc['commandChildUmask']=='022' and rc['evidenceUmask']=='077'
    assert all(name not in rc['env'] for name in ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])
    if previous:assert rc['startedAtUtc']>=previous
    previous=rc['completedAtUtc']
    for label in ['stdout','stderr']:assert sha(d/(label+'.txt'))==rc[label+'Sha256']
    defaults[node]={'receipt':str(d/'command.json'),'receiptSha256':sha(d/'command.json'),'resultSha256':sha(d/'result.json'),'exactArgv':rc['argv'],'counts':rr['counts'],'exitCode':rc['exitCode'],'startUtc':rc['startedAtUtc'],'actualChildCloseUtc':rc['completedAtUtc'],'childPid':rc['childPid'],'childProcessGroup':rc['childProcessGroup'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'stdoutBytes':rc['stdoutBytes'],'stderrBytes':rc['stderrBytes'],'source443Fixed':True,'protected440Fixed':True,'compiled69AfterMatchesFreeze':True,'defaultBuildReached':node=='26'}
assert defaults['26']['exitCode']==0 and defaults['26']['counts']=={'tests':2198,'suites':0,'pass':2198,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert defaults['24']['exitCode']==1 and defaults['24']['counts']=={'tests':2198,'suites':0,'pass':2195,'fail':2,'cancelled':1,'skipped':0,'todo':0}
raw=(r/'actual-default-node24/stdout.txt').read_text();lines=raw.splitlines();first=[]
for i,line in enumerate(lines):
    if line=='✖ failing tests:':break
    if line.startswith('✖ '):first.append({'lineNumber':i+1,'line':line})
tail=raw[raw.index('✖ failing tests:'):]
(r/'default-failure-blocks.txt').open('x').write(tail)
put(r/'first-emitted-failure-markers.json',{'derivedAfterActualCloseFromUnmodifiedRaw':True,'rawSource':'actual-default-node24/stdout.txt','rawSourceSha256':sha(r/'actual-default-node24/stdout.txt'),'markers':first,'finalFailureBlocks':'default-failure-blocks.txt','finalFailureBlocksSha256':sha(r/'default-failure-blocks.txt')})
after=r/'after-failure-compiled';after.mkdir(mode=0o700)
for p,h in c['compiled69'].items():
    assert sha(p)==h;target=after/p;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.open('xb').write(Path(p).read_bytes())
put(r/'after-failure-compiled-manifest.json',{'compiled69':c['compiled69'],'provenance':'Node26 actual-default build; Node24 default failed during tests and did not build. Current bytes retained after failed Node24 actual close.'})
receipts={}
for d in sorted(r.iterdir()):
    if not d.is_dir() or not (d/'command.json').exists():continue
    rc=json.loads((d/'command.json').read_text());rr=json.loads((d/'result.json').read_text());assert rr['actualCloseRecorded']
    assert rr['receiptSha256']==sha(d/'command.json')
    for label in ['stdout','stderr']:assert sha(d/(label+'.txt'))==rc[label+'Sha256']
    receipts[d.name]={'receiptSha256':sha(d/'command.json'),'resultSha256':sha(d/'result.json'),'counts':rr['counts'],'exitCode':rc['exitCode'],'startUtc':rc['startedAtUtc'],'actualCloseUtc':rc['completedAtUtc'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'owned3':rc['owned3']}
index={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':c['candidateCommit'],'parent':c['parent'],'authorVerdict':'FAIL full default on Node24; focused hermetic gates PASS; awaiting Root diagnosis, no retry','candidateSourceSha256':sha(r/'candidate-source.json'),'source443':c['source443'],'protected440':c['protected440'],'owned3':c['owned3'],'compiled69':c['compiled69'],'predefaultEvidenceManifestSha256':sha(r/'predefault-evidence-manifest.json'),'prior320ImmutableEvidenceFilesRehashMatch':True,'actualDefaults':defaults,'firstEmittedFailureMarkers':first,'failureBlocksSha256':sha(r/'default-failure-blocks.txt'),'confirmedErrors':['observed-artifact.test.ts:133 timed out after unchanged1000ms','observed-crash.test.ts:94 expected1 actual0','observed-public-races.test.ts:73 and observed-host/harness.ts:108 backend:snapshot-ui:1 milestone not reached'],'causeBeyondTheseErrors':'not inferred; Root diagnosis pending','rawReceipts':receipts,'sourceFrozenAcrossBothDefaults':True,'noDefaultRetryOrSignal':True,'node24DefaultBuildNotReached':True,'successSealDraft':'seal-final.py was prepared but never executed; its PASS assumptions are superseded by this actual failure index','noNativeOperationsByAuthor':True}
put(r/'default-failure-index.json',index)
report='''# Actual-default failure handoff

Candidate `'''+c['candidateCommit']+'''` remains frozen over `'''+c['parent']+'''`.

| Actual unmodified npm run check | Counts | Exit / actual close UTC |
| --- | --- | --- |
| Exact Node 26.8.1 | 2198/2198 pass | 0 / 08:21:58.790962 |
| Exact Node 24.0.0 | 2198 total, 2195 pass, 2 fail, 1 cancelled | 1 / 08:24:47.928771 |

The first emitted failure was observed-artifact.test.ts:133 exceeding its unchanged 1000 ms test timeout. The final raw summary also reports observed-crash.test.ts:94 expecting 1 but receiving 0 for H06.03 CLI beforeCommit response fault, and observed-public-races.test.ts:73 / observed-host/harness.ts:108 not reaching backend:snapshot-ui:1 for H05.01 MCP durable cancel. These are protected tests. No further root cause or flakiness is inferred.

Both recorded command children closed naturally. Source443/protected440 stayed unchanged, with no retry, process signal or Source/test/fixture edit. Node 24 failed in the test phase and did not reach its default build; compiled69 retained after that failure is from Node 26's completed default build. Before the freeze, focused704/704, coverage553/553, typecheck and build passed on both Nodes, and both 69-file build vectors matched.

The original failure output, first marker locations, complete final blocks, argv/environment-name/PID/time/exit receipts, all historical reds and the three-file Source freeze are preserved. Predefault reports remain historical and unchanged. The prepared success-seal script was never executed; this failure index is authoritative. All private artifacts and explicit operational/self exclusions are sealed in final-evidence-manifest.json.

Full-default verdict: FAIL on Node 24. Root diagnosis and any further gate grant are required. Author is idle. Independent review, integration/native compatibility and live acceptance remain pending; no native/device/key/store operation was performed by this author.
'''
(r/'default-failure-report.md').open('x').write(report)
inventory={};exclusions={};r.chmod(0o700)
for p in sorted(r.rglob('*')):
    info=p.lstat();assert not stat.S_ISLNK(info.st_mode)
    if p.is_dir():p.chmod(0o700);continue
    assert stat.S_ISREG(info.st_mode);p.chmod(0o600);rel=str(p.relative_to(r));entry={'sha256':sha(p),'bytes':p.stat().st_size,'mode':'0600'}
    if rel.startswith('npm-cache/') or rel=='validation.lock':exclusions[rel]={**entry,'reason':'operational cache/lock; no acceptance evidence excluded'}
    else:inventory[rel]=entry
put(r/'final-evidence-manifest.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':c['candidateCommit'],'root':str(r.resolve()),'immutableEvidenceFiles':inventory,'operationalExclusions':exclusions,'selfExclusion':'final-evidence-manifest.json SHA256 sent to Root','priorPredefaultManifestRehashed':True,'files600Directories700':True,'historicalCryptexDirectoryUntouched':True,'acceptanceReceiptExclusions':[],'actualDefaultVerdict':'Node26 PASS, Node24 FAIL, no retry'})
print(json.dumps({'candidateCommit':c['candidateCommit'],'default26':defaults['26'],'default24':defaults['24'],'failureIndexSha256':sha(r/'default-failure-index.json'),'failureReportSha256':sha(r/'default-failure-report.md'),'finalEvidenceManifestSha256':sha(r/'final-evidence-manifest.json'),'immutableEvidenceFiles':len(inventory),'operationalExclusions':len(exclusions)},indent=2))
