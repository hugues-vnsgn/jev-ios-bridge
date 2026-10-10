import hashlib,json,re,subprocess,os
from pathlib import Path
os.umask(0o077)
OUT=Path(__file__).parent
C=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-tracked-binding')
I=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
E=C/'.scratch/installed-tracked-runtime'
inputs={}; checks=[]
def read(p):
 b=p.read_bytes(); inputs[str(p)]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'mode':oct(p.stat().st_mode&0o777)}; return b
def check(n,v): checks.append({'name':n,'pass':bool(v)})
def write(n,d): (OUT/n).write_text(json.dumps(d,indent=2)+'\n')
def git(*args): return subprocess.check_output(['git','-C',str(C),*args])
base='dcc06dc0939d73d860cae9e03d4f1f47bacbd279'; head='cc5d30e2fdaf065bec476a65df465dabb1569f2c'
check('head',git('rev-parse','HEAD').decode().strip()==head)
diff=git('diff',base+'...'+head); (OUT/'diff.patch').write_bytes(diff)
(OUT/'commits.txt').write_bytes(git('log',base+'..'+head,'--oneline'))
context=json.loads(read(E/'candidate-source.json')); verification=json.loads(read(E/'verification-index.json'))
check('context-pin',inputs[str(E/'candidate-source.json')]['sha256']=='7de42479f3263694ed81fe17d43540d638d7d6259531508c28bfd4388fb8e7c9')
check('verification-pin',inputs[str(E/'verification-index.json')]['sha256']=='f355a1134c719bc0cff3a7817d224af9a2cbcb56dc1e01b0d25f7eb6e6d2a9e4')
for f in ['AGENTS.md','CONTEXT.md','GLOSSARY.md','docs/agents/domain.md','docs/adr/0005-the-1-0-stability-contract.md','docs/adr/0008-durable-ios-admission.md','docs/adr/0009-bounded-simulator-creation.md','src/observed/create-source.ts','tests/observed-allocation.test.ts'] :read(C/f)
for f in context['owned4']:
 b=read(C/f);check(f+'-context',hashlib.sha256(b).hexdigest()==context['owned4'][f]);check(f+'-git',b==git('show',head+':'+f))
old=git('show',base+':tests/observed-legacy-volume-runtime.test.ts').decode();new=read(C/'tests/observed-legacy-volume-runtime.test.ts').decode()
check('existing-test-body-exact',old[old.index("import { mapPublicFixturePath"):]==new[new.index("import { mapPublicFixturePath"):new.index('\nconst trackedCompatibility')])
for f in ['implementation-report.md','restoration-matrix.json']:read(E/f)
for f in ['code-review','codebase-design']:read(Path('/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.agents/skills')/f/'SKILL.md')
read(I/'.scratch/observed-action-rollout/tracked-binding-correction-dispatch.md')
read(I/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/legacy-implementation-review/standards/dcc06dc0/report.md')
receipts=[]
for node in ['26','24']:
 for kind,count in [('isolation',14),('red',12),('final-green',259),('focused',764),('coverage',613),('typecheck',None),('build',None),('actual-default',2258)]:
  q=E/(kind+'-node'+node);d=json.loads(read(q/'command.json'));out=read(q/'stdout.txt');err=read(q/'stderr.txt'); label=q.name
  check(label+'-raw',hashlib.sha256(out).hexdigest()==d['stdoutSha256'] and hashlib.sha256(err).hexdigest()==d['stderrSha256'])
  check(label+'-exit',d['exitCode']==(1 if kind=='red' else 0));check(label+'-close',d['actualCloseRecorded'] and not d['signalSent'] and not d['addedOuterTimeout'])
  counts={k:re.findall(r'(?:ℹ |# )'+k+r' (\d+)',out.decode())[-1:] for k in ['tests','pass','fail','cancelled','skipped','todo']}
  if count is not None:
   check(label+'-counts',counts=={k:[str(v)] for k,v in {'tests':count,'pass':6 if kind=='red' else count,'fail':6 if kind=='red' else 0,'cancelled':0,'skipped':0,'todo':0}.items()})
  if kind=='actual-default':check(label+'-official',d['argv'][-2:]==['run','check'] and b'> rm -rf dist && tsc -p tsconfig.build.json' in out)
  receipts.append({'label':label,'counts':counts,'exitCode':d['exitCode'],'startedAtUtc':d['startedAtUtc'],'completedAtUtc':d['completedAtUtc']})
for f in ['command.json','stdout.txt','stderr.txt']:read(E/'green-node26'/f)
a=next(r for r in receipts if r['label']=='actual-default-node26');b=next(r for r in receipts if r['label']=='actual-default-node24');check('defaults-serial',a['completedAtUtc']<b['startedAtUtc'])
write('receipt-audit.json',{'checks':checks,'failed':[c for c in checks if not c['pass']],'receipts':receipts,'scope':'Read-only correspondence checks, not test executions.'})
write('input-bindings.json',inputs)
print(json.dumps({'checks':len(checks),'failed':[c for c in checks if not c['pass']],'inputs':len(inputs)}))
