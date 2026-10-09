from pathlib import Path
import datetime,fcntl,hashlib,json,os,re,subprocess
os.umask(0o077)
author=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime');integration=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic');r=author/'.scratch/installed-legacy-volume-runtime';d=r/'diagnostics/full-suite-node24';sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n');now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
c=json.loads((r/'candidate-source.json').read_text());context=integration/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/cryptex-implementation-review/candidate-cli-context.json';assert sha(context)=='0cc9d919d408805272d4e57b1efc62d41a46559ee9bc921f8e2b5325dd3ffa75';b=json.loads(context.read_text())
lock=(r/'validation.lock').open('a');fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
prior={}
def auditPrior():
    result={}
    for file,parent,key in [('final-evidence-manifest.json',r,'immutableEvidenceFiles'),('diagnostics/isolated-node24/evidence-manifest.json',r/'diagnostics/isolated-node24','files'),('diagnostics/parallel-three-cases/evidence-manifest.json',r/'diagnostics/parallel-three-cases','files')]:
        m=json.loads((r/file).read_text());assert all(sha(parent/p)==info['sha256'] for p,info in m[key].items());result[file]={'sha256':sha(r/file),'files':len(m[key])}
    assert result['final-evidence-manifest.json']['sha256']=='8ff10df055cce4adbcdb7bc19dadd18211994b39d7b530eafbeb1cfd78a371b4'
    assert result['diagnostics/isolated-node24/evidence-manifest.json']['sha256']=='d5789c884ec8c9c5d37ad569d01b1502a6a6e3c8ae4c16244f6f15f6048f882a'
    assert result['diagnostics/parallel-three-cases/evidence-manifest.json']['sha256']=='b36f7102b4920a7ebc1171e9e11928d4880cf9aab6c85ca00dca7b183c98e0a8'
    return result
