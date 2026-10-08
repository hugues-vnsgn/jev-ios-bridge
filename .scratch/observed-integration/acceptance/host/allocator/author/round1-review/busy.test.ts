import assert from 'node:assert/strict';import {test} from 'node:test';import {join} from 'node:path';
import {ObservedAllocator} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/observed/allocation.ts';
import {allocationFixture} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/tests/fixtures/observed-allocation-backend.ts';
test('executing cancellation identifies the action to cancel',async()=>{
const f=await allocationFixture();const a=new ObservedAllocator({admission:f.admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
try {const ready=await a.prepare(f.request());assert.ok(!('kind'in ready));if('kind'in ready)throw Error('fixture');const consumed=a.consume({allocationId:ready.allocationId,actionId:ready.actionId,actionDigest:'b'.repeat(64),request:{version:1},appBundleId:'org.example.fixture',evidence:{bridgeVersion:'fixture',directory:join(f.root,'action'),request:join(f.root,'action/request.json')}});assert.equal(consumed.kind,'consumed');const result=await a.cancel(ready.allocationId);console.log(JSON.stringify({case:'busy-cancel',result}));assert.equal('kind'in result&&result.code,'ALLOCATION_BUSY');assert.equal(result.actionId,ready.actionId);}
finally{await a.close();await f.cleanup();}
});
