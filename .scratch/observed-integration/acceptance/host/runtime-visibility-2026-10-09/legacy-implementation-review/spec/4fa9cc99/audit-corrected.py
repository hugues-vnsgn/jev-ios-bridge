from pathlib import Path
import os,json,hashlib,stat,subprocess,re,collections,datetime
os.umask(0o077)
I=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
A=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
R=I/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
O=R/'legacy-implementation-review/spec/4fa9cc99'
E=A/'.scratch/installed-legacy-volume-runtime'
B='720cb380d07102d72b20a6a4f5f7787a0ab88f2b'
C='4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d'
inputs={}; checks=[]; gates=[]
def check(label,ok,detail=None):
 checks.append({'check':label,'pass':bool(ok),**({'detail':detail} if detail is not None else {})})
def read(p):
 p=Path(p)
 for q in [p,*p.parents]:
  if q.is_symlink():raise RuntimeError('Refuse symlink path '+str(q))
 if not stat.S_ISREG(p.lstat().st_mode):raise RuntimeError('Refuse nonregular '+str(p))
 b=p.read_bytes(); inputs[str(p)]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'mode':oct(stat.S_IMODE(p.lstat().st_mode))};return b
def sha(p):read(p);return inputs[str(p)]['sha256']
def j(p):return json.loads(read(p))
def out(name,x):
 with (O/name).open('x') as f:json.dump(x,f,indent=2,sort_keys=True);f.write('\n')
def git(*args):return subprocess.check_output(['git',*args],cwd=A)
def vector(root,v,label):
 for n,h in v.items():check(label+':'+n,sha(root/n)==h)
def blobs(commit,v,label):
 names=list(v);data=git('cat-file','--batch') if not names else subprocess.check_output(['git','cat-file','--batch'],cwd=A,input=''.join(commit+':'+n+'\n' for n in names).encode())
 off=0
 for n in names:
  end=data.index(b'\n',off);hdr=data[off:end].split();sz=int(hdr[-1]);off=end+1;b=data[off:off+sz];off+=sz+1;check(label+':'+n,hashlib.sha256(b).hexdigest()==v[n])
def counts(raw):
 s=raw.decode('utf8');ans={}
 for k in ['tests','suites','pass','fail','cancelled','skipped','todo']:
  hits=re.findall(r'^ℹ '+k+r' (\d+)\s*$',s,re.M)
  if hits:ans[k]=int(hits[-1])
 return ans
ctx=j(R/'legacy-implementation-review/candidate-cli-context.json');base=j(R/'legacy-implementation-review/baseline-oracle.json')
check('context supplied hash',sha(R/'legacy-implementation-review/candidate-cli-context.json')=='865bb3b87a6d5d987d8a055713845e5ae1bde5bb22eef4a81a2b643975437737')
check('candidate HEAD',git('rev-parse','HEAD').decode().strip()==C)
check('base resolve',git('rev-parse',B).decode().strip()==B)
check('candidate parent',git('rev-parse',C+'^').decode().strip()==B)
check('one commit',len(git('rev-list',B+'..'+C).splitlines())==1)
owned=set(ctx['owned3']);changed=set(git('diff','--name-only',B+'...'+C).decode().splitlines())
check('exact owned3 delta',changed==owned,sorted(changed))
check('source names443',len(ctx['source443'])==443 and set(ctx['source443'])==set(base['expectedSourceNames443']))
check('protected count440',len(ctx['protected440'])==440 and ctx['protected440']==base['protected440'])
vector(A,ctx['source443'],'current Source');blobs(C,ctx['source443'],'candidate Git Source');blobs(B,base['baselineSource441'],'baseline Git Source')
check('all protected current and committed untouched',all(ctx['source443'][n]==h for n,h in base['protected440'].items()))
vector(A,ctx['compiled69'],'current compiled')
check('compiled only owned output differs',set(n for n,h in ctx['compiled69'].items() if h!=base['baselineCompiled69'][n])=={'dist/observed/allocation-config.js'})
for name,key in [('legacy-volume-policy-proposal-v3.md','policySha256'),('owner-legacy-mount-trust-decision.json','ownerReceiptSha256')]:check(name+' hash',sha(R/name)==ctx[key])
owner=j(R/'owner-legacy-mount-trust-decision.json');check('owner APPROVED',owner.get('status')=='APPROVED')
for k in ['candidateSourceReceipt','predefaultManifest','rootPredefaultAudit','preservationIndex']:
 check(k+' binding',sha(I/ctx[k])==ctx[k+'Sha256'])
