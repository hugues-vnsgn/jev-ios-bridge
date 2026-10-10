import os,json,hashlib,subprocess,re
from pathlib import Path
os.umask(0o077)
C=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-tracked-binding')
I=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
E=C/'.scratch/installed-tracked-runtime'; R=I/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
inputs={}; checks=[]
def sha(b): return hashlib.sha256(b).hexdigest()
def read(p):
 p=Path(p);assert p.is_file() and not p.is_symlink();b=p.read_bytes();inputs[str(p)]={'sha256':sha(b),'bytes':len(b),'mode':oct(p.stat().st_mode&0o777)};return b
def js(p):return json.loads(read(p))
def check(n,v):checks.append({'name':n,'pass':bool(v)})
def git(*a):return subprocess.check_output(['git',*a],cwd=C)
ctx=js(E/'candidate-source.json');vi=js(E/'verification-index.json');pre=js(E/'predefault-freeze-audit.json')
check('context pin',inputs[str(E/'candidate-source.json')]['sha256']=='7de42479f3263694ed81fe17d43540d638d7d6259531508c28bfd4388fb8e7c9')
check('verification pin',inputs[str(E/'verification-index.json')]['sha256']=='f355a1134c719bc0cff3a7817d224af9a2cbcb56dc1e01b0d25f7eb6e6d2a9e4')
for k,n in [('source443',443),('protected439',439),('compiled69',69),('owned4',4)]:check(k+' count',len(ctx[k])==n)
for p,h in ctx['source443'].items():
 check('working '+p,sha(read(C/p))==h);check('git '+p,sha(git('show',ctx['candidateCommit']+':'+p))==h)
for p,h in ctx['protected439'].items():check('protected '+p,sha(git('show',ctx['parentCommit']+':'+p))==h)
for p,h in ctx['compiled69'].items():check('compiled '+p,sha(read(C/p))==h)
diff=git('diff',ctx['parentCommit']+'...'+ctx['candidateCommit']);Path('diff.patch').write_bytes(diff)
Path('commits.txt').write_bytes(git('log',ctx['parentCommit']+'..'+ctx['candidateCommit'],'--oneline'))
check('three changed paths',git('diff','--name-only',ctx['parentCommit']+'...'+ctx['candidateCommit']).decode().splitlines()==['src/observed/allocation-config.ts','src/observed/allocation.ts','tests/observed-legacy-volume-runtime.test.ts'])
p='tests/observed-legacy-volume-runtime.test.ts';old=git('show',ctx['parentCommit']+':'+p).decode();new=read(C/p).decode();check('existing241 exact bodies',old[old.index('import { mapPublicFixturePath'):].rstrip()==new[new.index('import { mapPublicFixturePath'):new.index('\nconst trackedCompatibility')].rstrip())
check('fixture identical',read(C/'tests/fixtures/observed-legacy-volume-runtime.ts')==git('show',ctx['parentCommit']+':tests/fixtures/observed-legacy-volume-runtime.ts'))
for p in [I/'.scratch/observed-action-rollout/tracked-binding-correction-dispatch.md',R/'legacy-volume-policy-proposal-v3.md',R/'legacy-implementation-review/spec/dcc06dc0/report.md',R/'legacy-implementation-review/standards/dcc06dc0/report.md',E/'implementation-report.md',E/'gate-recorder.py',E/'gate-recorder.diff',E/'evidence-seal.json']:read(p)
check('policy pin',inputs[str(R/'legacy-volume-policy-proposal-v3.md')]['sha256']=='14dd5566f99845a4ee6562404c16610c732795f311b7df1e95ecb306dd599492')
gates={};raws={}
for f in sorted(E.glob('*/command.json')):
 d=js(f);label=f.parent.name;s=read(f.parent/'stdout.txt').decode();err=read(f.parent/'stderr.txt');raws[label]=s
 check(label+' stdout hash',sha(s.encode())==d['stdoutSha256']);check(label+' stderr hash',sha(err)==d['stderrSha256'])
 check(label+' natural close',d['actualCloseRecorded'] and not d['signalSent'] and not d['addedOuterTimeout'])
 check(label+' source stable',d['candidateSource443']==d['sourceAfter443'] and d['protected439Unchanged'])
 counts={k:int(re.search(r'[ℹ#] '+k+r' (\d+)',s)[1]) for k in ['tests','pass','fail','cancelled','skipped','todo'] if re.search(r'[ℹ#] '+k+r' (\d+)',s)}
 if d['mode'] in ['default','coverage','focused','owned','isolation','red']:
  expected={'default':2258,'coverage':613,'focused':764,'owned':259,'isolation':14,'red':12}[d['mode']];failure=6 if d['mode']=='red' else 1 if label=='green-node26' else 0
  check(label+' raw counts',counts==dict(tests=expected,pass_=expected-failure,fail=failure,cancelled=0,skipped=0,todo=0) if False else counts=={'tests':expected,'pass':expected-failure,'fail':failure,'cancelled':0,'skipped':0,'todo':0})
  check(label+' exit',d['exitCode']==(1 if failure else 0))
 else:check(label+' exit',d['exitCode']==0)
 if d['mode']=='default':
  check(label+' exact argv',d['argv'][1:]==['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'])
  check(label+' frozen candidate',d['candidateSource443']==ctx['source443'] and d['compiledBefore69']==ctx['compiled69'] and d['compiledAfter']==ctx['compiled69'])
  check(label+' package steps',all('> jev-ios-bridge@1.3.1 '+x in s for x in ['check','typecheck','test','build']))
 if label.startswith(('red-','green-')):
  for f2 in (f.parent/'owned-source').rglob('*'):
   if f2.is_file():read(f2)
 gates[label]={'counts':counts,'exitCode':d['exitCode'],'startedAtUtc':d['startedAtUtc'],'completedAtUtc':d['completedAtUtc']}
