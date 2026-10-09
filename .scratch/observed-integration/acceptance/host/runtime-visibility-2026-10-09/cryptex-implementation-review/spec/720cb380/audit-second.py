from pathlib import Path
import hashlib,json,os,re,subprocess,datetime
os.umask(0o077)
ROOT=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
C=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime')
R=ROOT/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
E=C/'.scratch/installed-cryptex-runtime';OUT=R/'cryptex-implementation-review/spec/720cb380';OLD=OUT.parent/'dadde33a'
BASE='38aa879c3954c9d7742ef04059cad4d2fc824c87';PARENT='dadde33a36440db6d9414adf84f80916caa9d2b3';CAND='720cb380d07102d72b20a6a4f5f7787a0ab88f2b'
inputs={};checks=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def data(p):
 b=p.read_bytes();inputs[str(p)]={'sha256':sha(b),'bytes':len(b)};return b
def read(p):return json.loads(data(p))
def check(name,passed):checks.append({'name':name,'pass':bool(passed)});assert passed,name
def gitbytes(commit,p):return subprocess.check_output(['git','show',commit+':'+p],cwd=C)
def w(name,d):p=OUT/name;p.write_text(json.dumps(d,indent=2,sort_keys=True)+'\n');p.chmod(0o600)
oracle=read(R/'cryptex-implementation-review/oracle-cli-inputs.json')
check('oracle exact SHA',inputs[str(R/'cryptex-implementation-review/oracle-cli-inputs.json')]['sha256']=='eb5e488151620195f768555d8317ad83b99831109152aa709d701947f72765fd')
for group in ['authorFinalInputs','rootInputs']:
 for p,h in oracle[group].items():check('oracle pin '+p,sha(data(Path(p)))==h)
m=read(E/'candidate-cli-source.json');idx=read(E/'verification-index-cli.json');ctx=read(R/'cryptex-implementation-review/candidate-cli-context.json');pre=read(E/'candidate-cli-source-precommit.json');prior=read(E/'candidate-source.json')
check('exact candidate/base/parent',(m['commit'],m['base'],m['parentCandidate'])==(CAND,BASE,PARENT))
check('HEAD frozen',subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()==CAND)
check('441/436/5 inventory',(len(m['source441']),len(m['protected436']),len(m['owned5']))==(441,436,5))
check('complete context vectors match',all(m[k]==ctx[k] for k in ['owned5','source441','protected436','compiled69']))
check('precommit Source vectors match',all(m[k]==pre[k] for k in ['owned5','source441','protected436']))
check('source441 working and commit',all(sha(data(C/p))==h==sha(gitbytes(CAND,p))for p,h in m['source441'].items()))
check('436 protected exact base and Root bytes',all(sha(gitbytes(BASE,p))==h==sha(data(ROOT/p))for p,h in m['protected436'].items()))
check('Source policies unchanged from parent',all(sha(gitbytes(PARENT,p))==h for p,h in m['source441'].items()if p.startswith('src/')))
check('production allocation source fixed',m['source441']['src/observed/allocation-config.ts']=='7d5798570970ca8de9fcca980b39662c4cf2b9be939e1ad31f23e9383e82fe62')
check('exact cumulative five files',set(subprocess.check_output(['git','diff','--name-only',BASE,CAND],cwd=C,text=True).splitlines())==set(m['owned5']))
check('exact two successor files',set(subprocess.check_output(['git','diff','--name-only',PARENT,CAND],cwd=C,text=True).splitlines())=={'tests/fixtures/observed-cli-server.ts','tests/observed-cryptex-runtime.test.ts'})
check('69 compiled same parent',m['compiled69']==prior['compiled69'])
old=gitbytes(PARENT,'tests/fixtures/observed-cli-server.ts').decode();new=data(C/'tests/fixtures/observed-cli-server.ts').decode()
helper="export const mapPublicFixturePath = (root: string, path: string) =>\n  path === root || path.startsWith(root + '/') ? path\n    : path === '/' || /^\\/(?:Applications|Library|System|usr|private)(?:\\/|$)/.test(path) ? join(root, 'host', path) : path;\n\n"
oldlocal="    const map = (path: string) => /^\\/(?:Applications|Library|System|usr)(?:\\/|$)/.test(path) ? join(context.root, 'host', path) : path;"
newlocal="    const map = (path: string) => mapPublicFixturePath(context.root, path);"
check('public fixture all nonmapper bytes exact',new.count(helper)==1 and new.count(newlocal)==1 and new.replace(helper,'').replace(newlocal,oldlocal)==old)
red=data(E/'cli-isolation-red-observed-cli-server.ts').decode();oldhelper="export const mapPublicFixturePath = (root: string, path: string) =>\n  /^\\/(?:Applications|Library|System|usr)(?:\\/|$)/.test(path) ? join(root, 'host', path) : path;\n\n"
check('contemporaneous extracted expression preserves original',red.count(oldhelper)==1 and red.replace(oldhelper,'').replace(newlocal,oldlocal)==old)
check('old public fixture archive exact',data(E/'before-cli-isolation-observed-cli-server.ts')==gitbytes(PARENT,'tests/fixtures/observed-cli-server.ts'))
check('green public fixture archive exact',data(E/'cli-isolation-green-observed-cli-server.ts')==new.encode())
told=gitbytes(PARENT,'tests/observed-cryptex-runtime.test.ts').decode();tnew=data(C/'tests/observed-cryptex-runtime.test.ts').decode();extra="import { mapPublicFixturePath } from './fixtures/observed-cli-server.js';\n";clean=tnew.replace(extra,'');start=clean.index('const purePublicRoot =');anchor="for (const path of ['/', '/private', cryptexInfo])";oldstart=told.index(anchor);suffix=told[oldstart:]
check('original166 suite allbytes exact after removing14pure cases',clean[:start]==told[:oldstart] and clean.endswith(suffix))
check('contemporaneous red suite equals final suite',data(E/'cli-isolation-red-observed-cryptex-runtime.test.ts')==tnew.encode())
check('before CLI test archive exact parent',data(E/'before-cli-isolation-observed-cryptex-runtime.test.ts')==told.encode())
for p,h in m['owned5'].items():check('contemporaneous five-file snapshot '+p,sha(data(E/'candidate-cli'/p))==h)
for p in sorted(OLD.rglob('*')):
 if p.is_file():data(p)
