import base64,datetime,hashlib,json,os,signal,subprocess,time
from pathlib import Path
E=Path(__file__).resolve().parent;R=E.parents[2];os.umask(0o077)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def put(name,v):
 with (E/name).open('x') as f:json.dump(v,f,indent=2);f.write('\n')
def exists(pgid):
 try:os.killpg(pgid,0);return True
 except ProcessLookupError:return False
lock=R/'.scratch/installed-tracked-packaging-recheck/runs/tracked-packaging-recheck-node26/installed-proof/plugin/package-lock.json'
assert sha(lock)=='be79b19a3f7891e340fcd123fe751260a4492a577e0bda22398325e6ea368cd7'
entry=json.loads(lock.read_text())['packages']['node_modules/es-module-lexer'];url=entry['resolved'];assert url=='https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-3.0.2.tgz'
for name in ['home','npm-cache']:(E/name).mkdir(mode=0o700)
for name in ['user.npmrc','global.npmrc']:(E/name).touch(mode=0o600,exist_ok=False)
node='/opt/homebrew/Cellar/node/26.8.1/bin/node';npm='/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js'
assert sha(node)=='902b6a6984d5d825829ea9064ab73b734548df37bc0683990dca31c8dc2a9253';assert sha(npm)=='8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7'
env={'HOME':str(E/'home'),'PATH':str(Path(node).parent)+':/usr/bin:/bin','LANG':'C','LC_ALL':'C','NPM_CONFIG_USERCONFIG':str(E/'user.npmrc'),'NPM_CONFIG_GLOBALCONFIG':str(E/'global.npmrc'),'NPM_CONFIG_CACHE':str(E/'npm-cache')}
commands=[('curl',['/usr/bin/curl','--disable','--silent','--show-error','--fail','--connect-timeout','10','--max-time','45','--retry','0','--max-filesize','10485760','--proto','=https','--dump-header',str(E/'curl.headers'),'--output',str(E/'curl.tgz'),'--write-out','%{json}\n',url]),('npm',[node,npm,'cache','add',url,'--ignore-scripts','--no-audit','--no-fund','--fetch-retries=0','--fetch-timeout=45000','--loglevel=silly'])]
rows=[]
for label,argv in commands:
 row={'label':label,'argv':argv,'environment':env,'cwd':str(E),'startedAtUtc':now(),'lockSha256':sha(lock),'expectedIntegrity':entry['integrity'],'timeoutSeconds':90 if label=='npm' else None,'signals':[],'timerFired':False,'actualClose':False};start=time.monotonic()
 with (E/(label+'.stdout')).open('xb') as out,(E/(label+'.stderr')).open('xb') as err:
  child=subprocess.Popen(argv,cwd=E,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True);pgid=os.getpgid(child.pid);assert pgid==child.pid==os.getsid(child.pid);row.update(pid=child.pid,pgid=pgid);put(label+'-launch.json',row)
  try:row['exitCode']=child.wait(timeout=90 if label=='npm' else None);row['actualClose']=True
  except subprocess.TimeoutExpired:
   row['timerFired']=True;row['timerAtUtc']=now();assert child.returncode is None and os.getpgid(child.pid)==pgid and os.getsid(child.pid)==child.pid
   for number,pause in [(signal.SIGTERM,2),(signal.SIGKILL,0)]:
    event={'signal':signal.Signals(number).name,'atUtc':now(),'targetPgid':pgid,'reservedUnreapedLeader':child.returncode is None}
    try:os.killpg(pgid,number);event['delivery']='sent'
    except ProcessLookupError:event['delivery']='already absent'
    row['signals'].append(event)
    if pause:time.sleep(pause)
   try:row['exitCode']=child.wait(timeout=5);row['actualClose']=True
   except subprocess.TimeoutExpired:row['uncertainty']='No actual close within5s after owned-group KILL; no more signals or retry'
  row['closedOrCapturedAtUtc']=now();row['durationSeconds']=time.monotonic()-start
  until=time.monotonic()+5
  while exists(pgid) and time.monotonic()<until:time.sleep(.05)
  row['groupAbsent']=not exists(pgid)
 row['stdoutSha256']=sha(E/(label+'.stdout'));row['stderrSha256']=sha(E/(label+'.stderr'))
 if label=='curl':body=E/'curl.tgz'
 else:
  alg,digest=entry['integrity'].split('-',1);h=base64.b64decode(digest).hex();body=E/'npm-cache/_cacache/content-v2'/alg/h[:2]/h[2:4]/h[4:]
 row['payloadPresent']=body.exists();row['integrityMatches']=body.exists() and 'sha512-'+base64.b64encode(hashlib.sha512(body.read_bytes()).digest()).decode()==entry['integrity'];row['payloadPath']=str(body)
 put(label+'-result.json',row);rows.append(row);print(json.dumps({k:row[k] for k in ['label','exitCode','actualClose','groupAbsent','durationSeconds','timerFired','integrityMatches'] if k in row}),flush=True)
 if not row['actualClose'] or not row['groupAbsent']:break
put('summary.json',{'status':'BOUNDED_PAIR_COMPLETE' if len(rows)==2 else 'STOPPED_ON_SETTLEMENT_UNCERTAINTY','results':rows,'qualification':'Serial client diagnosis only. Even if both pass, historical concurrent npm installation delay remains unresolved. No project installation, extraction, Source mutation, cache seeding of acceptance runs or full-proof retry.'})
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
put('seal.json',{'regularFiles':files,'symlinksNotFollowed':links,'selfExclusion':'seal.json','rawFinal':all(x['actualClose'] and x['groupAbsent'] for x in rows)})
print(json.dumps({'sealSha256':sha(E/'seal.json'),'summarySha256':sha(E/'summary.json')}),flush=True)
