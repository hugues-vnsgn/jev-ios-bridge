from pathlib import Path
import collections,datetime,hashlib,json,os,re,stat
os.umask(0o077)
author=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime');r=author/'.scratch/installed-legacy-volume-runtime';d=r/'diagnostics/full-suite-node24';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
pre=json.loads((d/'preflight.json').read_text());complete=json.loads((d/'full-cohorts-complete.json').read_text());prior={}
def sameOrNew(p,value):
    data=json.dumps(value,indent=2)+'\n'
    if p.exists():assert p.read_text()==data
    else:p.open('x').write(data)
for file,parent,key in [('final-evidence-manifest.json',r,'immutableEvidenceFiles'),('diagnostics/isolated-node24/evidence-manifest.json',r/'diagnostics/isolated-node24','files'),('diagnostics/parallel-three-cases/evidence-manifest.json',r/'diagnostics/parallel-three-cases','files')]:
    m=json.loads((r/file).read_text());assert all(sha(parent/p)==info['sha256'] for p,info in m[key].items());assert sha(r/file)==pre['priorImmutableEvidence'][file]['sha256'];prior[file]={'sha256':sha(r/file),'immutableFilesRehashed':len(m[key])}
def regular(p):
    try:return stat.S_ISREG(p.lstat().st_mode)
    except FileNotFoundError:return False
def plainDirectory(p):
    try:return stat.S_ISDIR(p.lstat().st_mode)
    except FileNotFoundError:return False
def jsonLines(p):
    if not regular(p):return None,[]
    raw=p.read_text();records=[];errors=[]
    for i,line in enumerate(raw.splitlines()):
        try:records.append(json.loads(line))
        except Exception as e:errors.append({'line':i+1,'errorType':type(e).__name__})
    return {'sha256':sha(p),'records':len(records),'completeTrailingNewline':not raw or raw.endswith('\n'),'parseErrors':errors},records
