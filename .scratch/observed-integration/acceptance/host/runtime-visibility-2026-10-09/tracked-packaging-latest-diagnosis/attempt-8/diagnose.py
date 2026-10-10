from pathlib import Path
import base64,datetime,hashlib,json,os,re,shutil,signal,subprocess,threading,time
os.umask(0o077);E=Path(__file__).resolve().parent;R=E.parents[2];P=R/'.scratch/installed-tracked-packaging-after-diagnosis/runs/tracked-packaging-after-diagnosis-node26/installed-proof'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def put(path,v):
 with Path(path).open('x') as f:json.dump(v,f,indent=2);f.write('\n')
def group(pgid):
 try:os.killpg(pgid,0);return True
 except ProcessLookupError:return False
node='/opt/homebrew/Cellar/node/26.8.1/bin/node';npm='/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js'
assert sha(node)=='902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253';assert sha(npm)=='8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7'
pluginlock=json.loads((P/'plugin/package-lock.json').read_text());cleanlock=json.loads((P/'clean/package-lock.json').read_text());assert sha(P/'plugin/package-lock.json')=='be79b19a3f7891e340fcd123fe751260a4492a577e0bda22398325e6ea368cd7'
inputs={str(p):sha(p) for p in [P/'plugin/package.json',P/'plugin/package-lock.json',P/'clean/package-lock.json',P/'jev-ios-bridge-1.3.1.tgz']};put(E/'input-bindings.json',inputs)
def scope(name):
 d=E/name;d.mkdir(mode=0o700);proof=d/'installed-proof';proof.mkdir(mode=0o700);(proof/'registry-cache').mkdir(mode=0o700);(d/'outer-npm-cache').mkdir(mode=0o700)
 for file in ['user.npmrc','global.npmrc']:(d/file).touch(mode=0o600,exist_ok=False)
 env={'HOME':'/Users/hugues_mini','LANG':'C','LC_ALL':'C','PATH':str(Path(node).parent)+':'+str(Path(node).parent)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','NPM_CONFIG_USERCONFIG':str(d/'user.npmrc'),'NPM_CONFIG_GLOBALCONFIG':str(d/'global.npmrc'),'NPM_CONFIG_CACHE':str(d/'outer-npm-cache'),'JEV_PACKAGING_EVIDENCE_DIR':str(proof),'npm_config_cache':str(proof/'registry-cache'),'npm_config_fetch_retries':'0','npm_config_fetch_timeout':'45000'}
 assert Path(shutil.which('npm',path=env['PATH'])).resolve()==Path(npm).resolve()
 project=proof/'plugin';project.mkdir(mode=0o700)
 for file in ['package.json','package-lock.json']:(project/file).write_bytes((P/'plugin'/file).read_bytes())
 return d,proof,project,env
rows=[]
def run(label,args,cwd,env,d):
 row={'label':label,'argv':['npm',*args],'cwd':str(cwd),'environment':env,'startedAtUtc':now(),'childUmask':'0022','stdio':'ignore,pipe,pipe; concurrent drain threads','timerSeconds':90,'timerFired':False,'signals':[],'actualClose':False};start=time.monotonic();errors=[]
 with (d/(label+'.stdout')).open('xb') as out,(d/(label+'.stderr')).open('xb') as err:
  child=subprocess.Popen(row['argv'],cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,umask=0o022);pgid=os.getpgid(child.pid);assert pgid==child.pid==os.getsid(child.pid);row.update(pid=child.pid,pgid=pgid);put(d/(label+'-launch.json'),row)
  def drain(pipe,file):
   try:
    while True:
     chunk=pipe.read(65536)
     if not chunk:break
     file.write(chunk);file.flush()
   except Exception as ex:errors.append(str(ex))
  threads=[threading.Thread(target=drain,args=(child.stdout,out),daemon=True),threading.Thread(target=drain,args=(child.stderr,err),daemon=True)]
  for thread in threads:thread.start()
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
   except subprocess.TimeoutExpired:row['uncertainty']='No actualclose after boundedKILL wait'
  row['closedOrCapturedAtUtc']=now();row['durationSeconds']=time.monotonic()-start
  until=time.monotonic()+5
  while group(pgid) and time.monotonic()<until:time.sleep(.05)
  row['groupAbsent']=not group(pgid)
  for thread in threads:thread.join(timeout=5)
  row['pipesDrained']=not any(thread.is_alive() for thread in threads) and not errors;row['drainErrors']=errors
 row['stdoutSha256']=sha(d/(label+'.stdout'));row['stderrSha256']=sha(d/(label+'.stderr'));row['pass']=row.get('exitCode')==0 and row['actualClose'] and row['groupAbsent'] and row['pipesDrained'] and not row['timerFired'];put(d/(label+'-result.json'),row);rows.append(row);print(json.dumps({k:row[k] for k in ['label','pass','exitCode','actualClose','groupAbsent','pipesDrained','durationSeconds','timerFired'] if k in row}),flush=True);return row['pass']
def vectors(lock):return {p:{k:v[k] for k in ['resolved','integrity','version'] if k in v} for p,v in lock['packages'].items()}
def cache_snapshot(proof,when):
 cache=proof/'registry-cache/_cacache';states={}
 for path,v in pluginlock['packages'].items():
  if 'integrity' not in v or 'resolved' not in v:continue
  alg,value=v['integrity'].split('-',1);h=base64.b64decode(value).hex();blob=cache/'content-v2'/alg/h[:2]/h[2:4]/h[4:];states[path]={'url':v['resolved'],'integrity':v['integrity'],'present':blob.exists(),'verified':blob.exists() and base64.b64encode(hashlib.sha512(blob.read_bytes()).digest()).decode()==value}
 put(proof.parent/(when+'-plugin-cache.json'),states)
cd,cp,project,env=scope('cold');cache_snapshot(cp,'before');cold=run('cold-plugin',['ci','--ignore-scripts','--no-audit','--no-fund'],project,env,cd);cache_snapshot(cp,'after');stop='Cold plugin failure; warm stages not run'
if cold:
 wd,wp,wproject,wenv=scope('warm');clean=wp/'clean';clean.mkdir(mode=0o700);(clean/'package.json').write_text('{"name":"isolated-installed-proof","private":true,"version":"1.0.0"}');tar=wp/'jev-ios-bridge-1.3.1.tgz';tar.write_bytes((P/'jev-ios-bridge-1.3.1.tgz').read_bytes());assert sha(tar)==inputs[str(P/'jev-ios-bridge-1.3.1.tgz')]
 seed=run('warm-seed',['install','--ignore-scripts','--no-audit','--no-fund',str(tar)],clean,wenv,wd);stop='Warm seed failure; warm plugin not run'
 if seed:
  actual=json.loads((clean/'package-lock.json').read_text());match=vectors(actual)==vectors(cleanlock);put(wd/'seed-lock-binding.json',{'allDependencyURLsIntegritiesVersionsMatch':match,'expectedLockSha256':sha(P/'clean/package-lock.json'),'actualLockSha256':sha(clean/'package-lock.json'),'expected':vectors(cleanlock),'actual':vectors(actual),'localLocatorRebaseNeeded':False});stop='Warm seed dependency-vector mismatch; plugin not run'
  if match:
   cache_snapshot(wp,'before');warm=run('warm-plugin',['ci','--ignore-scripts','--no-audit','--no-fund'],wproject,wenv,wd);cache_snapshot(wp,'after');stop='All three commands complete; no further execution'
put(E/'summary.json',{'status':stop,'results':rows,'qualification':'At most3 isolated npm commands. Exact original child env/PATH/cache aliases/accountHOME/umask022/piped output held. No instrumentation/manual cache seeding/acceptance retry. Warm cache, if reached, created only by exact original clean install. Root deadline provenance is diagnostic; original helper signal provenance remains historicalunknown.'})
if all(x['actualClose'] and x['groupAbsent'] and x['pipesDrained'] for x in rows):
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
 put(E/'seal.json',{'regularFiles':files,'symlinksNotFollowed':links,'selfExclusion':'seal.json','rawFinal':True});print(json.dumps({'sealSha256':sha(E/'seal.json'),'summarySha256':sha(E/'summary.json')}),flush=True)
