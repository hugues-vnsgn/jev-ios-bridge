from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime,fcntl,hashlib,json,os,re,subprocess
os.umask(0o077)
author=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
integration=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
r=author/'.scratch/installed-legacy-volume-runtime';d=r/'diagnostics/parallel-three-cases';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n');now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((r/'baseline.json').read_text());c=json.loads((r/'candidate-source.json').read_text());isolated=json.loads((r/'diagnostics/isolated-node24/command.json').read_text())
argv=isolated['argv'];names=isolated['selectedFullNames'];assert len(names)==3 and argv[-3:]==['tests/observed-artifact.test.ts','tests/observed-crash.test.ts','tests/observed-public-races.test.ts']
lock=(r/'validation.lock').open('a');fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
prior={}
for file,parent,key in [('final-evidence-manifest.json',r,'immutableEvidenceFiles'),('diagnostics/isolated-node24/evidence-manifest.json',r/'diagnostics/isolated-node24','files')]:
    manifest=json.loads((r/file).read_text());assert all(sha(parent/p)==info['sha256'] for p,info in manifest[key].items());prior[file]={'sha256':sha(r/file),'files':len(manifest[key])}
assert prior['final-evidence-manifest.json']['sha256']=='8ff10df055cce4adbcdb7bc19dadd18211994b39d7b530eafbeb1cfd78a371b4'
assert prior['diagnostics/isolated-node24/evidence-manifest.json']['sha256']=='d5789c884ec8c9c5d37ad569d01b1502a6a6e3c8ae4c16244f6f15f6048f882a'
protectedPaths=['tests/observed-artifact.test.ts','tests/observed-crash.test.ts','tests/observed-public-races.test.ts','tests/fixtures/observed-cli-server.ts','tests/fixtures/observed-allocation-backend.ts','tests/fixtures/observed-host/owner.ts','tests/fixtures/observed-host/harness.ts']
assert all(sha(author/p)==sha(integration/p)==b['source441'][p] for p in protectedPaths)
versionRaw=(r/'runtime-node24/stdout.txt').read_text().strip();assert versionRaw=='v24.0.0'
tsx={str(cwd):{'version':json.loads((cwd/'node_modules/tsx/package.json').read_text())['version'],'packageSha256':sha(cwd/'node_modules/tsx/package.json')} for cwd in [integration,author]};assert len({json.dumps(v,sort_keys=True) for v in tsx.values()})==1
def maps(cwd,sourceExpected,compiledExpected):
    source={p:sha(cwd/p) for p in sourceExpected};compiled={str(p.relative_to(cwd)):sha(p) for p in sorted((cwd/'dist').rglob('*.js'))};assert source==sourceExpected and compiled==compiledExpected;return source,compiled