freeze=read(OLD/'freeze.json');check('prior frozen outputs unchanged',all(sha(data(OLD/p))==h['sha256']for p,h in freeze['outputs'].items()))
receipts=[];times=[]
required=['tests','pass','fail','cancelled','skipped','todo']
claims={**idx['successorGates']}
scope=read(E/'cli-isolation-scope-proof.json')
for p,v in scope['pureChecks'].items():claims['cli-map-'+p]={'receipt':v['receipt'],'receiptSha256':v['receiptSha256'],'counts':v['counts'],'exitCode':v['exitCode']}
for name,claim in claims.items():
 p=C/claim['receipt'];d=read(p);folder=p.parent;out=data(folder/'stdout.txt');err=data(folder/'stderr.txt');s=out.decode();counts={k:int(v)for k,v in re.findall(r'^\s*[ℹ#]\s*(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)',s,re.M)}
 check(name+' receipt pin',sha(p.read_bytes())==claim['receiptSha256'])
 check(name+' raw hashes and lengths',sha(out)==d['stdoutSha256'] and sha(err)==d['stderrSha256'] and len(out)==d['stdoutBytes'] and len(err)==d['stderrBytes'])
 check(name+' raw counts',all(counts.get(k)==v for k,v in claim['counts'].items()))
 check(name+' exit',d['exitCode']==claim['exitCode'])
 check(name+' source vector own5 agreement',all(d['candidateSource441'][p]==h for p,h in d['owned5'].items()))
 for ownedPath,h in d['owned5'].items():
  candidates=[E/'cli-isolation-red-observed-cli-server.ts',E/'cli-isolation-green-observed-cli-server.ts',E/'cli-isolation-red-observed-cryptex-runtime.test.ts',C/ownedPath]
  check(name+' retained actual bytes '+ownedPath,any(sha(data(f))==h for f in candidates if f.is_file()))
 item={'name':name,'receiptSha256':sha(p.read_bytes()),'counts':counts,'exit':d['exitCode'],'argv':d['argv'],'env':d['env'],'start':d['startedAtUtc'],'end':d['completedAtUtc'],'source441':d['candidateSource441'],'owned5':d['owned5'],'failingSections':s[s.find('failing tests:'):]if 'failing tests:'in s else ''}
 if 'result' in claim:
  z=read(C/claim['result']);check(name+' result pin',sha((C/claim['result']).read_bytes())==claim['resultSha256']);check(name+' before/after441/436/69',z['source441Before']==z['source441After']==m['source441'] and z['protected436']==m['protected436'] and z['compiled69After']==m['compiled69']);check(name+' actual close',z['actualCloseRecorded']);check(name+' same result raw counts',all(z['counts'].get(k)==v for k,v in counts.items()))
  item['resultSha256']=sha((C/claim['result']).read_bytes());item['beforeAfter441Match']=True;item['compiled69Match']=True;times.append((d['startedAtUtc'],d['completedAtUtc'],name))
 receipts.append(item)