source=j(I/ctx['candidateSourceReceipt']);check('Source receipt vectors',source['source443']==ctx['source443'] and source['compiled69']==ctx['compiled69'])
for name in ['AGENTS.md','.scratch/v1-release/map.md','docs/agents/issue-tracker.md','docs/agents/domain.md','GLOSSARY.md','package.json','.scratch/observed-action-rollout/legacy-implementation-review-brief.md']:
 read(I/name)
for p in (I/'docs/adr').glob('*.md'):read(p)
for p in (R/'legacy-implementation-review').glob('*qualification*'):read(p)
for p in (R/'legacy-implementation-review').glob('*.py'):read(p)
for name in ['legacy-volume-policy-review/spec/revision3/report.md','legacy-volume-policy-review/spec/revision3/freeze.json']:
 p=R/name
 if p.exists():read(p)
for name in ['implementation-report.md','default-failure-report.md','clause-regression-matrix.md','owned-case-matrix.json','baseline.json','predefault-audit.json','candidate-source.json']:
 read(E/name)
# Every regular file in both author seals is rehashed. No ignored operational exclusions are acceptance receipts.
for mn in ['predefault-evidence-manifest.json','final-evidence-manifest.json']:
 m=j(E/mn)
 for n,v in m['immutableEvidenceFiles'].items():
  p=E/n;check(mn+':'+n,sha(p)==v['sha256'] and inputs[str(p)]['bytes']==v['bytes'])
# Every retained Root predefault mirror byte; index has exactly 324 files including Source snapshots and seal.
pidx=j(I/ctx['preservationIndex']);check('root predefault count324',len(pidx['files'])==324)
for v in pidx['files']:
 p=R/'legacy-candidate-evidence'/v['path'];check('Root predefault:'+v['path'],sha(p)==v['sha256'] and inputs[str(p)]['bytes']==v['bytes'])
pa=j(E/'predefault-audit.json')
for archive,info in pa['historicalArchives'].items():
 for n,h in info['owned3'].items():check('historical contemporaneous:'+archive+':'+n,sha(E/archive/n)==h)
 for stage in info['matchingReceipts']:
  c=j(E/stage/'command.json');check('historical receipt:'+stage,c['owned3']==info['owned3'])
# Raw-backed receipts, including all meaningful failed and intermediate stages.
for p in sorted(E.glob('*/result.json')):
 x=j(p);d=p.parent;c=j(d/'command.json');s=read(d/'stdout.txt');e=read(d/'stderr.txt');name=d.name
 check(name+' receipt hash',sha(d/'command.json')==x['receiptSha256'])
 check(name+' raw stdout hash',hashlib.sha256(s).hexdigest()==x['stdoutSha256']==c['stdoutSha256'])
 check(name+' raw stderr hash',hashlib.sha256(e).hexdigest()==x['stderrSha256']==c['stderrSha256'])
 check(name+' raw byte counts',len(s)==c['stdoutBytes'] and len(e)==c['stderrBytes'])
 check(name+' raw counts',counts(s)==x['counts'])
 check(name+' actual close and exit',x['actualCloseRecorded'] and x['completedAtUtc']==c['completedAtUtc'] and x['exitCode']==c['exitCode'])
 check(name+' before/after Source',c['candidateSource443']==x['source443'] and x['source443Unchanged'] and x['protected440Match'])
 check(name+' protected assertions',all(x['source443'][n]==h for n,h in base['protected440'].items()))
 check(name+' environment names',set(c['env'])=={'PATH','HOME','LANG','LC_ALL','NPM_CONFIG_USERCONFIG','NPM_CONFIG_GLOBALCONFIG','NPM_CONFIG_CACHE'})
 rec={'stage':name,'argv':c['argv'],'counts':x['counts'],'exitCode':x['exitCode'],'startedAtUtc':x['startedAtUtc'],'actualChildCloseUtc':x['completedAtUtc'],'sourceMatchesCandidate':x['source443']==ctx['source443'],'compiledMatchesCandidate':x['compiled69']==ctx['compiled69'],'receiptSha256':x['receiptSha256'],'stdoutSha256':x['stdoutSha256'],'stderrSha256':x['stderrSha256']}
 gates.append(rec)
 if name in pa['serialFinalGateOrder'] or name.startswith('actual-default-'):
  check(name+' frozen source443',x['source443']==ctx['source443']);check(name+' compiled correspondence',x['compiled69']==ctx['compiled69'] if name.startswith(('build-','actual-default-')) else all(x['compiled69'][k]==ctx['compiled69'][k] for k in ctx['compiled69'] if k!='dist/observed/allocation-config.js') and x['compiled69']['dist/observed/allocation-config.js']=='88ebe6c8955db3ab3c0ae4cf921fb79e57ce7188897ce57a19abf01487a3df4e')
 if name.startswith('actual-default-'):
  check(name+' unmodified npm check',len(c['argv'])==4 and c['argv'][1:] == ['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'])
  check(name+' exact Node path',c['argv'][0]==('/opt/homebrew/Cellar/node/26.8.1/bin/node' if name.endswith('26') else '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'))