for cwd,s,k in [(integration,b['source441'],b['compiled69']),(author,c['source443'],c['compiled69'])]:maps(cwd,s,k)
put(d/'preflight.json',{'atUtc':now(),'previousEvidence':prior,'selectedFullNames':names,'exactArgv':argv,'node24Version':versionRaw,'versionEvidence':'../../runtime-node24/stdout.txt, previously executed exact binary','node24BinarySha256':sha(argv[0]),'tsx':tsx,'protectedHermeticPathHashes':{p:sha(author/p) for p in protectedPaths},'inheritedIsolationProof':'fixed installed/own-temp mapper and fake process/runner/window, forbidden network hooks, prior isolated precheck and pure mapping receipts unchanged','isolationConflict':None,'baselineSource441':b['source441'],'candidateSource443':c['source443'],'baselineCompiled69':b['compiled69'],'candidateCompiled69':c['compiled69'],'cohortConcurrency':4,'repetitionsPerCohort':4,'selectedCasesPerCohort':12,'originalTimeoutsAndAssertionsUnchanged':True,'hypotheses':['fixed fixture/test deadline exhaustion under contention also on baseline','candidate private boundary adds preparation cost under equal execution','fixture trace/result race visible in retained owner/milestone/call records']})
allResults={}
for cohort,cwd,sourceExpected,compiledExpected in [('baseline',integration,b['source441'],b['compiled69']),('candidate',author,c['source443'],c['compiled69'])]:
    source,compiled=maps(cwd,sourceExpected,compiledExpected);head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=cwd,text=True).strip();cohortDir=d/cohort;cohortDir.mkdir(mode=0o700);children=[]
    for repetition in range(1,5):
        beforeSource,beforeCompiled=maps(cwd,sourceExpected,compiledExpected);run=cohortDir/('run-'+str(repetition));run.mkdir(mode=0o700);host=run/'host-evidence';host.mkdir(mode=0o700)
        env={'PATH':str(Path(argv[0]).parent)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':'/Users/hugues_mini','LANG':'C','LC_ALL':'C','HOST_EVIDENCE_DIR':str(host)}
        job={'cohort':cohort,'repetition':repetition,'argv':argv,'cwd':str(cwd),'checkoutHead':head,'env':env,'envNames':sorted(env),'removedInheritedEnvironmentNames':sorted(set(os.environ)-set(env)),'selectedFullNames':names,'sourceBefore':beforeSource,'compiled69Before':beforeCompiled,'evidenceUmask':'077','childUmask':'022','onlySelectedTests':True,'noSourceOrFixtureOrAssertionChange':True};put(run/'job.json',job)
        out=(run/'stdout.txt').open('xb');err=(run/'stderr.txt').open('xb');started=now();child=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True,umask=0o022)
        put(run/'started.json',{'startedAtUtc':started,'childPid':child.pid,'childProcessGroup':child.pid,'argv':argv,'cwd':str(cwd),'cohort':cohort,'repetition':repetition});children.append((run,job,child,out,err,started))
    print('Started '+cohort+' cohort: exactly four concurrent selected-case invocations.',flush=True)
    def collect(item):
        run,job,child,out,err,started=item;code=child.wait();closed=now();out.close();err.close();afterSource,afterCompiled=maps(cwd,sourceExpected,compiledExpected)
        raw=(run/'stdout.txt').read_text();counts={k:int(v) for k,v in re.findall(r'^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$',raw,re.M)}
        rc={**job,'startedAtUtc':started,'actualChildCloseUtc':closed,'childPid':child.pid,'childProcessGroup':child.pid,'exitCode':code,'counts':counts,'sourceAfter':afterSource,'compiled69After':afterCompiled,'sourceAndCompiledUnchanged':True,'noSignalsOrRetries':True}
        for label in ['stdout','stderr']:rc[label+'Sha256']=sha(run/(label+'.txt'));rc[label+'Bytes']=(run/(label+'.txt')).stat().st_size
        put(run/'command.json',rc);return {'run':run.name,'exitCode':code,'counts':counts,'startedAtUtc':started,'actualCloseUtc':closed,'commandSha256':sha(run/'command.json'),'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256']}
    with ThreadPoolExecutor(max_workers=4) as executor:results=list(executor.map(collect,children))
    sourceAfter,compiledAfter=maps(cwd,sourceExpected,compiledExpected);assert all(x['counts'].get('tests')==3 for x in results)
    firstClose=min(x['actualCloseUtc'] for x in results);lastStart=max(x['startedAtUtc'] for x in results);assert lastStart<firstClose
    summary={'cohort':cohort,'checkoutHead':head,'cwd':str(cwd),'results':results,'fourRootsActuallyOverlapped':True,'allFourActuallyClosedBeforeNextCohort':True,'aggregateCounts':{k:sum(x['counts'].get(k,0) for x in results) for k in ['tests','pass','fail','cancelled','skipped','todo']},'sourceAfter':sourceAfter,'compiled69After':compiledAfter};put(cohortDir/'cohort-summary.json',summary);allResults[cohort]=summary
    print(json.dumps({'cohort':cohort,'aggregateCounts':summary['aggregateCounts'],'exits':[x['exitCode'] for x in results],'allActuallyClosed':True,'lastCloseUtc':max(x['actualCloseUtc'] for x in results)}),flush=True)
put(d/'cohorts-complete.json',allResults)
print('Both granted cohorts completed; no further invocation, retry or signal.',flush=True)
