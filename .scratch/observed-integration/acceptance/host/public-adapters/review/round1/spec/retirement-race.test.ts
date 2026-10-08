import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';
import {createObservedComposition,validateObservedStartConfiguration} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/src/observed/cli.ts';
import {Admission} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/src/device/admission.ts';
import {setupPublicFixture,fixtureObserved,fixtureCalls,actionRequest} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/tests/fixtures/observed-cli-server.ts';
test('real retirement during configuration validation returns authoritative unready refusal',async()=>{
 const root=await mkdtemp('/tmp/jev-public-retirement-');const f=await setupPublicFixture(root);const inner=fixtureObserved(root,true,'already');const admission=Admission.forTesting({root:f.store,backend:'fake',initialize:false});let code:string|undefined;
 try{const allocation=await inner.prepareAllocation(f.request('one'));assert.ok(!('kind'in allocation));if('kind'in allocation)throw Error('fixture');const before=fixtureCalls(root);const module=createObservedComposition({enabled:true,create:()=>inner,beforeStart:request=>validateObservedStartConfiguration(admission,request,async()=>{const retired=admission.retireAllocation(allocation.allocationId);assert.equal(retired.kind,'retrieved');throw Error('Injected private configuration fault');})});
 try{await module.start(actionRequest(allocation.allocationId));}catch(error){code=(error as any).code;}
 console.log(JSON.stringify({case:'durable-retirement-race',code,state:admission.readAllocation(allocation.allocationId)?.state,callsBefore:before,callsAfter:fixtureCalls(root)}));assert.equal(code,'ALLOCATION_NOT_READY');assert.deepEqual(fixtureCalls(root),before);await module.close();
 }finally{await inner.close();await f.cleanup();await rm(root,{recursive:true,force:true});}
});
