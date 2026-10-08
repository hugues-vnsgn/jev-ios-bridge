import os,json,re,time,hashlib,subprocess
from pathlib import Path
os.umask(0o077)
root=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
out=root/'.scratch/observed-integration/acceptance/host/evidence-overlap/integration';out.mkdir(mode=0o700,parents=True,exist_ok=True)
candidate='d0a6d7efef9fc0d55324e3803207fb2dffdfaf18'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==candidate
author=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-observed-evidence-overlap/.scratch/observed-integration/acceptance/host/evidence-overlap')
runtime=json.loads((root/'.scratch/observed-integration/acceptance/host/runtime/repair/final-source.json').read_text())['files']
if isinstance(runtime,list):runtime={item['path']:item for item in runtime}
allocator=json.loads((root/'.scratch/observed-integration/acceptance/host/allocator/round3/final-source.json').read_text())['files']
repair=json.loads((author/'final-source.json').read_text())['files']
files={**runtime,**allocator,**repair}
def write(name,value):
 target=out/name;assert not target.exists(),name;target.write_text(json.dumps(value,indent=2)+'\n')
def audit():
 result={}
 for name,expected in files.items():
  raw=(root/name).read_bytes();sha=hashlib.sha256(raw).hexdigest()
  blob=subprocess.check_output(['git','hash-object',name],cwd=root,text=True).strip()
  committed=subprocess.check_output(['git','rev-parse',candidate+':'+name],cwd=root,text=True).strip()
  assert sha==expected.get('sha256',expected.get('sha')) and blob==committed==expected.get('gitBlob',expected.get('blob')),name
  result[name]={'sha256':sha,'gitBlob':blob,'matches':True}
 return {'integratedCommit':candidate,'sameCommitAsRootAuthorGate':True,'files':result}
write('source-audit-before.json',audit())
env=os.environ.copy();env.pop('TYPESAFE_API_KEY',None)
node26='/opt/homebrew/bin/node';node24='/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
commands=[('node26',[node26,'--import','tsx','--test','tests/observed-evidence.test.ts'],node26,True),('node24',[node24,'--import','tsx','--test','tests/observed-evidence.test.ts'],node24,True),('typecheck',['npm','run','typecheck'],node26,False),('build',['npm','run','build'],node26,False)]
try:
 for label,command,node,has_tests in commands:
  log=out/(label+'.log');assert not log.exists();began=time.monotonic()
  with log.open('wb') as stream:result=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,umask=0o022)
  counts={k:int(v) for k,v in re.findall(r'^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',log.read_text(errors='replace'),re.M)}
  receipt={'command':command,'integratedCommit':candidate,'exit':result.returncode,'seconds':round(time.monotonic()-began,2),'runtime':subprocess.check_output([node,'--version'],text=True).strip(),'counts':counts}
  write(label+'.json',receipt);print(json.dumps({'gate':label,'exit':result.returncode,'counts':counts}),flush=True)
  assert result.returncode==0,label
  if has_tests:assert counts['tests']==counts['pass'] and all(counts[k]==0 for k in ['fail','cancelled','skipped','todo']),label
finally:write('source-audit-after.json',audit())
target=out/'run-gates.py';assert not target.exists();target.write_bytes(Path(__file__).read_bytes())
