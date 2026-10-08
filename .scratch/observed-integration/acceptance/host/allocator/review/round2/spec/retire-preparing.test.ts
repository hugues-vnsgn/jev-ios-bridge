import assert from 'node:assert/strict';import {test} from 'node:test';
import {ObservedAllocator} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/observed/allocation.ts';
import {allocationFixture} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/tests/fixtures/observed-allocation-backend.ts';
test('retirement of active preparation returns ALLOCATION_BUSY',async()=>{
const f=await allocationFixture();const a=new ObservedAllocator({admission:f.admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
let entered!:()=>void,release!:()=>void;const began=new Promise<void>(r=>entered=r),pending=new Promise<void>(r=>release=r);f.setBefore(async op=>{if(op==='boot'){entered();await pending;}});let preparing:ReturnType<typeof a.prepare>|undefined;
try{preparing=a.prepare(f.request());await began;const record=f.admission.readAllocationForAction('allocate-one')!;assert.equal(record.state,'preparing');const result=await a.retire(record.allocationId);console.log(JSON.stringify({case:'retire-preparing',result,state:record.state,calls:f.calls}));release();await preparing;assert.equal('kind'in result&&result.code,'ALLOCATION_BUSY');}
finally{release();await preparing;await a.close();await f.cleanup();}
});
