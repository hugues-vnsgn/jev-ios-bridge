import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {Admission} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/dist/device/admission.js';
const dir='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/entry-2026-10-11-v2';
const binding=JSON.parse(await fs.readFile(join(dir,'entry-binding.json'),'utf8')),accepted=JSON.parse(await fs.readFile(join(dir,'01-config-root-acceptance.json'),'utf8')),migration=JSON.parse(await fs.readFile(join(dir,'02-migration-result.json'),'utf8')),preservation=JSON.parse(await fs.readFile(join(dir,'02-source-preservation.json'),'utf8'));
if(!preservation.allMatch||!migration.installationId||accepted.effectiveDigest!=='0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d')throw new Error('Prior entry prerequisites not accepted');
let result;try{
 const authority=Admission.open(),activation=authority.activation();if(!isDeepStrictEqual(activation,migration))throw new Error('Activation differs from migration receipt');
 const capacity=authority.readAllocationCapacity(),active=authority.listActiveAllocations(),protectedIdentities=binding.protectedDevices.map(device=>({device,view:authority.inspect(device)??null}));
 const budgets=accepted.budgets,proposed={allocations:5,reservationBytes:5*budgets.reservationBytesPerAllocation};
 const fits=Number.isSafeInteger(capacity.heldAllocations)&&Number.isSafeInteger(capacity.reservedBytes)&&capacity.heldAllocations>=0&&capacity.reservedBytes>=0&&capacity.heldAllocations+5<=budgets.maxRetainedAllocations&&capacity.reservedBytes+proposed.reservationBytes<=budgets.maxReservedBytes;
 const protection=protectedIdentities.every(x=>x.view?.state==='quarantined'&&x.view.reason==='protected-device');
 const quiescent=active.length===0;
 result={status:fits&&protection&&quiescent?'PASS':'AUTHORITY_CAPACITY_REFUSED',activation,capacity,budgets,proposed,fiveCasesFit:fits,protectedIdentities,allProtectedRetained:protection,activeAllocations:active.map(x=>({allocationId:x.allocationId,actionId:x.actionId,state:x.state,phase:x.phase,device:x.device})),noActiveAllocationsObserved:quiescent,methods:['Admission.open','activation','readAllocationCapacity','listActiveAllocations','inspect'],logicalStateMutation:false,claimChange:false};
}catch(e){result={status:'AUTHORITY_REFUSED',error:{name:e.name,message:e.message,code:e.code??null}};}
console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'?0:3;