check('serial defaults',gates['actual-default-node26']['completedAtUtc']<gates['actual-default-node24']['startedAtUtc'])
for node in ['26','24']:check('isolation before red '+node,gates['isolation-node'+node]['completedAtUtc']<gates['red-node'+node]['startedAtUtc'])
matrix=js(E/'restoration-matrix.json');check('matrix24',len(matrix)==24)
for row in matrix:
 n=row['node'];red=row['red'];green=row['green'];ident=f'{n}:{row["kind"]}:{row["leaf"]}:{row["layer"]}'
 for label,obj in [('red-node'+n,red),('final-green-node'+n,green)]:
  diagnostics=[]
  for line in raws[label].splitlines():
   if line.startswith('ℹ {'):
    try:diagnostics.append(json.loads(line[2:]))
    except ValueError:pass
  check('matrix raw '+label+ident,obj in diagnostics)
 check('matrix rejects '+ident,green['changed'] and not green['accepted'] and green['metadataConversions']==0 and green['readonlyXmlUnchanged'] and any(x['ino']=='202' for x in green['mountObservations']))
 check('matrix red classification '+ident,red['accepted'] and red['restored'] if row['layer']=='factory conversion' else not red['accepted'])
for name,d in [('predefault',pre),('verification',vi)]:check(name+' all asserted checks',all(x['pass'] for x in d['checks']))
Path('audit.json').write_text(json.dumps({'checks':checks,'passed':sum(x['pass'] for x in checks),'failed':[x for x in checks if not x['pass']],'gates':gates,'scope':'Read-only correspondence audit; no tests, builds or native operations executed. Full archive excluded; Root binding separate.'},indent=2)+'\n')
Path('input-manifest.json').write_text(json.dumps({'count':len(inputs),'files':inputs},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'inputs':len(inputs),'failed':[x for x in checks if not x['pass']]}))
