import os,json,pathlib,hashlib,stat,subprocess,datetime
repo=pathlib.Path.cwd()
base=repo/'.scratch/observed-integration/acceptance/host/live-resume-2026-10-11'
ev=base/'operator-compatibility'
if ev.exists() or ev.is_symlink(): raise SystemExit('Evidence directory already exists; stop without overwrite')
os.umask(0o077)
ev.mkdir(mode=0o700)
def read(p):
 p=repo/p
 if not p.is_relative_to(repo) or p.name=='.env': raise ValueError('Outside authorized repository reads')
 for q in [p,*p.parents]:
  if q==repo: break
  s=q.lstat()
  if stat.S_ISLNK(s.st_mode): raise ValueError('Repository alias: '+str(q))
 s=p.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1: raise ValueError('Not single-link regular file: '+str(p))
 with open(p,'rb') as f:
  a=os.fstat(f.fileno()); b=f.read(); z=os.fstat(f.fileno())
 after=p.lstat()
 key=lambda s:(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_size,s.st_nlink,s.st_ctime_ns,s.st_mtime_ns)
 if not(key(s)==key(a)==key(z)==key(after)): raise ValueError('Repository input changed: '+str(p))
 return b
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(name,obj):
 with open(ev/name,'x',encoding='utf8') as f: json.dump(obj,f,indent=2); f.write('\n')
bp='.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/root-binding.json'
bb=read(bp); binding=json.loads(bb)
mp=binding['manifestPath']; mb=read(mp)
if sha(mb)!=binding['manifestSha256'] or sha(mb)!='23788f5e88242d5ef6c6d333f4edef8a6be3c4705c96c793cfc07b0bf8f67458': raise SystemExit('Root manifest mismatch')
audit=json.loads(mb)
head=subprocess.check_output(['git','rev-parse','HEAD'],env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LANG':'C','LC_ALL':'C'},text=True).strip()
if head!=binding['integratedHead'] or head!='1f69ec7d3d648189cd631259c1c9427c5b8e1b0e': raise SystemExit('HEAD mismatch')
groups={k:audit[k] for k in ['source443','compiled69','originalHostFiles15']}
if [len(v) for v in groups.values()]!=[443,69,15]: raise SystemExit('Pinned vector counts mismatch')
old='.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/'
refs={bp:sha(bb),mp:sha(mb)}
def add(p,h=None):
 actual=sha(read(p))
 if h is not None and actual!=h: raise ValueError('Prior evidence hash mismatch: '+p)
 if p in refs and refs[p]!=actual: raise ValueError('Conflicting prior pin')
 refs[p]=actual
for n in range(1,6):
 p=old+f'operator-phase{n}/artifact-hashes.json'; add(p)
 for x in json.loads(read(p))['files']: add(old+f'operator-phase{n}/'+x['path'],x['sha256'])
p=old+'root-repaired-compatibility-audit.json'; add(p)
r=json.loads(read(p))
for n,x in r['files'].items(): add(old+'operator-repaired-compatibility/'+n,x['sha256'])
p=old+'operator-repaired-compatibility/prior-evidence-reference.json'
for n,h in json.loads(read(p))['priorEvidence'].items(): add(n,h)
p=old+'operator-legacy-volume-diagnosis/artifact-hashes.json'; add(p)
for x in json.loads(read(p))['files']: add(old+'operator-legacy-volume-diagnosis/'+x['path'],x['sha256'])
for n in ['cryptex-policy-proposal.md','owner-cryptex-trust-decision.json','legacy-volume-policy-proposal-v3.md','owner-legacy-mount-trust-decision.json','root-legacy-volume-diagnosis-audit.json']:
 p=old+n
 if (repo/p).exists(): add(p)
add('.scratch/observed-action-rollout/installed-compatibility-recheck.md')
for n in ['owner-cryptex-trust-decision.json','owner-legacy-mount-trust-decision.json']:
 d=json.loads(read(old+n)); p=d.get('proposalPath',d.get('proposal')); add(p,d['proposalSha256'])
groups['priorEvidence']=refs
records={}; mismatches=[]
for g,entries in groups.items():
 values=[]
 for p,h in entries.items():
  b=read(p); actual=sha(b); v={'path':p,'bytes':len(b),'expectedSha256':h,'actualSha256':actual,'match':actual==h}; values.append(v)
  if not v['match']: mismatches.append({'group':g,**v})
 records[g]={'count':len(values),'allMatch':all(v['match'] for v in values),'files':values}
write('references.json',{'groups':groups,'scope':'Only explicit root and historical manifests; no fake-host fixtures/caches or symlinks traversed.'})
write('source-hashes-before.json',{'capturedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':head,'rootBindingSha256':sha(bb),'rootManifestSha256':sha(mb),'allMatch':not mismatches,'mismatches':mismatches,'groups':records})
write('preparation-receipt.json',{'status':'PIN_VERIFICATION_PASS' if not mismatches else 'PIN_VERIFICATION_FAILURE','installedMetadataCalls':0,'compatibilityLookupCalls':0,'nativeChildren':0,'evidenceMode':'0700 dirs /0600 files','outerEnvironmentNames':sorted(os.environ),'head':head,'counts':{g:len(v) for g,v in groups.items()},'mismatches':mismatches})
print(json.dumps({'status':'PIN_VERIFICATION_PASS' if not mismatches else 'PIN_VERIFICATION_FAILURE','head':head,'counts':{g:len(v) for g,v in groups.items()},'mismatches':mismatches}))
