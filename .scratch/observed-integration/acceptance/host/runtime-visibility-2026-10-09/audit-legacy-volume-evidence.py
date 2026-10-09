from pathlib import Path
import datetime, hashlib, json, os, stat, subprocess

os.umask(0o077)
repo = Path.cwd()
parent = repo / '.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09'
ev = parent / 'operator-legacy-volume-diagnosis'
roots = ['/Library/Developer/CoreSimulator/Volumes/iOS_22G86', '/Library/Developer/CoreSimulator/Volumes/iOS_23E254a']
checks = []
def check(name, ok):
    checks.append({'name': name, 'pass': bool(ok)})
    if not ok: raise AssertionError(name)
def data(name): return json.loads((ev / name).read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def stable(a,b): return [{k:v for k,v in row.items() if k != 'sequence'} for row in a] == [{k:v for k,v in row.items() if k != 'sequence'} for row in b]

manifest = data('artifact-hashes.json')
for row in manifest['files']:
    p = ev / row['path']; s = p.lstat()
    check('artifact '+row['path'], stat.S_ISREG(s.st_mode) and not p.is_symlink() and stat.S_IMODE(s.st_mode)==0o600 and s.st_size==row['bytes'] and digest(p)==row['sha256'])
for row in manifest['directories']:
    p=ev/row['path']; s=p.lstat()
    check('private directory '+row['path'], stat.S_ISDIR(s.st_mode) and not p.is_symlink() and stat.S_IMODE(s.st_mode)==0o700)
check('manifest private', stat.S_IMODE((ev/'artifact-hashes.json').lstat().st_mode)==0o600)

for name in ['preservation-before.json','preservation-after.json','preservation-completion.json']:
    preserved=data(name); check(name+' overall', preserved['allMatch'] and preserved['mismatches']==[])
    for group, batch in preserved['groups'].items():
        check(name+' '+group+' count', len(batch['files'])==batch['count'] and batch['allMatch'])
        for row in batch['files']:
            p=repo/row['path']
            check(name+' '+row['path'], row['match'] and row['expectedSha256']==row['actualSha256']==digest(p) and p.stat().st_size==row['bytes'])

children=data('child-receipts.json'); check('two once children', len(children)==2 and [c['root'] for c in children]==roots)
for c in children:
    check('fixed argv '+c['root'], c['argv']==['/usr/sbin/diskutil','info','-plist',c['root']] and c['shell'] is False and c['cwd']==str(repo))
    check('close and budget '+c['root'], c['exitCode']==0 and c['signal'] is None and c['closed'] and c['stopReason'] is None and c['captureComplete'] and c['timeoutMs']==10000 and c['maxCombinedOutputBytes']==65536 and c['sharedDeadlineMs']==60000)
    check('exit/close events '+c['root'], [e['event'] for e in c['events']].count('exit')==1 and [e['event'] for e in c['events']].count('close')==1 and not any(e['event'].startswith('kill') for e in c['events']))
    for channel in ['stdout','stderr']:
        p=ev/c['rawFiles'][channel]
        check('raw '+c['root']+' '+channel, p.stat().st_size==c[channel+'OriginalBytes']==c['rawFiles'][channel+'RetainedBytes'] and digest(p)==c[channel+'OriginalSha256']==c['rawFiles'][channel+'RetainedSha256'] and c['rawFiles']['complete'] and c['rawFiles']['redaction']=='none')
check('children serial', children[0]['closedAtUtc'] <= children[1]['atUtc'])

# Pure parse of two repository binaries; this never queries installed metadata.
script="""import {readFile} from 'node:fs/promises';
import {parseReadonlyMountMetadata} from './dist/observed/installed-plist.js';
const p='.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-legacy-volume-diagnosis/children/';
const roots=['/Library/Developer/CoreSimulator/Volumes/iOS_22G86','/Library/Developer/CoreSimulator/Volumes/iOS_23E254a'];
const values=[];for(let i=0;i<2;i++)values.push(parseReadonlyMountMetadata((await readFile(p+String(i).padStart(2,'0')+'.stdout.bin')).toString('utf8'),roots[i]));
console.log(JSON.stringify(values));"""
env={k:v for k,v in os.environ.items() if k not in ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS']}
parsed=subprocess.run(['/opt/homebrew/Cellar/node/26.8.1/bin/node','--input-type=module','-e',script],cwd=repo,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
check('pure shipped parser exit', parsed.returncode==0 and parsed.stderr==b'')
proofs=json.loads(parsed.stdout)
for i, proof in enumerate(proofs): check('exact typed readonly proof '+roots[i], proof=={'MountPoint':roots[i],'Writable':False,'WritableMedia':False,'WritableVolume':False})

mounts=data('mount-proofs.json')
for i,m in enumerate(mounts):
    check('mount proof retained '+m['root'], m['root']==roots[i] and m['proof']==proofs[i] and m['queryStable'] and stable(m['rootBefore'],m['rootAfter']))
    check('runtime listing identity '+m['root'], m['runtimeListing']['stable'] and stable(m['runtimeListing']['before'],m['runtimeListing']['after']) and len(m['runtimeListing']['entries'])<=1000)
    for b in m['runtimeBundles']: check('bundle identity '+b['bundlePath'], b['stable'] and stable(b['before'],b['after']))

patterns=data('permission-patterns.json'); qualified=[]; mounted=0
for row in patterns:
    root=next((r for r in roots if row['path']==r or row['path'].startswith(r+'/')),None)
    unsafe=[k for k in ['dev','ino','uid','gid','mode','size','nlink'] if not isinstance(row[k],int) or abs(row[k])>2**53-1]
    if unsafe: qualified.append({'path':row['path'],'fields':unsafe})
    if not root: continue
    mounted+=1; mountDev=next(x['dev'] for x in patterns if x['path']==root)
    runtimeRoot=row['path'].endswith('.simruntime/Contents/Resources/RuntimeRoot')
    modes=[0o444,0o644,0o664] if row['type']=='file' else [0o755,0o775,0o1775] if runtimeRoot else [0o755,0o775]
    check('proposed mounted policy '+row['path'], not unsafe and not row['isSymbolicLink'] and row['uid']==0 and row['gid'] in [0,80] and row['dev']==mountDev and (row['mode']&0o7777) in modes and (row['type']=='directory' or row['type']=='file' and row['nlink']==1 and row['size']<=65536))
check('qualified unsafe system inode paths only', qualified==[{'path':'/usr','fields':['ino']},{'path':'/usr/sbin','fields':['ino']},{'path':'/usr/sbin/diskutil','fields':['ino']}])
check('precision qualification preserved', data('identity-precision-audit.json')['exactIntegerPrecisionConfirmed'] is False)
summary=data('summary.json'); result=data('result.json'); command=data('command.json')
check('manual-only scope', summary['nativeChildren']==2 and summary['runtimeFileOpenCount']==summary['plutilCount']==summary['compatibilityLookupCount']==0 and result['guardFailures']==[] and result['aggregateRuntimeBundleCount']==2 and result['lstatEventCount']==210)
check('wrapper confirmed close', command['code']==0 and command['signal'] is None and command['captureComplete'] and command['events'][-1]['event']=='close')
check('same full HEAD', data('head-after.json')['head']=='91084c0c065373a978c8437f8f8362c4f5e4dbc9')
out={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Retained repository evidence audit; two typed readonly mount proofs PASS, exact system inode identities QUALIFIED; not production compatibility or live acceptance','checks':checks,'checkCount':len(checks),'allChecksPass':True,'artifactFiles':len(manifest['files'])+1,'manifestSha256':digest(ev/'artifact-hashes.json'),'pureParserInputs':'Only two retained repository stdout binaries; no native metadata query','mountProofs':proofs,'mountedComponentsPassingProposedModes':mounted,'qualifiedSystemIdentityFields':qualified,'currentCompatibility':'REFUSED at prior once lookup; not rerun','liveCases':'L01-L05 UNVERIFIED'}
p=parent/'root-legacy-volume-evidence-audit.json';p.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'checkCount':len(checks),'artifactFiles':out['artifactFiles'],'qualifiedSystemIdentityFields':qualified,'auditSha256':digest(p)}))
