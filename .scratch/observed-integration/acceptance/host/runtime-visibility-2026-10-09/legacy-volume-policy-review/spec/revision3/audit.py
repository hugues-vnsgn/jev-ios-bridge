"""Bounded revision3 hash/companion audit. Do not rerun gates/native/Source."""
from pathlib import Path
import hashlib,json,os,difflib
os.umask(0o077)
OUT=Path(__file__).resolve().parent;REPO=OUT.parents[7];P=REPO/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09';Q=P/'operator-legacy-volume-diagnosis'
checks=[];inputs={}
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
 p=p.resolve()
 if not p.is_relative_to(REPO) or '.env' in p.parts:raise RuntimeError('Unauthorized input')
 b=p.read_bytes();inputs[str(p.relative_to(REPO))]={'bytes':len(b),'sha256':sha(b)};return b
def data(p):return json.loads(read(p))
def check(n,v):checks.append({'name':n,'pass':bool(v)})
def save(n,o):(OUT/n).write_text(json.dumps(o,indent=2)+'\n')
v1=read(P/'legacy-volume-policy-proposal.md');v2=read(P/'legacy-volume-policy-proposal-v2.md');v3=read(P/'legacy-volume-policy-proposal-v3.md')
for name,b,h in [('v1',v1,'94ab01cb03679e8f92008a874e90cddaaa970e509799bb3c380fbe060f6a028a'),('v2',v2,'88e1b5d650bcf393647b67c9043e811e7d7e7d99891296261be060d64dbc959c'),('v3',v3,'14dd5566f99845a4ee6562404c16610c732795f311b7df1e95ecb306dd599492')]:check(name+' exact announced hash',sha(b)==h)
for rev,h in [('revision1','556fa47d7203d570ea05fcc4879f899ed8d4ead19e24dedf387523128115b83c'),('revision2','b168521916c46327a58a91017426b81a168830fa4e94d0f662a2f17b852864e8')]:
 folder=P/'legacy-volume-policy-review/spec'/rev;f=data(folder/'freeze.json');check(rev+' immutable FAIL freeze',sha(read(folder/'freeze.json'))==h and f['verdict']=='FAIL')
 for n,e in f['outputs'].items():check(rev+' frozen output '+n,sha(read(folder/n))==e['sha256'])
source=read(REPO/'src/observed/allocation-config.ts');check('Source7d unchanged',sha(source)=='7d5798570970ca8de9fcca980b39662c4cf2b9be939e1ad31f23e9383e82fe62')
check('approved Cryptex proposal unchanged',sha(read(P/'cryptex-policy-proposal.md'))=='e8cbff80f2a1610a6e0b4ec1b372086e490f0bc8a8030d6ecf2e5c7105859d13');read(P/'owner-cryptex-trust-decision.json')
root=data(P/'root-legacy-volume-evidence-audit.json');check('exact Root final native companion hash',sha(read(P/'root-legacy-volume-evidence-audit.json'))=='f6399bfaff67ccdb8642ecc1111fe4680d7d0589b03cc632529e3533ee25f1ea')
check('Root4185 successful retained checks',root['checkCount']==len(root['checks'])==4185 and root['allChecksPass'] is True and all(c['pass'] is True for c in root['checks']))
manifest=data(Q/'artifact-hashes.json');check('Root final artifact manifest hash/27 files',sha(read(Q/'artifact-hashes.json'))==root['manifestSha256']=='1c88098c93de02f24e1b813cb1fedf9e92fe18abb28547cc0a005b1648865893' and len(manifest['files'])+1==root['artifactFiles']==27)
for e in manifest['files']:
 b=read(Q/e['path']);check('final diagnostic artifact '+e['path'],len(b)==e['bytes'] and sha(b)==e['sha256'])
