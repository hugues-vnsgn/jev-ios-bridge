"""Read retained repo evidence only; no implementation or native calls."""
from pathlib import Path
import base64,hashlib,json,os,difflib,xml.etree.ElementTree as ET
os.umask(0o077)
OUT=Path(__file__).resolve().parent
REPO=OUT.parents[7]
P=REPO/'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
Q=P/'operator-legacy-volume-diagnosis'
checks=[];inputs={}
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
 p=p.resolve()
 if not p.is_relative_to(REPO) or '.env' in p.parts:raise RuntimeError('Unauthorized input')
 b=p.read_bytes();inputs[str(p.relative_to(REPO))]={'bytes':len(b),'sha256':sha(b)};return b
def data(p):return json.loads(read(p))
def check(n,v):checks.append({'name':n,'pass':bool(v)})
def save(n,o):(OUT/n).write_text(json.dumps(o,indent=2)+'\n')
v1=read(P/'legacy-volume-policy-proposal.md');v2=read(P/'legacy-volume-policy-proposal-v2.md')
check('v1 unchanged exact hash',sha(v1)=='94ab01cb03679e8f92008a874e90cddaaa970e509799bb3c380fbe060f6a028a')
check('v2 exact announced hash',sha(v2)=='88e1b5d650bcf393647b67c9043e811e7d7e7d99891296261be060d64dbc959c')
old=P/'legacy-volume-policy-review/spec/revision1';freeze=data(old/'freeze.json')
check('revision1 frozen FAIL retained',freeze['verdict']=='FAIL' and sha(read(old/'freeze.json'))=='556fa47d7203d570ea05fcc4879f899ed8d4ead19e24dedf387523128115b83c')
for n,e in freeze['outputs'].items():check('revision1 output '+n,sha(read(old/n))==e['sha256'])
read(P/'cryptex-policy-proposal.md');read(P/'owner-cryptex-trust-decision.json')
source=read(REPO/'src/observed/allocation-config.ts');check('production Source unchanged',sha(source)=='7d5798570970ca8de9fcca980b39662c4cf2b9be939e1ad31f23e9383e82fe62')
art=data(Q/'artifact-hashes.json')
for e in art['files']:
 b=read(Q/e['path']);check('diagnostic artifact '+e['path'],len(b)==e['bytes'] and sha(b)==e['sha256'])
cs=[data(Q/n) for n in ['preservation-before.json','preservation-after.json','preservation-completion.json']]
for g,count in [('source441',441),('compiled69',69),('originalHost15',15),('priorCompatibility693',693),('rootRecords',15),('priorExplicit121',121),('newScripts',4)]:
 rows=[c['groups'][g]['files'] for c in cs]
 maps=[{e['path']:e['expectedSha256'] for e in a} for a in rows]
 check(g+' three preserved hash maps',all(c['groups'][g]['count']==count and c['groups'][g]['allMatch'] and len(c['groups'][g]['files'])==count for c in cs) and maps[0]==maps[1]==maps[2])
 for e in rows[0]:
  b=read(REPO/e['path']);check(g+' current '+e['path'],len(b)==e['bytes'] and sha(b)==e['expectedSha256'])
r=data(Q/'result.json');fs=data(Q/'filesystem-identities.json');children=data(Q/'child-receipts.json');precision=data(Q/'identity-precision-audit.json');cmd=data(Q/'command.json');summary=data(Q/'summary.json');context=data(Q/'context.json');proofs=data(Q/'mount-proofs.json');permissions=data(Q/'permission-summary.json')
check('two exact query roots',r['roots']==['/Library/Developer/CoreSimulator/Volumes/iOS_22G86','/Library/Developer/CoreSimulator/Volumes/iOS_23E254a'] and len(children)==r['invokedChildren']==2 and all(v==1 for v in r['perRootQueryCounts'].values()))
check('no runtime byte/plutil/compatibility call',r['runtimeFileOpenCount']==r['plutilCount']==r['compatibilityLookupCount']==0 and set(e['method'] for e in fs)=={'lstat','readdir'} and r['guardFailures']==[])
check('original stdout/result exact',read(Q/'stdout.txt')==read(Q/'result.json'))
check('filesystem/mount records exact derivatives',r['fsTrace']==fs and r['mounts']==proofs)
check('210 lstat / 2 readdir / two total bundles',len([e for e in fs if e['method']=='lstat'])==210 and len([e for e in fs if e['method']=='readdir'])==2 and r['aggregateRuntimeBundleCount']==2)
check('outer actual close exit0',cmd['code']==0 and cmd['signal'] is None and cmd['captureComplete'] and any(e['event']=='close' and e['code']==0 for e in cmd['events']))
check('product/context fixed',context['fullHead']=='91084c0c065373a978c8437f8f8362c4f5e4dbc9' and context['productSource']=='3edf247ab44d3332bc4bab5f3a43104536d84ce9')
env={'HOME':'/Users/hugues_mini','PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LANG':'C','LC_ALL':'C','DEVELOPER_DIR':'/Applications/Xcode.app/Contents/Developer'}
for i,(c,o,m) in enumerate(zip(children,r['children'],r['mounts'])):
 check('child%d fixed argv/env/limits actual successful close'%i,c['argv']==['/usr/sbin/diskutil','info','-plist',r['roots'][i]] and c['environment']==env and c['shell'] is False and c['timeoutMs']==10000 and c['maxCombinedOutputBytes']==65536 and c['sharedDeadlineMs']==60000 and c['closed'] and c['exitCode']==0 and c['signal'] is None and c['stopReason'] is None and any(e['event']=='close' and e['code']==0 and e['signal'] is None for e in c['events']) and not any(e['event'].startswith('kill') for e in c['events']))
 for channel in ['stdout','stderr']:
  b=read(Q/c['rawFiles'][channel]);check('child%d %s raw complete bytes'% (i,channel),len(b)==c[channel+'OriginalBytes'] and sha(b)==c[channel+'OriginalSha256']==c['rawFiles'][channel+'RetainedSha256'] and b==base64.b64decode(o[channel+'RetainedBase64']) and c['captureComplete'])
 xml=read(Q/c['rawFiles']['stdout']);check('child%d exact raw size'%i,len(xml)==[3092,3093][i] and c['stderrOriginalBytes']==0)
 document=ET.fromstring(xml);nodes=list(document.find('dict'));typed={nodes[j].text:nodes[j+1] for j in range(0,len(nodes),2)}
 check('child%d raw XML exact MountPoint + three literal false tags'%i,typed['MountPoint'].tag=='string' and typed['MountPoint'].text==r['roots'][i] and all(typed[k].tag=='false' for k in ['Writable','WritableMedia','WritableVolume']) and m['proof']=={'MountPoint':r['roots'][i],'Writable':False,'WritableMedia':False,'WritableVolume':False})
