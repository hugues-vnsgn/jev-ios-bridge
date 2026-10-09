from pathlib import Path
import os,json,hashlib,stat,subprocess,re,datetime
os.umask(0o077)
I=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic');A=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-legacy-binding');R=I/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09';E=R/'legacy-correction-candidate-evidence';O=R/'legacy-implementation-review/spec/dcc06dc0'
B='4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d';C='dcc06dc0939d73d860cae9e03d4f1f47bacbd279';F='720cb380d07102d72b20a6a4f5f7787a0ab88f2b';inputs={};checks=[];gates=[]
def read(p):
 p=Path(p);assert not any(q.is_symlink() for q in [p,*p.parents]);assert stat.S_ISREG(p.lstat().st_mode);b=p.read_bytes();inputs[str(p)]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'mode':oct(stat.S_IMODE(p.lstat().st_mode))};return b
def sha(p):read(p);return inputs[str(p)]['sha256']
def j(p):return json.loads(read(p))
def ck(n,v):checks.append({'check':n,'pass':bool(v)})
def git(*args):return subprocess.check_output(['git',*args],cwd=A)
def counts(raw):
 ans={}
 for k in ['tests','pass','fail','cancelled','skipped','todo']:
  a=re.findall(r'^ℹ '+k+r' (\d+)\s*$',raw.decode(),re.M)
  if a:ans[k]=int(a[-1])
 return ans
def blobs(commit,v):
 ns=list(v);data=subprocess.check_output(['git','cat-file','--batch'],cwd=A,input=''.join(commit+':'+n+'\n' for n in ns).encode());off=0
 for n in ns:
  end=data.index(b'\n',off);size=int(data[off:end].split()[-1]);off=end+1;b=data[off:off+size];off+=size+1;ck('Git '+commit[:8]+':'+n,hashlib.sha256(b).hexdigest()==v[n])
pins={'candidate-source.json':'0f4dfabdfb9d8059fa6b992c9f35eeca7880f2fb354c12340b78053866ef67fb','evidence-manifest.json':'0dd519569eedfbbc5d7a4125a0d439b4bddd87fd005944cfd9be8d7593927bc0','evidence-seal.json':'a02a96e9f650a650d4898340a2a2141ee340b88ddaa25ccd87caeeb2d6bdc842','implementation-report.md':'dd570978bca8e9445c7a8ba1cfea1d28c8eb5f99c0302d88b3004c2cc632f62f','verification-index.json':'bade9078eba361c97910bcb79e3c6c49a2da13f11e8f2d618c0f3a3707f48576','predefault-freeze-audit.json':'3819ca2d668fb7e8162f0df4c9c307d4522524e1e482d25ff75590858e7e105b','correction-regression-matrix.json':'7ec6d36cce34b074ef8c40b0300e1d5a0c30d43d2a39a719ab1bd52083b705ed','root-preservation-index.json':'2d75dd17bc285104b39c8a913cc81e0bc7af02d67731785fa5ca0ab630aac88f'}
for n,h in pins.items():ck('supplied '+n,sha(E/n)==h)
ra=j(R/'legacy-implementation-review/root-correction-dcc-binding.json');ck('Root supplied bindingSHA',sha(R/'legacy-implementation-review/root-correction-dcc-binding.json')=='0507512d037a5e0daf0735a305b7191f2253eb6f4932c60ff8c75d26535d5a55')
ck('Root full packet audit12913/10 PASS',ra['status']=='PASS' and ra['retainedRegularFiles']==12913 and ra['recordedSymlinks']==10)
idx=j(E/'root-preservation-index.json');manifest=j(E/'evidence-manifest.json');seal=j(E/'evidence-seal.json');ck('packet cardinality12913',len(idx['files'])==12913 and len(manifest['regularFiles'])==12911 and len(manifest['symlinks'])==10)
ctx=j(E/'candidate-source.json');base=j(E/'baseline.json');oracle=j(R/'legacy-implementation-review/baseline-oracle.json')
ck('exact candidate/base',ctx['candidateCommit']==C and ctx['parentCommit']==B and git('rev-parse','HEAD').decode().strip()==C and git('rev-parse',C+'^').decode().strip()==B)
ck('one correction commit',len(git('rev-list',B+'..'+C).splitlines())==1)
ck('exact3 delta',set(git('diff','--name-only',B+'...'+C).decode().splitlines())==set(ctx['owned3']))
ck('fullpolicy exact3 cumulative delta',set(git('diff','--name-only',F+'...'+C).decode().splitlines())==set(ctx['owned3']))
ck('443/440/69 and protected oracle',len(ctx['source443'])==443 and len(ctx['protected440'])==440 and len(ctx['compiled69'])==69 and ctx['protected440']==oracle['protected440'])
for n,h in ctx['source443'].items():ck('working Source:'+n,sha(A/n)==h)
for n,h in ctx['compiled69'].items():ck('working compiled:'+n,sha(A/n)==h)
blobs(C,ctx['source443']);blobs(B,base['source443']);blobs(F,oracle['baselineSource441'])
ck('compiled68 protected',all(ctx['compiled69'][n]==h for n,h in oracle['baselineCompiled69'].items() if n!='dist/observed/allocation-config.js'))
ck('approved policy SHA',sha(R/'legacy-volume-policy-proposal-v3.md')=='14dd5566f99845a4ee6562404c16610c732795f311b7df1e95ecb306dd599492')
owner=j(R/'owner-legacy-mount-trust-decision.json');ck('owner approved receiptSHA',owner['status']=='APPROVED' and sha(R/'owner-legacy-mount-trust-decision.json')=='08ce3e92770bd45e27a695e9cf98fa7b72c867cba378ea7b1e27ba13695fe947')
for n in ['.scratch/observed-action-rollout/legacy-implementation-review-brief.md','.scratch/observed-action-rollout/legacy-review-correction-brief.md','.scratch/observed-action-rollout/legacy-binding-compatibility-notes.md','AGENTS.md','.scratch/v1-release/map.md','docs/agents/issue-tracker.md','docs/agents/domain.md','package.json']:
 read(I/n)
