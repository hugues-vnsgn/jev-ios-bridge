import os,sys,json,re,time,hashlib,subprocess
from pathlib import Path
os.umask(0o077)
root=Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic')
candidate=sys.argv[1]
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
out=root/'.scratch/observed-integration/acceptance/host/allocator/integration'
out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((root/'.scratch/observed-integration/acceptance/host/allocator/round3/final-source.json').read_text())
runtime=json.loads((root/'.scratch/observed-integration/acceptance/host/runtime/repair/final-source.json').read_text())
runtime_files=runtime['files']
if isinstance(runtime_files,list): runtime_files={v['path']:v for v in runtime_files}
files={**runtime_files,**manifest['files']}
def write(name,value):
 p=out/name
 if p.exists(): raise RuntimeError('Refusing evidence overwrite: '+str(p))
 p.write_text(json.dumps(value,indent=2)+'\n')
def audit():
 result={}
 for name,expected in files.items():
  raw=(root/name).read_bytes()
  sha=hashlib.sha256(raw).hexdigest()
  blob=subprocess.check_output(['git','hash-object',name],cwd=root,text=True).strip()
  commit=candidate if name in manifest['files'] else 'a898e80bf3d0d5af7b17618f9fcec56695174289'
  pinned=subprocess.check_output(['git','rev-parse',commit+':'+name],cwd=root,text=True).strip()
  e_sha=expected.get('sha256',expected.get('sha'))
  e_blob=expected.get('gitBlob',expected.get('blob'))
  assert sha==e_sha and blob==e_blob==pinned,(name,expected,sha,blob,pinned)
  result[name]={'sha256':sha,'gitBlob':blob,'candidate':commit,'matches':True}
 return result
write('source-audit-before.json',{'integratedCommit':head,'candidate':candidate,'files':audit()})
env=os.environ.copy()
env.pop('TYPESAFE_API_KEY',None)
node26='/opt/homebrew/bin/node'
node24='/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'
assert subprocess.check_output([node24,'--version'],text=True).strip()=='v24.0.0'
suites=['tests/observed-allocation.test.ts','tests/observed-allocation-config.test.ts','tests/admission-allocation.test.ts','tests/admission-core.test.ts','tests/admission-migration.test.ts','tests/admission-driver.test.ts','tests/observed-sources.test.ts','tests/observed-artifact.test.ts','tests/device.test.ts','tests/simulator-window.test.ts','tests/android-driver.test.ts','tests/observed-service.test.ts','tests/observed-schema.test.ts','tests/observed-evidence.test.ts','tests/observed-journal.test.ts','tests/observed-tap.test.ts','tests/observed-run.test.ts']
proof=out/'interface-check.ts'
proof.write_text("import type { ObservedAllocator as AllocatorPort } from '../../../../../../src/observed/service.js';\nimport type { ObservedAllocator as AllocatorImplementation } from '../../../../../../src/observed/allocation.js';\nimport type { AllocationResult } from '../../../../../../src/observed/allocation-schema.js';\ndeclare const implementation: AllocatorImplementation;\nconst composition: AllocatorPort<AllocationResult> = implementation;\nvoid composition;\n")
write('interface-tsconfig.json',{'extends':'../../../../../../tsconfig.json','include':['interface-check.ts']})
commands=[('interface',['node','node_modules/typescript/bin/tsc','--noEmit','--project',str(out/'interface-tsconfig.json')],node26),('node26',[node26,'--import','tsx','--test','--test-concurrency=1',*suites],node26),('node24',[node24,'--import','tsx','--test','--test-concurrency=1',*suites],node24),('full-check',['npm','run','check'],node26)]
try:
 for label,command,version_node in commands:
  log=out/(label+'.log')
  assert not log.exists()
  start=time.monotonic()
  with log.open('wb') as stream:
   result=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,umask=0o022)
  raw=log.read_text(errors='replace')
  counts={k:int(v) for k,v in re.findall(r'^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',raw,re.M)}
  receipt={'command':command,'integratedCommit':head,'candidate':candidate,'exit':result.returncode,'seconds':round(time.monotonic()-start,2),'runtime':subprocess.check_output([version_node,'--version'],text=True).strip(),'counts':counts,'log':str(log)}
  write(label+'.json',receipt)
  print(json.dumps({'gate':label,**receipt}),flush=True)
  if result.returncode: raise RuntimeError('Gate failed: '+label)
  if label != 'interface':
   assert counts and counts['tests']==counts['pass'] and all(counts[k]==0 for k in ['fail','cancelled','skipped','todo']),(label,counts)
finally:
 write('source-audit-after.json',{'integratedCommit':head,'candidate':candidate,'files':audit()})
