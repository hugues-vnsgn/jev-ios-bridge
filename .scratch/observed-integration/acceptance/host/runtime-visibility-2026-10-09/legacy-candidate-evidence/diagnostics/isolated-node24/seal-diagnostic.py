from pathlib import Path
import collections,datetime,hashlib,json,os,re,stat,subprocess
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime');d=r/'diagnostics/isolated-node24';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
c=json.loads((r/'candidate-source.json').read_text());rc=json.loads((d/'command.json').read_text());original=json.loads((r/'final-evidence-manifest.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==c['candidateCommit']
assert subprocess.check_output(['git','diff','HEAD','--name-only'],text=True)==''
source={p:sha(p) for p in c['source443']};assert source==c['source443']==rc['source443Before']
compiled={str(p):sha(p) for p in sorted(Path('dist').rglob('*.js'))};assert compiled==c['compiled69']==rc['compiled69Before']
for p,info in original['immutableEvidenceFiles'].items():assert sha(r/p)==info['sha256']
assert rc['exitCode']==0
for label in ['stdout','stderr']:assert sha(d/(label+'.txt'))==rc[label+'Sha256']
raw=(d/'stdout.txt').read_text();counts={k:int(v) for k,v in re.findall(r'^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$',raw,re.M)}
assert counts=={'tests':3,'suites':0,'pass':3,'fail':0,'cancelled':0,'skipped':0,'todo':0}
names=[re.sub(r' \([^()]*ms\)$','',x[2:]) for x in raw.splitlines() if x.startswith('✔ ')];assert names==rc['selectedFullNames']
archives={}
for archive in sorted((d/'host-evidence').iterdir()):
    p=archive/'public';name=json.loads((p/'test-context.json').read_text())['name'];calls=[json.loads(x) for x in (p/'calls.jsonl').read_text().splitlines()];milestones=[json.loads(x) for x in (p/'milestones.jsonl').read_text().splitlines()]
    traces={}
    for trace in sorted(p.glob('*.jsonl')):
        data=trace.read_text();assert not data or data.endswith('\n');records=[json.loads(x) for x in data.splitlines()];traces[trace.name]={'sha256':sha(trace),'records':len(records),'completeFinalRecords':True}
    commands={}
    for path in sorted(p.glob('command-*.json')):
        value=json.loads(path.read_text());commands[path.name]={'sha256':sha(path),'transport':value['transport'],'command':value['command'],'code':value['code'],'signal':value['signal'],'childPid':value['pid']};assert value['signal'] is None
    assert not any(m['key'].startswith('forbidden:network:') for m in milestones)
    archives[archive.name]={'case':name,'callCounts':dict(collections.Counter(calls)),'milestoneCount':len(milestones),'hasSnapshotUI1':any(m['key']=='backend:snapshot-ui:1' for m in milestones),'hasBeforeFinalizeFault':any(m['key']=='beforeCommit:finalize:1' for m in milestones),'commandReceipts':commands,'traces':traces,'capturedByExistingHarnessBeforeCleanup':True,'publicAndBackendTreesRetained':(archive/'backend').is_dir()}
assert len(archives)==2
for archive in archives.values():
    if archive['case'].startswith('H06.03'):assert archive['callCounts']['touch']==1 and archive['hasBeforeFinalizeFault']
    else:assert archive['hasSnapshotUI1'] and archive['callCounts'].get('touch',0)==0
oldEnvs={}
for node in ['26','24']:
    old=json.loads((r/('actual-default-node'+node)/'command.json').read_text());assert 'HOST_EVIDENCE_DIR' not in old['env'];oldEnvs[node]=sorted(old['env'])
result={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':c['candidateCommit'],'purpose':'one isolated diagnostic, not a default gate retry','actualArgv':rc['argv'],'cwd':rc['cwd'],'envNames':sorted(rc['env']),'actualChildPid':rc['childPid'],'actualChildProcessGroup':rc['childProcessGroup'],'startedAtUtc':rc['startedAtUtc'],'actualCloseUtc':rc['completedAtUtc'],'exitCode':rc['exitCode'],'counts':counts,'selectedFullNames':names,'receiptSha256':sha(d/'command.json'),'stdoutSha256':sha(d/'stdout.txt'),'stderrSha256':sha(d/'stderr.txt'),'source443Before':rc['source443Before'],'source443After':source,'protected440Unchanged':True,'compiled69Before':rc['compiled69Before'],'compiled69After':compiled,'prior481ImmutableEvidenceRehashMatch':True,'priorFinalEvidenceManifestSha256':sha(r/'final-evidence-manifest.json'),'harnessArchives':archives,'firstActualDiagnosticCause':'none; all three cases passed once in this isolated invocation','originalFailureCause':'unresolved; missing original public raw traces cannot be reconstructed','originalDefaultEnvNames':oldEnvs,'missingTraceQualification':'Original defaults did not set HOST_EVIDENCE_DIR. These new harness archives are fresh isolated traces and cannot replace or reconstruct the original failed full-run fault traces.','defaultFailureRemainsAuthoritative':True,'singleInvocationNoRetryOrSignal':True,'SourceFixtureAndTimeoutChanges':False,'noNativeOperations':True}
put(d/'result.json',result)
report='''# Isolated Node 24 diagnostic

Exactly one anchored three-case invocation on frozen `'''+c['candidateCommit']+'''` closed exit 0 at 2026-10-09T08:30:08.016092Z: 3/3 passed, no failures/cancellations/skips/todos.

The metadata cancellation case completed in 7.398375 ms, H06.03 CLI beforeCommit in 1410.605792 ms, and H05.01 MCP durable cancel in 1178.968542 ms. Two existing-harness public/backend archives were retained before cleanup. The CLI trace contains one touch and the beforeCommit finalization fault; the MCP trace contains backend:snapshot-ui:1 and no touch. Complete calls, milestones, command results and applicable MCP/public-wait traces are hashed in result.json. No forbidden-network milestone or signaled command child was observed.

Source443/protected440 and compiled69 remained unchanged before/after. All 481 immutable prior evidence files rehashed unchanged. Test/fixture/Source bytes, timeouts and subprocess behavior were unchanged. The environment contained only PATH, HOME, LANG, LC_ALL and the new private HOST_EVIDENCE_DIR.

No failure cause was reproduced in this isolated invocation. The original Node 24 full default remains failed and its root cause unresolved. Those defaults lacked HOST_EVIDENCE_DIR; removed original public fault traces cannot be reconstructed. Fresh isolated traces are separately identified and do not replace the original 2198-test failure.

Author is idle pending Root diagnosis or a new explicit window.
'''
(d/'diagnostic-report.md').open('x').write(report)
inventory={};d.chmod(0o700)
for p in sorted(d.rglob('*')):
    info=p.lstat();assert not stat.S_ISLNK(info.st_mode)
    if p.is_dir():p.chmod(0o700);continue
    assert stat.S_ISREG(info.st_mode);originalMode=oct(stat.S_IMODE(info.st_mode));p.chmod(0o600);inventory[str(p.relative_to(d))]={'sha256':sha(p),'bytes':p.stat().st_size,'initialCopiedOrCreatedMode':originalMode,'sealedMode':'0600'}
put(d/'evidence-manifest.json',{'candidateCommit':c['candidateCommit'],'root':str(d.resolve()),'files':inventory,'selfExclusion':'evidence-manifest.json hash sent to Root','otherExclusions':[],'files600Directories700':True,'archiveByteContentUnchangedByPrivacyModeNormalization':True,'previousEvidencePreserved':True})
print(json.dumps({'candidateCommit':c['candidateCommit'],'counts':counts,'actualCloseUtc':rc['completedAtUtc'],'receiptSha256':sha(d/'command.json'),'resultSha256':sha(d/'result.json'),'manifestSha256':sha(d/'evidence-manifest.json'),'archives':{k:v['case'] for k,v in archives.items()},'sealedFiles':len(inventory),'source443AndCompiled69Unchanged':True},indent=2))
