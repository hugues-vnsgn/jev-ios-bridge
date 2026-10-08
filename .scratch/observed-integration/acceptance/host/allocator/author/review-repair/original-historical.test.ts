import assert from 'node:assert/strict';import {test} from 'node:test';import * as fs from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {ObservedAllocator} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/observed/allocation.ts';
import {Admission} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/device/admission.ts';
import {migrateAdmissionForTesting} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/src/device/admission-migration.ts';
import {allocationFixture,fixtureDevice} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocator/tests/fixtures/observed-allocation-backend.ts';
test('historical read-only allocation identity remains retrievable',async()=>{
const f=await allocationFixture();let a:ObservedAllocator|undefined;
try{const hash=(s:string)=>createHash('sha256').update(s).digest('hex');const journal=join(f.root,'historical');const dir=join(journal,hash(fixtureDevice));await fs.mkdir(dir,{recursive:true,mode:0o700});
const record={deviceId:fixtureDevice,actionId:'historical',intent:{tap:'old'},status:'completed',result:{status:'outcome_observed',actionAttempted:true,actionAcknowledged:true,observations:2}};
await fs.writeFile(join(dir,hash('historical')+'.intent.json'),JSON.stringify({...record,status:'in-flight',result:undefined}),{mode:0o600});await fs.writeFile(join(dir,hash('historical')+'.result.json'),JSON.stringify(record),{mode:0o600});
const root=join(f.root,'imported-store');migrateAdmissionForTesting({version:1,writersStopped:true,historicalRootsDeclaredOrExcluded:true,additionalJournalRoots:[],additionalLeaseRoots:[],excludedDevices:[]},{root,backend:'fake',defaultRoots:{journal,leases:join(f.root,'historical-leases')}});
const admission=Admission.forTesting({root,backend:'fake',initialize:false});const imported=admission.readImportedAction('historical')!;assert.ok(imported);a=new ObservedAllocator({admission,runsDir:f.runsDir,fakeBackend:{process:f.source,runner:f.runner,window:f.window,host:f.host}});
const result=await a.get(imported.allocationId);console.log(JSON.stringify({case:'historical-allocation',importedId:imported.allocationId,result,calls:f.calls}));assert.ok(!('kind'in result),'Known historical allocation should not be reported missing');
}finally{await a?.close();await f.cleanup();}
});
