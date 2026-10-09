from pathlib import Path
import hashlib,json,os,re,subprocess,datetime
os.umask(0o077)
ROOT=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
C=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
R=ROOT/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
E=C/'.scratch/installed-cryptex-runtime'
OUT=R/'cryptex-implementation-review/spec/dadde33a'
inputs={}
def sha(b):return hashlib.sha256(b).hexdigest()
def data(p):
 b=p.read_bytes();inputs[str(p)]={'sha256':sha(b),'bytes':len(b)};return b
def read(p):return json.loads(data(p))
def gitbytes(commit,p):return subprocess.check_output(['git','show',commit+':'+p],cwd=C)
def check_files(vector,root):return {p:sha(data(root/p))==v for p,v in vector.items()}
def jwrite(name,d):
 p=OUT/name;p.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n');p.chmod(0o600)
context=read(R/'cryptex-implementation-review/candidate-context.json')
manifest=read(E/'candidate-source.json');pre=read(E/'candidate-source-precommit.json');binding=read(E/'base-binding.json')
base=manifest['base'];candidate=manifest['commit']
if candidate!='dadde33a36440db6d9414adf84f80916caa9d2b3':raise SystemExit('Frozen historical audit; new candidates require a separate destination')
product={
 'base':base,'candidate':candidate,'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip(),
 'commitList':subprocess.check_output(['git','log','--format=%H %s',base+'..'+candidate],cwd=C,text=True).splitlines(),
 'changedPaths':subprocess.check_output(['git','diff','--name-only',base+'...'+candidate],cwd=C,text=True).splitlines(),
 'owned4':manifest['owned4'],'source441Working':check_files(manifest['source441'],C),
 'source441Commit':{p:sha(gitbytes(candidate,p))==v for p,v in manifest['source441'].items()},
 'base439Commit':{p:sha(gitbytes(base,p))==v for p,v in binding['source439'].items()},
 'protected437Base':{p:sha(gitbytes(base,p))==v for p,v in manifest['protected437'].items()},
 'contextVectorsMatch':all(context[k]==manifest[k] for k in ['owned4','source441','protected437','compiled69']),
 'precommitVectorsMatch':all(pre[k]==manifest[k] for k in ['owned4','source441','protected437','compiled69']),
 'baseSourceArchiveMatch':sha(data(E/'base-allocation-config.ts'))==binding['source439']['src/observed/allocation-config.ts'],
 'baseSharedFixtureArchiveMatch':sha(data(E/'base-observed-allocation-backend.ts'))==binding['source439']['tests/fixtures/observed-allocation-backend.ts'],
}
old=gitbytes(base,'tests/fixtures/observed-allocation-backend.ts').decode();new=data(C/'tests/fixtures/observed-allocation-backend.ts').decode()
a="  const map = (path: string) => /^\\/(?:Applications|Library|System|usr)(?:\\/|$)/.test(path) ? join(root, 'host', path) : path;"
b="  const map = (path: string) => path === root || path.startsWith(root + '/') ? path\n    : path === '/' || /^\\/(?:Applications|Library|System|usr|private)(?:\\/|$)/.test(path) ? join(root, 'host', path) : path;"
product['sharedFixtureOnlyThreeAuthorizedBranches']=old.count(a)==1 and old.replace(a,b)==new
initial=data(E/'initial-red-test-reconstructed.ts').decode();final=data(C/'tests/observed-cryptex-runtime.test.ts').decode()
blocks=initial[initial.index("test('"):].strip().split("\n\ntest('")
blocks=[blocks[0]]+["test('"+x for x in blocks[1:]]
product['twoOriginalObservedLayoutTestsVerbatim']=len(blocks)==2 and all(x.strip() in final for x in blocks)
index=read(E/'verification-index-precommit.json');indexed={x['path']:x for x in index['allReceipts']}
archives={}
for p in sorted(E.glob('*.ts')):archives[str(p.relative_to(C))]=sha(data(p))
for p in [C/x for x in manifest['owned4']]:archives[str(p.relative_to(C))]=sha(data(p))
receipts=[]
for folder in sorted(E.iterdir()):
 p=folder/'command.json'
 if not p.is_file():continue
 d=read(p);o=data(folder/'stdout.txt');e=data(folder/'stderr.txt');s=o.decode(errors='replace')
 valid=sha(o)==d['stdoutSha256'] and sha(e)==d['stderrSha256'] and ('stdoutBytes' not in d or len(o)==d['stdoutBytes']) and ('stderrBytes' not in d or len(e)==d['stderrBytes'])
 counts={k:int(v) for k,v in re.findall(r'^\s*[ℹ#]\s*(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)',s,re.M)}
 item={'name':folder.name,'receiptSha256':sha(p.read_bytes()),'rawMatch':valid,'exit':d['exitCode'],'counts':counts,'argv':d['argv'],'envNames':sorted(d.get('env',{})),'start':d['startedAtUtc'],'end':d['completedAtUtc'],'cwd':d['cwd']}
 rel=str(p.relative_to(C));item['verificationIndexReceiptMatch']=sha(p.read_bytes())==indexed[rel]['sha256'] if rel in indexed else None
 for key in ['sourceSha256','testSha256','fixtureSha256','sharedFixtureSha256']:
  if key in d:item[key]={'value':d[key],'retainedMatchingPaths':[p for p,v in archives.items() if v==d[key]]}
 if 'candidateSource441' in d:item['final441VectorMatch']=d['candidateSource441']==manifest['source441']
 if 'owned4' in d:item['finalOwned4VectorMatch']=d['owned4']==manifest['owned4']
 item['failingNames']=re.findall(r'^✖ ([^\n]+)',s,re.M)
 if folder.name.startswith('actual-default'):
  item['scripts']=re.findall(r'^> (.+)',s,re.M);item['typecheckAppears']='> tsc --noEmit' in s;item['buildAppears']='> tsup' in s
  item['failureSections']=s[s.find('failing tests:'):] if 'failing tests:' in s else ''
  item['beforeAfter441VectorMatch']=d.get('source441After')==manifest['source441'] if 'source441After' in d else None
 receipts.append(item)