prior=data(P/'legacy-volume-policy-review/spec/revision2/evidence-audit.json');check('reuse sealed v2 raw audit, no repeat gates',prior['counts']['checks']==prior['counts']['pass']==1546 and prior['counts']['fail']==0)
r=data(Q/'result.json');precision=data(Q/'identity-precision-audit.json');children=data(Q/'child-receipts.json');patterns=data(Q/'permission-patterns.json')
check('Root exact two typed proof correspondence',root['mountProofs']==[m['proof'] for m in r['mounts']] and len(root['mountProofs'])==2 and all(m['Writable'] is False and m['WritableMedia'] is False and m['WritableVolume'] is False and m['MountPoint']==r['roots'][i] for i,m in enumerate(root['mountProofs'])))
check('unsafe system inode fields qualified, not exact PASS',root['qualifiedSystemIdentityFields']==[{'path':'/usr','fields':['ino']},{'path':'/usr/sbin','fields':['ino']},{'path':'/usr/sbin/diskutil','fields':['ino']}] and precision['exactIntegerPrecisionConfirmed'] is False and set(e['path'] for e in precision['observations'])=={'/usr','/usr/sbin','/usr/sbin/diskutil'})
mounted=[e for e in patterns if any(e['path']==m or e['path'].startswith(m+'/') for m in r['roots'])]
check('Root32 inspected mounted paths safe integer identities',len(mounted)==root['mountedComponentsPassingProposedModes']==32 and all(isinstance(e[f],int) and abs(e[f])<=9007199254740991 for e in mounted for f in ['dev','ino','uid','gid','mode','nlink','size']))
check('manual-only retained counters and prior refusal',r['runtimeFileOpenCount']==r['plutilCount']==r['compatibilityLookupCount']==0 and len(children)==r['invokedChildren']==2 and root['currentCompatibility']=='REFUSED at prior once lookup; not rerun' and root['liveCases']=='L01-L05 UNVERIFIED')
for i,c in enumerate(children):
 for ch in ['stdout','stderr']:
  b=read(Q/c['rawFiles'][ch]);check('child%d raw %s binding'% (i,ch),len(b)==c[ch+'OriginalBytes'] and sha(b)==c[ch+'OriginalSha256'] and c['captureComplete'])
 check('child%d successful actual close fixed query'%i,c['argv']==['/usr/sbin/diskutil','info','-plist',r['roots'][i]] and c['closed'] is True and c['exitCode']==0 and c['signal'] is None and any(e['event']=='close' and e['code']==0 for e in c['events']) and c['stdoutOriginalBytes']==[3092,3093][i] and c['stderrOriginalBytes']==0)
# Recheck only this bounded input set; old1546/3130 audits and gates remain reused.
for rel,e in list(inputs.items()):check('bounded final input recheck '+rel,sha((REPO/rel).read_bytes())==e['sha256'])
save('evidence-audit.json',{'scope':'Bounded revision3 companion/hash audit; prior frozen audits reused, no Source/test/native execution','checks':checks,'counts':{'checks':len(checks),'pass':sum(c['pass'] for c in checks),'fail':sum(not c['pass'] for c in checks),'boundedInputs':len(inputs),'reusedRevision2Checks':1546,'RootRetainedChecks':4185,'nativeArtifacts':27,'rawChildBytes':[3092,3093]},'qualifiedSystemIdentityFields':root['qualifiedSystemIdentityFields'],'limitations':['Exact original system inode integers not certified or recoverable.','Manual typed RO proof is factual; production fresh pre/post proof, runtime identifier and compatibility not established.','Lossless identity/timestamp rules are proposed requirements, not implemented behavior.','Stable missing Volumes preserves old behavior; presence changes must be represented and compared under v3:13/27/37.']})
save('inputs-manifest.json',{'scope':'Only bounded successor inputs; no full previous input/gate rerun','files':inputs})
(OUT/'proposal-v3-frozen.md').write_bytes(v3)
(OUT/'v2-v3.diff').write_text(''.join(difflib.unified_diff(v2.decode().splitlines(keepends=True),v3.decode().splitlines(keepends=True),fromfile='revision2',tofile='revision3')))
for f in OUT.iterdir():
 if f.is_file():f.chmod(0o600)
print(json.dumps({'checks':len(checks),'pass':sum(c['pass'] for c in checks),'inputs':len(inputs),'failures':[c for c in checks if not c['pass']]}))
if any(not c['pass'] for c in checks):raise SystemExit(1)
