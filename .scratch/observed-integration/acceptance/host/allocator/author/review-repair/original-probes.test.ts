import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ObservedAllocator} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/observed/allocation.ts';
import {allocationFixture} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/tests/fixtures/observed-allocation-backend.ts';
const subject=(f:Awaited<ReturnType<typeof allocationFixture>>)=>new ObservedAllocator({admission:f.admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
test('existing global observed identity conflicts before prerequisite probes',async()=>{
 const f=await allocationFixture();const a=subject(f);
 try {const existing=f.admission.acquire({device:'ABCDEF00-0000-4000-8000-000000000099',attempt:{kind:'observed',id:'old-action'},digest:'old-digest',intent:{}});assert.equal(existing.kind,'acquired');
 const result=await a.prepare(f.request('old-action'));console.log(JSON.stringify({case:'global-duplicate',result,calls:f.calls}));
 assert.equal('kind' in result&&result.code,'ACTION_ID_CONFLICT');assert.deepEqual(f.calls,[],'global conflicting identity must not probe');
 }finally{await a.close();await f.cleanup();}
});
test('host guard refusal points to retained creators persisted evidence',async()=>{
 const f=await allocationFixture();const a=subject(f);f.setCreateResult({exitCode:1,stdout:'',stderr:'fake unknown creation'});
 try {const first=await a.prepare(f.request('blocker'));assert.ok(!('kind' in first));if('kind'in first)throw Error('fixture');assert.equal(first.hostCreationBlocked,true);
 const record=f.admission.readAllocation(first.allocationId)!;const before=[...f.calls];const result=await a.prepare(f.request('blocked'));
 console.log(JSON.stringify({case:'guard-evidence',expected:record.evidenceDirectory,result,newCalls:f.calls.slice(before.length)}));
 assert.equal('kind'in result&&result.code,'HOST_CREATION_UNRESOLVED');assert.equal('kind'in result&&result.evidenceDirectory,record.evidenceDirectory);
 }finally{await a.close();await f.cleanup();}
});