for prev,nxt in zip(pa['serialFinalGateOrder'],pa['serialFinalGateOrder'][1:]):
 check('serial final:'+prev+' before '+nxt,j(E/prev/'command.json')['completedAtUtc']<=j(E/nxt/'command.json')['startedAtUtc'])
check('initial defaults serial',j(E/'actual-default-node26/command.json')['completedAtUtc']<=j(E/'actual-default-node24/command.json')['startedAtUtc'])
# Snapshot assertion correspondence: original126 display-name occurrences survive in final704. Raw names retain repeated labels.
def names(p):
 s=read(p).decode().split('ℹ tests ')[0];return collections.Counter(re.sub(r' \([0-9.]+ms\)$','',line[2:]) for line in s.splitlines() if line.startswith(('✔ ','✖ ')))
old=names(E/'domain-red-node26/stdout.txt');final=names(E/'focused-node26/stdout.txt')
check('original126 name occurrences in focused',sum(old.values())==126 and all(final[k]>=v for k,v in old.items()))
# Diagnostic full comparison seal: hash every retained regular file. Recorded links are metadata only and never followed.
F=R/'legacy-candidate-evidence/diagnostics/full-suite-node24'
seal=j(F/'evidence-manifest.json')
check('full comparison exact author seal',sha(F/'evidence-manifest.json')=='16760bbcbd1d4df7fea62c3a15d705ff0d0aace7ddda72675878a0a0d388248e')
check('full regular12482 and recorded links10',len(seal['files'])==12482 and len(seal['symlinksRecordedNotFollowed'])==10)
for n,v in seal['files'].items():
 p=F/n;check('full sealed regular:'+n,sha(p)==v['sha256'] and inputs[str(p)]['bytes']==v['bytes'])
idx=j(R/'legacy-candidate-evidence/diagnostics/full-suite-preservation-index.json')
check('Root full preservation index SHA',sha(R/'legacy-candidate-evidence/diagnostics/full-suite-preservation-index.json')=='c2eb294502a65ac093b3ee365a03466f4aeb3795d07c749b317a6e3adca3f084')
check('Root12483 regular and10 links',len(idx['files'])==12483 and len(idx['symlinksRecordedNotRecreatedOrFollowed'])==10)
for v in idx['files']:
 p=I/v['path'];check('Root full index:'+v['path'],sha(p)==v['sha256'] and inputs[str(p)]['bytes']==v['bytes'])
for n,v in idx['symlinksRecordedNotRecreatedOrFollowed'].items():
 check('Root link not recreated:'+n,not (F/n).exists() and not (F/n).is_symlink() and v['followed'] is False)