times.sort();check('all final/affected commands serial',all(a[1]<=b[0]for a,b in zip(times,times[1:])))
compiled={}
for node in ['26','24']:
 folder=E/('build-cli-final-node'+node);v=read(folder/'compiled-manifest.json');check('compiled node'+node+' vector exact69',v==m['compiled69']);check('compiled node'+node+' archive bytes',all(sha(data(folder/'compiled'/p.removeprefix('dist/')))==h for p,h in v.items()));compiled[node]=v
check('current compiled69 bytes',all(sha(data(C/p))==h for p,h in m['compiled69'].items()))
for p in [E/'cli-isolation-extraction.json',E/'cli-isolation-job-schema-note.json',E/'before-cli-isolation-prepare-job.py',E/'cli-packaging-selector-failed.json',E/'cli-packaging-selector-corrected.json',E/'cli-freeze-inventory-assertion.json',E/'actual-default-node26/post-run-preservation.json',R/'cryptex-implementation-review/root-successor-audit-first-failure.json',R/'cryptex-implementation-review/audit-successor-first.py',R/'cryptex-implementation-review/audit-successor.py']:
 data(p)
# Audit only completed actual default receipts. Pending output is never a gate claim.
defaults=[]
for node in ['26','24']:
 folder=E/('actual-default-cli-node'+node);p=folder/'command.json'
 if not p.is_file():continue
 d=read(p);out=data(folder/'stdout.txt');err=data(folder/'stderr.txt');s=out.decode();counts={k:int(v)for k,v in re.findall(r'^\s*[ℹ#]\s*(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)',s,re.M)}
 check('actual default'+node+' rawhashes',sha(out)==d['stdoutSha256'] and sha(err)==d['stderrSha256'] and len(out)==d['stdoutBytes'] and len(err)==d['stderrBytes'])
 check('actual default'+node+'441 binding',d['candidateSource441']==m['source441'] and d['owned5']==m['owned5'])
 entry={'node':node,'receiptSha256':sha(p.read_bytes()),'counts':counts,'exit':d['exitCode'],'argv':d['argv'],'env':d['env'],'start':d['startedAtUtc'],'end':d['completedAtUtc'],'scripts':re.findall(r'^> (.+)',s,re.M)}
 if (folder/'result.json').is_file():z=read(folder/'result.json');entry['result']=z
 defaults.append(entry)
w('source-audit.json',{'base':BASE,'parent':PARENT,'candidate':CAND,'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'owned5':m['owned5'],'protected436':m['protected436'],'source441':m['source441'],'compiled69':m['compiled69'],'mapperHelper':helper,'allOriginal166CasesPreserved':True,'delta':subprocess.check_output(['git','diff',PARENT+'...'+CAND],cwd=C,text=True)})
w('receipt-audit.json',{'candidate':CAND,'retainedOnly':True,'receipts':receipts,'compiled':compiled,'defaults':defaults,'defaultPairComplete':len(defaults)==2,'gateVerdict':'HELD until Root final pair supplied'})
w('input-manifest.json',{'base':BASE,'parent':PARENT,'candidate':CAND,'inputs':inputs})
print(json.dumps({'checks':len(checks),'allPass':all(c['pass']for c in checks),'newReceipts':len(receipts),'completedDefaults':len(defaults),'inputs':len(inputs)},indent=2))