mounts=r['roots'];safe_fields=['dev','ino','uid','gid','mode','nlink','size'];unsafe=[]
for e in fs:
 if e['method']!='lstat':continue
 s=e['identity']
 for f in safe_fields:
  if not isinstance(s[f],int) or abs(s[f])>9007199254740991:unsafe.append((e['path'],f,s[f]))
 if any(e['path']==m or e['path'].startswith(m+'/') for m in mounts):
  mount=next(m for m in mounts if e['path']==m or e['path'].startswith(m+'/'));root=next(x for x in fs if x['path']==mount and x['method']=='lstat')['identity']
  rt=e['path'].endswith('.simruntime/Contents/Resources/RuntimeRoot');mode=s['mode']&0o7777
  allowed=([0o444,0o644,0o664] if s['type']=='file' else [0o755,0o775,0o1775] if rt else [0o755,0o775])
  check('mounted predicate sequence%d'%e['sequence'],s['uid']==0 and s['gid'] in [0,80] and mode in allowed and s['dev']==root['dev'] and not s['isSymbolicLink'] and (s['type']=='directory' or (s['type']=='file' and s['nlink']==1 and s['size']<=65536)) and all(isinstance(s[f],int) and abs(s[f])<=9007199254740991 for f in safe_fields))
check('unsafe identity fields exactly qualified system inodes',set((p,f) for p,f,v in unsafe)=={('/usr','ino'),('/usr/sbin','ino'),('/usr/sbin/diskutil','ino')} and precision['exactIntegerPrecisionConfirmed'] is False and set((e['path'],e['field']) for e in precision['observations'])==set((p,f) for p,f,v in unsafe))
check('manual complete status does not certify exact system identity',r['status']=='COMPLETE_TWO_MOUNT_DIAGNOSIS' and r['uncertainty'] is None and precision['exactIntegerPrecisionConfirmed'] is False)
save('evidence-audit.json',{'scope':'Retained-only bounded successor evidence audit; no tests/Source/native calls','checks':checks,'counts':{'checks':len(checks),'pass':sum(x['pass'] for x in checks),'fail':sum(not x['pass'] for x in checks),'operatorArtifacts':len(art['files']),'nativeChildren':2,'lstatEvents':210,'readdirEvents':2,'runtimeByteCalls':0,'plutilCalls':0,'compatibilityCalls':0},'unsafeIdentityObservations':precision['observations'],'qualifications':['Numeric /usr inode values are not exact recoverable integers; no original system inode certification.','Two raw mount XML typed RO proofs and mounted permission observations are independently confirmed.','One query per mount and manual metadata inspection do not satisfy implementation fresh pre/post proofs or runtime metadata identifier/compatibility.','Root final native evidence audit pending at initial capture; proposal-only review grants no owner/implementation/live approval.']})
save('inputs-manifest.json',{'files':inputs})
(OUT/'proposal-v1-frozen.md').write_bytes(v1);(OUT/'proposal-v2-frozen.md').write_bytes(v2)
(OUT/'v1-v2.diff').write_text(''.join(difflib.unified_diff(v1.decode().splitlines(keepends=True),v2.decode().splitlines(keepends=True),fromfile='revision1',tofile='revision2')))
for f in OUT.iterdir():
 if f.is_file():f.chmod(0o600)
print(json.dumps({'checks':len(checks),'pass':sum(x['pass'] for x in checks),'failures':[x for x in checks if not x['pass']],'inputs':len(inputs)}))
if any(not x['pass'] for x in checks):raise SystemExit(1)