def maps(cwd,source):return {p:sha(cwd/p) for p in source},{str(p.relative_to(cwd)):sha(p) for p in sorted((cwd/'dist').rglob('*.js'))}
prior=auditPrior();baselineSource,baselineCompiled=maps(integration,b['source441']);candidateSource,candidateCompiled=maps(author,c['source443']);assert baselineSource==b['source441'] and baselineCompiled==b['compiled69'] and candidateSource==c['source443'] and candidateCompiled==c['compiled69']
publicPaths=['tests/observed-artifact.test.ts','tests/observed-crash.test.ts','tests/observed-public-races.test.ts','tests/fixtures/observed-cli-server.ts','tests/fixtures/observed-allocation-backend.ts','tests/fixtures/observed-host/owner.ts','tests/fixtures/observed-host/harness.ts'];assert all(sha(author/p)==sha(integration/p)==b['source441'][p] for p in publicPaths)
node='/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node';assert sha(node)=='f28f6fdb2b24cdfc3785f4f8b46fa7b392b0ec5892b075b434049c7d05cfc956';argv=[node,'/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check']
for name in ['npm-empty-userconfig','npm-empty-globalconfig']:(d/name).open('x').close()
(d/'npm-cache').mkdir(mode=0o700)
common={'PATH':str(Path(node).parent)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':'/Users/hugues_mini','LANG':'C','LC_ALL':'C','NPM_CONFIG_USERCONFIG':str(d/'npm-empty-userconfig'),'NPM_CONFIG_GLOBALCONFIG':str(d/'npm-empty-globalconfig'),'NPM_CONFIG_CACHE':str(d/'npm-cache')}
versionDirectory=d/'runtime-check';versionDirectory.mkdir(mode=0o700);versionStarted=now()
with (versionDirectory/'stdout.txt').open('xb') as out,(versionDirectory/'stderr.txt').open('xb') as err:
    child=subprocess.Popen([node,'--version'],cwd=author,env=common,stdout=out,stderr=err,stdin=subprocess.DEVNULL,start_new_session=True,umask=0o022);code=child.wait()
versionClosed=now();assert code==0 and (versionDirectory/'stdout.txt').read_text().strip()=='v24.0.0';put(versionDirectory/'command.json',{'argv':[node,'--version'],'cwd':str(author),'envNames':sorted(common),'childPid':child.pid,'childProcessGroup':child.pid,'startedAtUtc':versionStarted,'actualChildCloseUtc':versionClosed,'exitCode':code,'stdoutSha256':sha(versionDirectory/'stdout.txt'),'stderrSha256':sha(versionDirectory/'stderr.txt'),'nodeBinarySha256':sha(node)})
put(d/'preflight.json',{'atUtc':now(),'baselineContextPath':str(context),'baselineContextSha256':sha(context),'priorImmutableEvidence':prior,'baselineSource441':baselineSource,'candidateSource443':candidateSource,'baselineCompiled69':baselineCompiled,'candidateCompiled69':candidateCompiled,'protectedPublicInputHashes':{p:sha(author/p) for p in publicPaths},'inheritedHermeticMappingAndProcessProof':'Prior pure-mapping, fake source/runner/window, owner network guards and sealed isolated/comparative prechecks match unchanged Source. New legacy fixture pure isolation cases passed before public/default dispatch. No native metadata process is composed by those fixtures.','isolationConflict':None,'freshNodeVersionReceiptSha256':sha(versionDirectory/'command.json'),'node24Version':'v24.0.0','exactFullCheckArgv':argv,'commonEnvironmentNames':sorted(common),'unmodifiedPackageCheck':True,'cohortOrder':['baseline','candidate'],'SourceNoRepair':True,'candidateSuiteAdds199OwnedCasesToBaseline1999':True,'archiveSymlinkPolicy':'lstat/readlink only; no follow or chmod of runtime-generated symlinks'})
receipts={}
for cohort,cwd,sourceExpected,compiledExpected in [('baseline',integration,b['source441'],b['compiled69']),('candidate',author,c['source443'],c['compiled69'])]:
    beforeSource,beforeCompiled=maps(cwd,sourceExpected);assert beforeSource==sourceExpected and beforeCompiled==compiledExpected;assert auditPrior()==prior
    run=d/cohort;run.mkdir(mode=0o700);host=run/'host-evidence';host.mkdir(mode=0o700);env={**common,'HOST_EVIDENCE_DIR':str(host)};head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=cwd,text=True).strip()
    job={'cohort':cohort,'argv':argv,'cwd':str(cwd),'checkoutHeadBefore':head,'env':env,'envNames':sorted(env),'removedInheritedEnvironmentNames':sorted(set(os.environ)-set(env)),'sourceBefore':beforeSource,'compiled69Before':beforeCompiled,'evidenceUmask':'077','commandChildUmask':'022','diagnosticPurpose':'one full-suite comparison invocation, original failed default preserved','noTestFlagsOrTimeoutOrConcurrencyChanges':True};put(run/'job.json',job)
    with (run/'stdout.txt').open('xb') as out,(run/'stderr.txt').open('xb') as err:
        started=now();child=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True,umask=0o022);put(run/'started.json',{'startedAtUtc':started,'childPid':child.pid,'childProcessGroup':child.pid,'argv':argv,'cwd':str(cwd),'cohort':cohort});print('Started '+cohort+' exact full Node24 diagnostic check.',flush=True);code=child.wait();closed=now()
    sourceAfter,compiledAfter=maps(cwd,sourceExpected);raw=(run/'stdout.txt').read_text();counts={k:int(v) for k,v in re.findall(r'^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$',raw,re.M)};sourceMatch=sourceAfter==sourceExpected;compiledMatch=compiledAfter==compiledExpected
    receipt={**job,'startedAtUtc':started,'actualChildCloseUtc':closed,'childPid':child.pid,'childProcessGroup':child.pid,'exitCode':code,'counts':counts,'sourceAfter':sourceAfter,'compiled69After':compiledAfter,'SourcePreserved':sourceMatch,'compiledMatchesFrozenVector':compiledMatch,'defaultBuildReached':'> tsc\n' in raw,'noAuthorSignalsOrRetries':True}
    for label in ['stdout','stderr']:receipt[label+'Sha256']=sha(run/(label+'.txt'));receipt[label+'Bytes']=(run/(label+'.txt')).stat().st_size
    put(run/'command.json',receipt);receipts[cohort]={'receiptSha256':sha(run/'command.json'),'exitCode':code,'counts':counts,'startedAtUtc':started,'actualCloseUtc':closed,'SourcePreserved':sourceMatch,'compiledMatchesFrozenVector':compiledMatch,'defaultBuildReached':receipt['defaultBuildReached']};print(json.dumps({'cohort':cohort,**receipts[cohort]}),flush=True)
    assert sourceMatch and compiledMatch and auditPrior()==prior
    archive=run/'compiled-after';archive.mkdir(mode=0o700)
    for path,expected in compiledAfter.items():
        assert sha(cwd/path)==expected;target=archive/path;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.open('xb').write((cwd/path).read_bytes())
    put(run/'compiled-after-manifest.json',{'compiled69':compiledAfter,'builtByThisCheck':receipt['defaultBuildReached'],'provenance':'current bytes after recorded full diagnostic close; if build not reached, inherited prior compiled vector'})
put(d/'full-cohorts-complete.json',receipts);print('Both granted full diagnostic invocations actually closed; no further execution.',flush=True)