rootAudit=j(R/'legacy-implementation-review/root-full-node24-comparison-audit.json')
check('Root full audit suppliedSHA',sha(R/'legacy-implementation-review/root-full-node24-comparison-audit.json')=='75818f9dc348c6d9dcc9da5546ec903373f990f851707c5f9be76b3f42d24296')
check('Root44 allPASS',len(rootAudit['checks'])==44 and all(v.get('pass',v.get('ok',False)) for v in rootAudit['checks']))
fc=j(F/'full-comparison-result.json');check('full comparison result suppliedSHA',sha(F/'full-comparison-result.json')=='6ce1ccfff362acac588d8af76127d5695109935e7f88d2d4a005fbd3401224e2')
check('full comparison report suppliedSHA',sha(F/'full-comparison-report.md')=='b8e056aad604a7acde36a1b675f53bcbe653b7f0e8f6a7612a8ca6f80722c94c')
read(F/'full-comparison-report.md')
pkg=j(A/'package.json')
for name,v in fc['cohorts'].items():
 d=F/name;c=j(d/'command.json');s=read(d/'stdout.txt');e=read(d/'stderr.txt');sv=base['baselineSource441'] if name=='baseline' else ctx['source443'];cv=base['baselineCompiled69'] if name=='baseline' else ctx['compiled69']
 check('full '+name+' receipt',sha(d/'command.json')==v['receiptSha256'])
 check('full '+name+' rawSHA',hashlib.sha256(s).hexdigest()==c['stdoutSha256']==v['stdoutSha256'] and hashlib.sha256(e).hexdigest()==c['stderrSha256']==v['stderrSha256'])
 check('full '+name+' rawcounts',counts(s)==c['counts']==v['counts'])
 check('full '+name+' successful actualclose',c['exitCode']==0 and c['actualChildCloseUtc']==v['actualChildCloseUtc'])
 check('full '+name+' Source/compiled vectors',c['sourceBefore']==c['sourceAfter']==sv and c['compiled69Before']==c['compiled69After']==cv)
 check('full '+name+' unmodified npm argv',c['argv']==['/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node','/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'])
 check('full '+name+' no credential/node/test environment',set(c['env'])=={'PATH','HOME','LANG','LC_ALL','NPM_CONFIG_USERCONFIG','NPM_CONFIG_GLOBALCONFIG','NPM_CONFIG_CACHE','HOST_EVIDENCE_DIR'})
 text=s.decode();check('full '+name+' exact package stage headers',all(('> '+pkg['name']+'@'+pkg['version']+' '+stage) in text for stage in ['typecheck','test','build']) and '> rm -rf dist && tsc -p tsconfig.build.json' in text)
 proof=j(d/'derived-build-proof.json');check('full '+name+' qualified build proof',sha(d/'derived-build-proof.json')==v['buildProofSha256'] and c['defaultBuildReached'] is False and v['buildReachedRawDerived'] is True)
 gates.append({'stage':'later-full-node24-'+name,'argv':c['argv'],'counts':c['counts'],'exitCode':0,'actualChildCloseUtc':c['actualChildCloseUtc'],'receiptSha256':v['receiptSha256'],'stdoutSha256':v['stdoutSha256'],'stderrSha256':v['stderrSha256'],'sourceMatchesBoundVector':True,'compiledMatchesBoundVector':True,'originalBuildMarkerFalseQualified':True})
check('later full serial actualclose',fc['cohorts']['baseline']['actualChildCloseUtc']<=fc['cohorts']['candidate']['startedAtUtc'])
check('initial Node24 fail preserved',next(v for v in gates if v['stage']=='actual-default-node24')['counts']=={'tests':2198,'suites':0,'pass':2195,'fail':2,'cancelled':1,'skipped':0,'todo':0})
# Retain exact static diff and commit list; no test/build/native code executes.
for name,data in [('candidate.diff',git('diff',B+'...'+C)),('commit-list.txt',git('log',B+'..'+C,'--format=%H %s'))]:
 check('preserved exact '+name,read(O/name)==data)
summary={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':B,'candidate':C,'scope':'Static Source and retained evidence audit only; no tests/build/native operations','checks':len(checks),'passed':sum(v['pass'] for v in checks),'failed':[v for v in checks if not v['pass']],'gates':gates,'initialNode24LowerCause':'UNRESOLVED; successful later comparison does not establish initial cause','pending':'Candidate clean installed package/plugin proofs and wrapped startup must precede integration under policy37; native compatibility/L01-L05 unverified','allChecks':checks}
out('audit-corrected.json',summary);out('input-manifest-corrected.json',{'files':inputs,'count':len(inputs),'symlinks':'Ten full archive links bound as retained manifest metadata only; never followed/recreated','gitBlobs':'Both full Source vectors independently SHA256 checked via git cat-file batch'})
print(json.dumps({k:summary[k] for k in ['checks','passed','failed']},indent=2));print('inputFiles',len(inputs))