compiled={}
baseline=read(R/'xcode-candidate-evidence/compiled-after-full-node26.json')
for node in ['26','24']:
 folder=E/('build-final-node'+node);m=read(folder/'compiled-manifest.json');v=m['compiled69'];compiled[node]={'manifestSha256':sha((folder/'compiled-manifest.json').read_bytes()),'source441Match':m['source441']==manifest['source441'],'vectorMatch':v==manifest['compiled69'],'snapshotMatch':{p:sha(data(folder/'compiled'/p.removeprefix('dist/')))==h for p,h in v.items()},'baseUnchanged':[p for p,h in v.items() if baseline.get(p)==h],'baseChanged':[p for p,h in v.items() if baseline.get(p)!=h]}
product['compiledCurrent69']=check_files(manifest['compiled69'],C)
for p in [R/'cryptex-policy-proposal.md',R/'owner-cryptex-trust-decision.json',R/'cryptex-fixture-map-ownership.json',R/'root-phase5-retained-mount-derivation.json',ROOT/'.scratch/observed-action-rollout/installed-cryptex-repair.md',ROOT/'.scratch/observed-action-rollout/cryptex-implementation-review.md',ROOT/'.scratch/observed-action-rollout/implementation-plan.md',ROOT/'.scratch/observed-action-rollout/allocation-contract.md',C/'AGENTS.md',C/'GLOSSARY.md',C/'docs/agents/issue-tracker.md',C/'docs/agents/domain.md',C/'.scratch/v1-release/map.md',C/'docs/adr/0009-bounded-simulator-creation.md',C/'src/observed/allocation.ts',C/'src/observed/create-source.ts',C/'tests/fixtures/observed-cli-server.ts',E/'historical-bytes.json',E/'observed-layout-red-verdict.json',E/'focused-overlap-verdict.json',E/'focused-overlap-stop.json',E/'mapping-scope-extension.json',E/'focused-v2-contemporaneous-bytes.json',E/'clause-regression-matrix.json',E/'implementation-report.md']:
 if p.is_file():data(p)
for p in [Path('/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.agents/skills/code-review/SKILL.md'),Path('/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.agents/skills/writing-for-agents/SKILL.md'),Path('/Users/hugues_mini/.agents/skills/unslop/SKILL.md')]:data(p)
jwrite('source-audit.json',product);jwrite('receipt-audit.json',{'retainedOnly':True,'commands':receipts,'compiled':compiled});jwrite('input-manifest.json',{'base':base,'candidate':candidate,'inputs':inputs})
print(json.dumps({'source441':all(product['source441Working'].values()),'commit441':all(product['source441Commit'].values()),'base439':all(product['base439Commit'].values()),'protected437':all(product['protected437Base'].values()),'threeBranches':product['sharedFixtureOnlyThreeAuthorizedBranches'],'originalTwo':product['twoOriginalObservedLayoutTestsVerbatim'],'rawReceipts':len(receipts),'rawAllMatch':all(r['rawMatch'] for r in receipts),'indexedAllMatch':all(r['verificationIndexReceiptMatch'] is not False for r in receipts),'compiledBoth':all(c['vectorMatch'] and all(c['snapshotMatch'].values()) for c in compiled.values()),'baseCompiledUnchanged':{k:len(v['baseUnchanged']) for k,v in compiled.items()},'inputs':len(inputs)},indent=2))