results={};caseEvidence={};previous=None
for cohort in ['baseline','candidate']:
    run=d/cohort;rc=json.loads((run/'command.json').read_text());cwd=Path(rc['cwd']);expectedSource=pre['baselineSource441' if cohort=='baseline' else 'candidateSource443'];expectedCompiled=pre['baselineCompiled69' if cohort=='baseline' else 'candidateCompiled69']
    assert rc['argv']==pre['exactFullCheckArgv'];assert rc['sourceBefore']==rc['sourceAfter']==expectedSource and rc['compiled69Before']==rc['compiled69After']==expectedCompiled
    assert {p:sha(cwd/p) for p in expectedSource}==expectedSource;assert {str(p.relative_to(cwd)):sha(p) for p in sorted((cwd/'dist').rglob('*.js'))}==expectedCompiled
    for label in ['stdout','stderr']:assert sha(run/(label+'.txt'))==rc[label+'Sha256']
    if previous:assert rc['startedAtUtc']>previous
    previous=rc['actualChildCloseUtc'];raw=(run/'stdout.txt').read_text();lines=raw.splitlines();buildLines=[{'line':i+1,'text':x} for i,x in enumerate(lines) if re.match(r'^> jev-ios-bridge@\S+ build$',x) or x=='> rm -rf dist && tsc -p tsconfig.build.json'];buildReached=any(x['text']=='> rm -rf dist && tsc -p tsconfig.build.json' for x in buildLines)
    sameOrNew(run/'derived-build-proof.json',{'rawStdoutSha256':sha(run/'stdout.txt'),'actualRawBuildLines':buildLines,'buildReached':buildReached,'originalReceiptBuildField':rc['defaultBuildReached'],'qualification':'Original matcher assumed plain > tsc; actual unchanged build is rm -rf dist && tsc -p tsconfig.build.json. Original receipt and compiled-after manifest fields remain immutable; this raw-line derivation supplies the correction.'})
    failing=raw[raw.index('✖ failing tests:'):] if '✖ failing tests:' in raw else ''
    block=run/'failure-blocks.txt'
    if block.exists():assert block.read_text()==failing
    else:block.open('x').write(failing)
    failNames=[]
    for line in failing.splitlines():
        if line.startswith('✖ ') and line!='✖ failing tests:':failNames.append(re.sub(r' \([^()]*ms\)$','',line[2:]))
    archives={};focus={};commandsTotal=0
    for archive in sorted((run/'host-evidence').iterdir()):
        assert stat.S_ISDIR(archive.lstat().st_mode);public=archive/'public';backend=archive/'backend';publicDir=plainDirectory(public);backendDir=plainDirectory(backend);assert publicDir or backendDir;context=public/'test-context.json' if publicDir else backend/'test-context.json'
        if not regular(context):context=backend/'test-context.json'
        if regular(context):name=json.loads(context.read_text())['name'];contextKind='test-context.json'
        else:
            context=public/'context.json';assert regular(context);name=None;contextKind='unlabelled early-prerequisite context.json; archive label retained, no test name inferred'
        traces={};commands={};calls=[];milestones=[]
        if publicDir:
            assert stat.S_ISDIR(public.lstat().st_mode)
            for trace in sorted(public.glob('*.jsonl')):
                info,records=jsonLines(trace)
                if info:traces['public/'+trace.name]=info
                if trace.name=='calls.jsonl':calls=records
                if trace.name=='milestones.jsonl':milestones=records
            for command in sorted(public.glob('command-*.json')):
                assert regular(command);value=json.loads(command.read_text());commands[command.name]={'sha256':sha(command),'transport':value['transport'],'command':value['command'],'pid':value['pid'],'code':value['code'],'signal':value['signal']};commandsTotal+=1
        if backendDir:
            assert stat.S_ISDIR(backend.lstat().st_mode)
            for trace in sorted(backend.glob('*.jsonl')):
                info,_=jsonLines(trace)
                if info:traces['backend/'+trace.name]=info
        evidence={'case':name,'archiveLabel':archive.name,'contextKind':contextKind,'contextSha256':sha(context),'publicAndBackendPair':publicDir and backendDir,'traces':traces,'commandReceipts':commands,'callCounts':dict(collections.Counter(x for x in calls if isinstance(x,str))),'snapshotUI1Reached':any(isinstance(x,dict) and x.get('key')=='backend:snapshot-ui:1' for x in milestones),'beforeFinalizeFaultReached':any(isinstance(x,dict) and x.get('key')=='beforeCommit:finalize:1' for x in milestones),'forbiddenNetworkMilestones':[x for x in milestones if isinstance(x,dict) and str(x.get('key','')).startswith('forbidden:network:')],'capturedByUnchangedHarnessBeforeCleanup':True};archives[archive.name]=evidence
        if name in failNames or name in ['H06.03 genuine cli beforeCommit finalization response fault preserves authority','H05.01 mcp durable external preparation cancel at backend:snapshot-ui:1 fences successors']:focus[archive.name]=evidence
    count=rc['counts'];results[cohort]={'receiptSha256':sha(run/'command.json'),'exactArgv':rc['argv'],'cwd':rc['cwd'],'checkoutHeadBefore':rc['checkoutHeadBefore'],'envNames':rc['envNames'],'counts':count,'exitCode':rc['exitCode'],'startedAtUtc':rc['startedAtUtc'],'actualChildCloseUtc':rc['actualChildCloseUtc'],'childPid':rc['childPid'],'childProcessGroup':rc['childProcessGroup'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'buildReachedRawDerived':buildReached,'buildProofSha256':sha(run/'derived-build-proof.json'),'originalNarrowBuildMarkerQualification':True,'SourceAndCompiledUnchanged':True,'failureNames':failNames,'failureBlocksSha256':sha(run/'failure-blocks.txt'),'hostArchiveDirectories':len(archives),'publicBackendPairs':sum(x['publicAndBackendPair'] for x in archives.values()),'hostCommandReceipts':commandsTotal,'hostArchiveProofs':archives};caseEvidence[cohort]=focus
    assert count['tests']==(1999 if cohort=='baseline' else 2198)
result={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diagnosticOnly':True,'priorImmutableEvidence':prior,'cohorts':results,'focusedFailureAndOriginalCaseEvidence':caseEvidence,'freshNode24Version':'v24.0.0','originalDefaultFailureRemainsPreserved':True,'noAuthorSignalsRetriesSourceFixtureTimeoutOrConcurrencyChanges':True,'candidateAdds199OwnedCases':True,'causeQualification':'Only retained actual failures/traces establish observations. Green runs do not establish original causation; original default omitted HOST_EVIDENCE_DIR and removed public traces cannot be reconstructed.','runtimeGeneratedSymlinks':'inventory records link target with lstat/readlink, never follows links','nativeAccountDeviceSDKEnvOperationsByAuthor':False}
put(d/'full-comparison-result.json',result)
table=[]
for cohort in ['baseline','candidate']:
    x=results[cohort];n=x['counts'];table.append('| '+cohort+' | '+str(n['tests'])+' / '+str(n['pass'])+' / '+str(n['fail'])+' / '+str(n['cancelled'])+' | '+str(x['exitCode'])+' | '+x['actualChildCloseUtc']+' |')
report='''# Full-suite Node 24 diagnostic comparison

Each cohort invoked the exact unmodified official npm-cli run check once, serially, with fresh private HOST_EVIDENCE_DIR. Source441 baseline and frozen 4fa9cc99 Source443 candidate stayed unchanged, as did both compiled69 vectors. The candidate suite includes 199 additional owned cases; both command argv and environment strategy were unchanged.

| Cohort | Total / pass / fail / cancelled | Exit | Actual child close UTC |
| --- | --- | --- | --- |
'''+ '\n'.join(table)+'''

Complete raw output, actual command/process receipts and unchanged-harness public/backend archives are retained. full-comparison-result.json records test names where supplied, labels eight early-prerequisite context.json layouts without inventing test names, and hashes calls, milestones, command results and applicable request/wait traces. It highlights any failed cases and the two original public failures. failure-blocks.txt retains exact final error blocks per cohort. The original packaging assertion and script are preserved.

The original narrow build matcher wrongly expected plain > tsc. Original receipts and compiled-after metadata remain untouched. Fresh derived-build-proof.json files bind the actual package build header and rm -rf dist && tsc -p tsconfig.build.json line to raw stdout hashes, correcting that bookkeeping assumption.

Earlier 481+79+608 immutable files and their seals rehashed unchanged. Runtime-generated archive symlinks are recorded with lstat/readlink and never followed or chmodded. Fake harness child signals prescribed by unchanged crash tests are retained; the author sent no discretionary process signals.

These are diagnostics, not a replacement or relabelling of the original failed default. No new root cause follows solely from a green comparison. Missing original public fault traces remain unreconstructed. Any current failures and their available milestone/request/deadline/call evidence are recorded without speculative repair. Author is idle pending Root's decision.
'''
(d/'full-comparison-report.md').open('x').write(report)
files={};links={};stack=[d];d.chmod(0o700)
while stack:
    parent=stack.pop()
    for entry in sorted(os.scandir(parent),key=lambda x:x.name):
        path=Path(entry.path);info=entry.stat(follow_symlinks=False);rel=str(path.relative_to(d))
        if stat.S_ISLNK(info.st_mode):
            target=os.readlink(path);links[rel]={'target':target,'targetTextSha256':hashlib.sha256(os.fsencode(target)).hexdigest(),'recordedMode':oct(stat.S_IMODE(info.st_mode)),'followed':False};continue
        if stat.S_ISDIR(info.st_mode):path.chmod(0o700);stack.append(path);continue
        assert stat.S_ISREG(info.st_mode) and path.name!='.env';mode=oct(stat.S_IMODE(info.st_mode));path.chmod(0o600);files[rel]={'sha256':sha(path),'bytes':path.stat().st_size,'initialCopiedOrCreatedMode':mode,'sealedMode':'0600'}
put(d/'evidence-manifest.json',{'root':str(d),'files':files,'symlinksRecordedNotFollowed':links,'selfExclusion':'evidence-manifest.json SHA256 sent to Root','otherExclusions':[],'regularFiles600Directories700':True,'symlinkTargetsNeverReadOrChmodded':True,'priorImmutableEvidenceUnchanged':True})
print(json.dumps({'cohorts':{k:{p:v[p] for p in ['counts','exitCode','actualChildCloseUtc','buildReachedRawDerived','hostArchiveDirectories','publicBackendPairs','hostCommandReceipts','failureNames']} for k,v in results.items()},'resultSha256':sha(d/'full-comparison-result.json'),'reportSha256':sha(d/'full-comparison-report.md'),'manifestSha256':sha(d/'evidence-manifest.json'),'regularFiles':len(files),'symlinksRecordedWithoutFollowing':len(links),'priorEvidenceUnchanged':True},indent=2))
