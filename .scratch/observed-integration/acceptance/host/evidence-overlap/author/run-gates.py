import os,json,re,time,hashlib,subprocess
from pathlib import Path
os.umask(0o077)
root=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-observed-evidence-overlap')
out=root/'.scratch/observed-integration/acceptance/host/evidence-overlap'
manifest=json.loads((out/'final-source.json').read_text())
def write(name,value):
 p=out/name
 if p.exists(): raise RuntimeError('Refusing evidence overwrite: '+str(p))
 p.write_text(json.dumps(value,indent=2)+'\n')
def audit():
 result={}
 for name,expected in manifest['files'].items():
  raw=(root/name).read_bytes()
  sha=hashlib.sha256(raw).hexdigest()
  blob=subprocess.check_output(['git','hash-object',name],cwd=root,text=True).strip()
  assert sha==expected['sha256'] and blob==expected['gitBlob'],name
  assert raw==(out/'frozen-source'/name).read_bytes(),name
  result[name]={'sha256':sha,'gitBlob':blob,'matches':True}
 return result
write('gate-source-before.json',{'base':manifest['base'],'files':audit()})
env=os.environ.copy();env.pop('TYPESAFE_API_KEY',None)
node26='/opt/homebrew/bin/node'
node24='/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
assert subprocess.check_output([node24,'--version'],text=True).strip()=='v24.0.0'
suites=['tests/observed-evidence.test.ts','tests/observed-service.test.ts','tests/observed-allocation.test.ts','tests/observed-allocation-config.test.ts']
commands=[('focused-node26',[node26,'--import','tsx','--test','--test-concurrency=1',*suites],node26),('focused-node24',[node24,'--import','tsx','--test','--test-concurrency=1',*suites],node24),('coverage',[node26,'--import','tsx','--experimental-test-coverage','--test-coverage-include=src/observed/evidence.ts','--test','--test-concurrency=1',*suites],node26),('full-check',['npm','run','check'],node26)]
try:
 for label,command,version_node in commands:
  log=out/(label+'.log'); assert not log.exists()
  start=time.monotonic()
  with log.open('wb') as stream:
   result=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,umask=0o022)
  raw=log.read_text(errors='replace')
  counts={k:int(v) for k,v in re.findall(r'^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',raw,re.M)}
  receipt={'command':command,'base':manifest['base'],'exit':result.returncode,'seconds':round(time.monotonic()-start,2),'runtime':subprocess.check_output([version_node,'--version'],text=True).strip(),'counts':counts,'log':str(log)}
  write(label+'.json',receipt)
  print(json.dumps({'gate':label,**receipt}),flush=True)
  if result.returncode: raise RuntimeError('Gate failed: '+label)
  assert counts and counts['tests']==counts['pass'] and all(counts[k]==0 for k in ['fail','cancelled','skipped','todo']),(label,counts)
finally:
 write('gate-source-after.json',{'base':manifest['base'],'files':audit()})
