import assert from 'node:assert/strict';import {test} from 'node:test';import * as fs from 'node:fs/promises';import {join} from 'node:path';
import {ObservedAllocator} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/observed/allocation.ts';
import {allocationFixture} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/tests/fixtures/observed-allocation-backend.ts';
test('failure to persist required diagnostic evidence cannot finalize a known refusal',async()=>{
 const f=await allocationFixture();const a=new ObservedAllocator({admission:f.admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
 f.setCommandResult('install',{exitCode:1,stderr:'private fake failure',stdout:JSON.stringify({schema:'mobilebuildmcp.output.install-result',schemaVersion:'2',didError:true,error:{code:'KNOWN_ERROR',message:'private fake failure'},data:{artifacts:{simulatorId:'ABCDEF00-0000-4000-8000-000000000001'}}})});
 f.setBefore(async op=>{if(op==='install'){const record=f.admission.readAllocationForAction('allocate-one')!;await fs.mkdir(join(record.evidenceDirectory,'source-diagnostics.json'),{mode:0o700});}});
 try{const result=await a.prepare(f.request());console.log(JSON.stringify({case:'diagnostic-write-failure',result,calls:f.calls}));assert.ok(!('kind'in result));if('kind'in result)throw Error('fixture');assert.equal(result.state,'quarantined');assert.equal(result.outcome,'uncertain');}
 finally{await a.close();await f.cleanup();}
});