for n in ['report.md','freeze.json','clause-correspondence.md','finding-traces.md','reviewer-audit-qualification.json']:
 read(R/'legacy-implementation-review/spec/4fa9cc99'/n)
ck('old FAIL frozenSHA',sha(R/'legacy-implementation-review/spec/4fa9cc99/freeze.json')=='2dccdd930e94e33baf890c0742937dd14ec878060213584ae61cc37d5072439f')
# Original199 body/assertions: the only change above the appended corrections is additive import.
old=read(E/'base-owned-bytes/tests/observed-legacy-volume-runtime.test.ts').decode();now=read(A/'tests/observed-legacy-volume-runtime.test.ts').decode();prefix=now.split('\nconst correctionLeaves =')[0].rstrip()+'\n';prefix=prefix.replace("import { cryptexMount, cryptexBundle }", "import { cryptexMount }");ck('original199 exact prefix/assertions',prefix==old)
oldfixture=read(E/'base-owned-bytes/tests/fixtures/observed-legacy-volume-runtime.ts').decode();newfixture=read(A/'tests/fixtures/observed-legacy-volume-runtime.ts').decode()
ck('fixture pure mapper/identity view unchanged',oldfixture.split('  const reads:')[0]==newfixture.split('  const reads:')[0])
ck('fixture processguard/fake launch unchanged',oldfixture.split('  const source: SourceProcess =')[1].split('  return { ...base')[0]==newfixture.split('  const source: SourceProcess =')[1].split('  return { ...base')[0])
for n in ['genuine-red-audit.json','invariants.json','postcommit-correspondence.json','recorder-successor-binding.json']:
 read(E/n)
pa=j(E/'predefault-freeze-audit.json');vi=j(E/'verification-index.json');ck('predefault74 PASS',len(pa['checks'])==74 and all(v['pass'] for v in pa['checks']));ck('finalindex23 PASS',len(vi['checks'])==23 and all(v['pass'] for v in vi['checks']))
# Relied-on raw stage files only. Complete cache/payload archive traversal relies explicitly on pinned Root audit/index/seal.
for d in sorted(E.iterdir()):
 if not d.is_dir() or d.is_symlink() or not (d/'result.json').is_file():continue
 x=j(d/'result.json');c=j(d/'command.json');s=read(d/'stdout.txt');e=read(d/'stderr.txt');name=d.name
 ck(name+' receipt SHA',sha(d/'command.json')==x['commandSha256'])
 ck(name+' raw hashes',hashlib.sha256(s).hexdigest()==c['stdoutSha256'] and hashlib.sha256(e).hexdigest()==c['stderrSha256'])
 ck(name+' raw counts',counts(s)==x['counts'])
 ck(name+' actual close/exit',c['actualCloseRecorded'] and x['actualCloseRecorded'] and x['exitCode']==c['exitCode'] and bool(c['completedAtUtc']))
 ck(name+' Source/protected preserved',c['sourceAfter443']==c['candidateSource443'] and all(c['sourceAfter443'][n]==h for n,h in oracle['protected440'].items()) and c['sourceUnchanged'] and c['protected440Unchanged'])
 ck(name+' safe recorded env names',set(c['environment'])=={'PATH','HOME','LANG','LC_ALL','NPM_CONFIG_USERCONFIG','NPM_CONFIG_GLOBALCONFIG','NPM_CONFIG_CACHE','HOST_EVIDENCE_DIR'})
 ck(name+' exact runtime',c['runtime']==('v26.8.1' if name.endswith('26') else 'v24.0.0'))
 if name.startswith(('final-','actual-default-')):ck(name+' exact frozenSource',c['sourceAfter443']==ctx['source443'])
 if name.startswith(('final-build-','actual-default-')):ck(name+' exact final compiled69',c['compiledAfter']==ctx['compiled69'])
 if name.startswith('actual-default-'):
  ck(name+' unmodified npm argv',len(c['argv'])==4 and c['argv'][1:]==['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'])
  text=s.decode();pkg=j(A/'package.json');ck(name+' exact raw stage headers',all('> '+pkg['name']+'@'+pkg['version']+' '+q in text for q in ['typecheck','test','build']) and '> rm -rf dist && tsc -p tsconfig.build.json' in text)
  proof=j(E/(name+'-derived-build-proof.json'));ck(name+' build proof binding',proof['commandSha256']==x['commandSha256'] and proof['stdoutSha256']==c['stdoutSha256'] and proof['compiled69']==ctx['compiled69'])
 gates.append({'stage':name,'counts':x['counts'],'exitCode':x['exitCode'],'argv':c['argv'],'actualCloseUtc':c['completedAtUtc'],'commandSha256':x['commandSha256'],'stdoutSha256':c['stdoutSha256'],'stderrSha256':c['stderrSha256'],'sourceMatchesFinal':c['sourceAfter443']==ctx['source443'],'compiledMatchesFinal':c['compiledAfter']==ctx['compiled69']})
 # Empty npm configs were ordinary fixed inputs, not inherited key/environment settings.
 for q in ['user.npmrc','global.npmrc']:ck(name+' empty '+q,read(d/q)==b'')
