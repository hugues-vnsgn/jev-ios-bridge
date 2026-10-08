import os,json,re,time,hashlib,subprocess
from pathlib import Path
os.umask(0o077)
root=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-observed-evidence-overlap')
out=root/'.scratch/observed-integration/acceptance/host/evidence-overlap'
env=os.environ.copy();env.pop('TYPESAFE_API_KEY',None)
node26='/opt/homebrew/bin/node';node24='/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
name='boot-state polling is no more frequent than once per second and boot is never retried'
commands=[('unchanged-polling-node26',[node26,'--import','tsx','--test','--test-name-pattern='+name,'tests/observed-allocation.test.ts'],node26,True),('unchanged-polling-node24',[node24,'--import','tsx','--test','--test-name-pattern='+name,'tests/observed-allocation.test.ts'],node24,True),('serialized-typecheck',['npm','run','typecheck'],node26,False),('serialized-full-tests',[node26,'--import','tsx','--test','--test-concurrency=1',*[str(p) for p in sorted(Path(root/'tests').glob('*.test.ts'))]],node26,True),('serialized-build',['npm','run','build'],node26,False),('full-check-recheck',['npm','run','check'],node26,True)]
def audit():
 manifest=json.loads((out/'final-source.json').read_text())
 result={}
 for name,expected in manifest['files'].items():
  sha=hashlib.sha256((root/name).read_bytes()).hexdigest()
  blob=subprocess.check_output(['git','hash-object',name],cwd=root,text=True).strip()
  assert sha==expected['sha256'] and blob==expected['gitBlob'],name
  result[name]={'sha256':sha,'gitBlob':blob,'matches':True}
 return result
def write(name,value):
 target=out/name; assert not target.exists(),name
 target.write_text(json.dumps(value,indent=2)+'\n')
write('recheck-source-before.json',audit())
try:
 for label,command,version_node,has_tests in commands:
  log=out/(label+'.log'); assert not log.exists()
  start=time.monotonic()
  with log.open('wb') as stream:
   result=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,umask=0o022)
  raw=log.read_text(errors='replace')
  counts={k:int(v) for k,v in re.findall(r'^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',raw,re.M)}
  receipt={'command':command,'candidate':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'exit':result.returncode,'seconds':round(time.monotonic()-start,2),'runtime':subprocess.check_output([version_node,'--version'],text=True).strip(),'counts':counts}
  write(label+'.json',receipt);print(json.dumps({'gate':label,**receipt}),flush=True)
  if result.returncode: raise RuntimeError('Gate failed: '+label)
  if has_tests:
   assert counts and counts['tests']==counts['pass'] and all(counts[k]==0 for k in ['fail','cancelled','skipped','todo']),(label,counts)
finally:
 write('recheck-source-after.json',audit())
