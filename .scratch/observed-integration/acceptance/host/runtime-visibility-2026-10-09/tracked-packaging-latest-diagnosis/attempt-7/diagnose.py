from pathlib import Path
import datetime,hashlib,json,os,signal,subprocess,time
os.umask(0o077);E=Path(__file__).resolve().parent;R=E.parents[2]
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def put(name,v):
 with (E/name).open('x') as f:json.dump(v,f,indent=2);f.write('\n')
def group(pgid):
 try:os.killpg(pgid,0);return True
 except ProcessLookupError:return False
prior=R/'.scratch/installed-tracked-packaging-recheck/runs/tracked-packaging-recheck-node26/installed-proof/plugin'
for name in ['project','home','npm-cache']:(E/name).mkdir(mode=0o700)
inputs={}
for name in ['package.json','package-lock.json']:
 p=prior/name;inputs[str(p)]=sha(p);(E/'project'/name).write_bytes(p.read_bytes())
assert sha(E/'project/package-lock.json')=='be79b19a3f7891e340fcd123fe751260a4492a577e0bda22398325e6ea368cd7'
for name in ['user.npmrc','global.npmrc']:(E/name).touch(mode=0o600,exist_ok=False)
node='/opt/homebrew/Cellar/node/26.8.1/bin/node';npm='/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js'
assert sha(node)=='902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253';assert sha(npm)=='8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7'
env={'HOME':str(E/'home'),'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','NPM_CONFIG_USERCONFIG':str(E/'user.npmrc'),'NPM_CONFIG_GLOBALCONFIG':str(E/'global.npmrc'),'NPM_CONFIG_CACHE':str(E/'npm-cache'),'npm_config_fetch_retries':'0','npm_config_fetch_timeout':'45000'}
argv=[node,npm,'ci','--ignore-scripts','--no-audit','--no-fund'];row={'argv':argv,'cwd':str(E/'project'),'environment':env,'inputs':inputs,'startedAtUtc':now(),'deadlineSeconds':90,'timerFired':False,'signals':[],'actualClose':False,'scope':'One isolated reproduction; only package/lock copied; no acceptance retry or Source edit.'};start=time.monotonic()
with (E/'stdout.txt').open('xb') as out,(E/'stderr.txt').open('xb') as err:
 child=subprocess.Popen(argv,cwd=E/'project',env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True);pgid=os.getpgid(child.pid);assert pgid==child.pid==os.getsid(child.pid);row.update(pid=child.pid,pgid=pgid);put('launch.json',row)
 try:row['exitCode']=child.wait(timeout=90);row['actualClose']=True
 except subprocess.TimeoutExpired:
  row['timerFired']=True;row['timerAtUtc']=now();assert child.returncode is None and os.getpgid(child.pid)==pgid and os.getsid(child.pid)==child.pid
  for number,pause in [(signal.SIGTERM,2),(signal.SIGKILL,0)]:
   event={'signal':signal.Signals(number).name,'atUtc':now(),'targetPgid':pgid,'reservedUnreapedLeader':child.returncode is None}
   try:os.killpg(pgid,number);event['delivery']='sent'
   except ProcessLookupError:event['delivery']='already absent'
   row['signals'].append(event)
   if pause:time.sleep(pause)
  try:row['exitCode']=child.wait(timeout=5);row['actualClose']=True
  except subprocess.TimeoutExpired:row['uncertainty']='No actual close within5s after owned-group KILL; no more signals/retry'
 row['closedOrCapturedAtUtc']=now();row['durationSeconds']=time.monotonic()-start
 until=time.monotonic()+5
 while group(pgid) and time.monotonic()<until:time.sleep(.05)
 row['groupAbsent']=not group(pgid)
row['stdoutSha256']=sha(E/'stdout.txt');row['stderrSha256']=sha(E/'stderr.txt');row['rawBytes']={name:(E/name).stat().st_size for name in ['stdout.txt','stderr.txt']};row['packageLockUnchanged']=all(sha(E/'project'/Path(p).name)==h for p,h in inputs.items());put('result.json',row)
# Seal only after settlement; an uncertain process may still write raw evidence.
if row['actualClose'] and row['groupAbsent']:
 files={};links={}
 for directory,dirs,names in os.walk(E,followlinks=False):
  Path(directory).chmod(0o700)
  for name in list(dirs):
   p=Path(directory)/name
   if p.is_symlink():links[p.relative_to(E).as_posix()]=os.readlink(p);dirs.remove(name)
  for name in names:
   p=Path(directory)/name;k=p.relative_to(E).as_posix()
   if p.is_symlink():links[k]=os.readlink(p)
   else:assert p.stat().st_nlink==1;p.chmod(0o600);files[k]={'sha256':sha(p),'bytes':p.stat().st_size}
 put('seal.json',{'regularFiles':files,'symlinksNotFollowed':links,'selfExclusion':'seal.json','rawFinal':True,'qualification':'Single plain concurrent npm installation; passing does not explain historical failures.'})
 print(json.dumps({'sealSha256':sha(E/'seal.json'),'resultSha256':sha(E/'result.json')}),flush=True)
print(json.dumps({k:row[k] for k in ['exitCode','actualClose','groupAbsent','durationSeconds','timerFired','rawBytes','packageLockUnchanged'] if k in row}),flush=True)