# Exact contemporaneous pre-repair Source archived before both genuine red commands.
red=j(E/'genuine-red-audit.json')
for node in ['26','24']:
 c=j(E/('red-node'+node)/'command.json');ck('red original production '+node,c['owned3']['src/observed/allocation-config.ts']==base['source443']['src/observed/allocation-config.ts'])
for n,h in base['owned3'].items():ck('base-owned snapshot:'+n,sha(E/'base-owned-bytes'/n)==h)
# Match every diagnostic row to each corresponding raw diagnostic; verify all genuine red/green assertions independently.
m=j(E/'correction-regression-matrix.json');ck('42matrix rows',len(m['rows'])==42)
for node in ['26','24']:
 redraw=read(E/('red-node'+node)/'stdout.txt').decode();greenraw=read(E/('final-green-node'+node)/'stdout.txt').decode();reds=[json.loads(l[2:]) for l in redraw.splitlines() if l.startswith('ℹ {"kind"')];greens=[json.loads(l[2:]) for l in greenraw.splitlines() if l.startswith('ℹ {"kind"')]
 ck('raw diagnostics42 '+node,len(reds)==len(greens)==42)
 for row in m['rows']:
  nr=row['nodes'][node];r=nr['red'];g=nr['green'];ck('matrix raw ordinal '+node+':'+str(row['ordinal']),r in reds and g in greens and nr['redCommandSha256']==sha(E/('red-node'+node)/'command.json') and nr['greenCommandSha256']==sha(E/('final-green-node'+node)/'command.json'))
  if row['finding']=='P1':
   ck('genuine restored P1 '+node+':'+str(row['ordinal']),r['changed'] and r['restored'] and r['accepted'] and r['readonlyXmlUnchanged'] and any(v['ino']=='202' for v in r['mountObservations']))
   ck('direct-path corrected P1 '+node+':'+str(row['ordinal']),g['changed'] and not g['accepted'] and g['metadataConversions']==0 and g['readonlyXmlUnchanged'] and any(v['ino']=='202' for v in g['mountObservations']))
  else:
   ck('genuine P2 '+node+':'+str(row['ordinal']),r['abortObserved'] and any(v['operation']=='opened-stat' for v in r['postAbort']))
   ck('corrected close-only P2 '+node+':'+str(row['ordinal']),g['abortObserved'] and len(g['postAbort'])==1 and g['postAbort'][0]['operation']=='close' and g['newEffects']==g['newFixtureLaunches']==0)
ck('both defaults serial actualcloses',j(E/'actual-default-node26/command.json')['completedAtUtc']<j(E/'actual-default-node24/command.json')['startedAtUtc'])
# Every actually relied-on packet file matches the Root preservation index. No dependency/cache traversal, native query, test or build occurs.
for p,v in list(inputs.items()):
 try:n=str(Path(p).relative_to(E))
 except ValueError:continue
 if n=='root-preservation-index.json':continue
 ck('relied packet exact hash:'+n,n in idx['files'] and idx['files'][n]['sha256']==v['sha256'] and idx['files'][n]['bytes']==v['bytes'])
for n,b in [('correction.diff',git('diff',B+'...'+C)),('full-policy.diff',git('diff',F+'...'+C)),('commit-list.txt',git('log',B+'..'+C,'--format=%H %s'))]:
 with (O/n).open('xb') as f:f.write(b)
audit={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':B,'candidate':C,'approvedPolicyBaseline':F,'checks':checks,'passed':sum(v['pass'] for v in checks),'failed':[v for v in checks if not v['pass']],'gates':gates,'archiveScope':'Relied-on files individually rehashed. Full12913 retained regular bytes and10 recorded links rely explicitly on supplied hash-bound Root audit/index/author seal; no caches/dependencies retraversed.','scope':'Static Source and retained raw evidence only; no execution.'}
for name,v in [('audit.json',audit),('input-manifest.json',{'count':len(inputs),'files':inputs})]:
 with (O/name).open('x') as f:json.dump(v,f,indent=2,sort_keys=True);f.write('\n')
print(json.dumps({'checks':len(checks),'passed':audit['passed'],'failed':audit['failed'],'inputs':len(inputs)},indent=2))
