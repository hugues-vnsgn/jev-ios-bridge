from pathlib import Path
import collections,datetime,hashlib,json,os,re,stat,statistics
os.umask(0o077)
author=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime');r=author/'.scratch/installed-legacy-volume-runtime';d=r/'diagnostics/parallel-three-cases';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
pre=json.loads((d/'preflight.json').read_text());complete=json.loads((d/'cohorts-complete.json').read_text());prior={}
for file,parent,key in [('final-evidence-manifest.json',r,'immutableEvidenceFiles'),('diagnostics/isolated-node24/evidence-manifest.json',r/'diagnostics/isolated-node24','files')]:
    m=json.loads((r/file).read_text());assert all(sha(parent/p)==info['sha256'] for p,info in m[key].items());assert sha(r/file)==pre['previousEvidence'][file]['sha256'];prior[file]={'sha256':sha(r/file),'filesRehashMatch':len(m[key])}
timings={};runs={};archiveCount=0;commandCount=0
for cohort in ['baseline','candidate']:
    summary=complete[cohort];cwd=Path(summary['cwd']);expectedSource=pre['baselineSource441' if cohort=='baseline' else 'candidateSource443'];expectedCompiled=pre['baselineCompiled69' if cohort=='baseline' else 'candidateCompiled69']
    assert {p:sha(cwd/p) for p in expectedSource}==expectedSource
    assert {str(p.relative_to(cwd)):sha(p) for p in sorted((cwd/'dist').rglob('*.js'))}==expectedCompiled
    assert summary['aggregateCounts']=={'tests':12,'pass':12,'fail':0,'cancelled':0,'skipped':0,'todo':0}
    samples={};cohortRuns={}
    for run in sorted((d/cohort).glob('run-*')):
        rc=json.loads((run/'command.json').read_text());assert rc['exitCode']==0 and rc['counts']=={'tests':3,'suites':0,'pass':3,'fail':0,'cancelled':0,'skipped':0,'todo':0}
        assert rc['argv']==pre['exactArgv'] and rc['sourceBefore']==rc['sourceAfter']==expectedSource and rc['compiled69Before']==rc['compiled69After']==expectedCompiled
        assert sorted(rc['env'])==['HOME','HOST_EVIDENCE_DIR','LANG','LC_ALL','PATH'] and rc['childUmask']=='022' and rc['evidenceUmask']=='077'
        assert Path(rc['env']['HOST_EVIDENCE_DIR'])==run/'host-evidence'
        for label in ['stdout','stderr']:assert sha(run/(label+'.txt'))==rc[label+'Sha256']
        successful=[]
        for line in (run/'stdout.txt').read_text().splitlines():
            m=re.match(r'^✔ (.*) \((\d+(?:\.\d+)?)ms\)$',line)
            if m:successful.append(m.group(1));samples.setdefault(m.group(1),[]).append(float(m.group(2)))
        assert successful==pre['selectedFullNames'];archives={}
        for archive in sorted((run/'host-evidence').iterdir()):
            public=archive/'public';name=json.loads((public/'test-context.json').read_text())['name'];calls=[json.loads(x) for x in (public/'calls.jsonl').read_text().splitlines()];milestones=[json.loads(x) for x in (public/'milestones.jsonl').read_text().splitlines()];traces={};commands={}
            for trace in sorted(public.glob('*.jsonl')):
                raw=trace.read_text();assert not raw or raw.endswith('\n');records=[json.loads(x) for x in raw.splitlines()];traces[trace.name]={'sha256':sha(trace),'records':len(records),'finalRecordsComplete':True}
            for command in sorted(public.glob('command-*.json')):
                raw=json.loads(command.read_text());assert raw['signal'] is None;commands[command.name]={'sha256':sha(command),'transport':raw['transport'],'command':raw['command'],'pid':raw['pid'],'exitCode':raw['code'],'signal':raw['signal']};commandCount+=1
            assert not any(x['key'].startswith('forbidden:network:') for x in milestones)
            snapshot=any(x['key']=='backend:snapshot-ui:1' for x in milestones);beforeFinalize=any(x['key']=='beforeCommit:finalize:1' for x in milestones)
            if name.startswith('H06.03'):assert calls.count('touch')==1 and beforeFinalize
            else:assert name.startswith('H05.01') and calls.count('touch')==0 and snapshot
            assert (archive/'backend').is_dir();archiveCount+=1;archives[archive.name]={'case':name,'callCounts':dict(collections.Counter(calls)),'milestoneRecords':len(milestones),'snapshotUI1Reached':snapshot,'beforeFinalizeFaultReached':beforeFinalize,'commands':commands,'traces':traces,'publicAndBackendTreesRetainedBeforeCleanup':True}
        assert len(archives)==2
        cohortRuns[run.name]={'receiptSha256':sha(run/'command.json'),'counts':rc['counts'],'exitCode':rc['exitCode'],'childPid':rc['childPid'],'childProcessGroup':rc['childProcessGroup'],'startedAtUtc':rc['startedAtUtc'],'actualChildCloseUtc':rc['actualChildCloseUtc'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'sourceAndCompiledBeforeAfterMatch':True,'hostArchives':archives}
    timings[cohort]={name:{'samplesMs':values,'medianMs':statistics.median(values),'maxMs':max(values)} for name,values in samples.items()};runs[cohort]=cohortRuns
assert archiveCount==16 and commandCount==48
assert max(x['actualChildCloseUtc'] for x in runs['baseline'].values())<min(x['startedAtUtc'] for x in runs['candidate'].values())
result={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'comparisonVerdict':'No reproduction in the authorized bounded comparison; original full-default failure remains unresolved','baselineSource441Unchanged':True,'candidateSource443Protected440Unchanged':True,'bothCompiled69Unchanged':True,'priorImmutableEvidence':prior,'node24Version':pre['node24Version'],'node24BinarySha256':pre['node24BinarySha256'],'exactArgv':pre['exactArgv'],'cohortConcurrency':4,'repetitionsPerCohort':4,'selected12PerCohort':True,'onlyEightAuthorizedInvocations':True,'allRootsNaturallyClosed':True,'noRetrySignalSourceFixtureTimeoutAssertionChange':True,'cohorts':complete,'runs':runs,'caseDurations':timings,'archivedPublicBackendPairs':archiveCount,'archivedNaturalCloseCommandReceipts':commandCount,'firstActualComparisonFailure':'none','causeQualification':'All green comparisons cannot establish the original root cause. Whole-case durations are not preparation or milestone-stage timings; no failed original owner traces exist to compare. One ordered cohort per Source cannot attribute timing differences to the new boundary.','missingOriginalTraceQualification':'Original default lacked HOST_EVIDENCE_DIR; missing removed public fault trees are not reconstructed. All comparison archives are fresh.','noNativeOperations':True}
put(d/'comparison-result.json',result)
shortNames=['Metadata cancellation','H06.03 CLI beforeCommit','H05.01 MCP durable cancel'];table=[]
for title,name in zip(shortNames,pre['selectedFullNames']):
    base=timings['baseline'][name];candidate=timings['candidate'][name];table.append('| '+title+' | '+format(base['medianMs'],'.3f')+' / '+format(base['maxMs'],'.3f')+' | '+format(candidate['medianMs'],'.3f')+' / '+format(candidate['maxMs'],'.3f')+' |')
report='''# Bounded comparative diagnosis

The accepted baseline (Source441) and frozen candidate 4fa9cc99 (Source443) each ran exactly four concurrent Node24.0.0 repetitions of the same anchored three-case invocation. Baseline roots all closed before candidate roots started. Both cohorts passed 12/12 selected cases; all eight command roots closed naturally with exit0.

| Whole-case time, ms | Baseline median / max | Candidate median / max |
| --- | --- | --- |
'''+ '\n'.join(table)+'''

Sixteen fresh public/backend archive pairs retain complete calls, milestones and 48 natural-close command receipts. Every H06 trace contains one touch and the beforeCommit finalization fault; every H05 trace reaches backend:snapshot-ui:1 with no touch. No forbidden-network milestone or signaled command child was observed.

Baseline Source441, candidate Source443/protected440 and both compiled69 vectors stayed unchanged. Prior 481+79 immutable files and both evidence seals rehashed unchanged. Exact Node/options, the three test files, test/fixture/harness bytes, original timeouts/assertions, concurrency and minimal environment strategy were preserved. Different checkout and private archive paths are recorded per run. No further invocation, default retry or Source repair occurred.

No failure was reproduced. Candidate whole-case medians were higher in this one ordered comparison; preparation and milestone-stage costs were not separately measured. This result cannot establish original causation or prove that the new boundary causes a delay. The original failed Node24 default remains authoritative. Its removed raw public fault trees lacked HOST_EVIDENCE_DIR and cannot be reconstructed; the retained archives here are fresh comparison evidence.

Author is idle pending Root's next decision.
'''
(d/'comparison-report.md').open('x').write(report)
files={};d.chmod(0o700)
for path in sorted(d.rglob('*')):
    info=path.lstat();assert not stat.S_ISLNK(info.st_mode)
    if path.is_dir():path.chmod(0o700);continue
    assert stat.S_ISREG(info.st_mode);mode=oct(stat.S_IMODE(info.st_mode));path.chmod(0o600);files[str(path.relative_to(d))]={'sha256':sha(path),'bytes':path.stat().st_size,'initialCopiedOrCreatedMode':mode,'sealedMode':'0600'}
put(d/'evidence-manifest.json',{'root':str(d),'files':files,'selfExclusion':'evidence-manifest.json SHA256 sent to Root','otherExclusions':[],'files600Directories700':True,'archivedBytesUnchangedByPrivacyModes':True,'previous481Plus79ImmutableFilesMatch':True,'comparisonVerdict':'No reproduction, original full-default FAIL remains'})
print(json.dumps({'cohortCounts':{cohort:complete[cohort]['aggregateCounts'] for cohort in complete},'resultSha256':sha(d/'comparison-result.json'),'reportSha256':sha(d/'comparison-report.md'),'manifestSha256':sha(d/'evidence-manifest.json'),'files':len(files),'publicBackendArchivePairs':archiveCount,'commandReceipts':commandCount,'priorEvidenceUnchanged':True},indent=2))
