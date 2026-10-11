import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {installedHost,allocationStorage} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/dist/observed/allocation-config.js';
const dir='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/entry-2026-10-11-v2';
const authority=JSON.parse(await fs.readFile(join(dir,'03-authority-result.json'),'utf8')),accepted=JSON.parse(await fs.readFile(join(dir,'01-config-root-acceptance.json'),'utf8'));
if(authority.status!=='PASS'||accepted.effectiveDigest!=='0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d')throw new Error('Authority/configuration not accepted');
const host=installedHost(),statfsTrace=[],observedHost={...host,fs:{...host.fs,statfs:async(...args)=>{const e={path:args[0],atUtc:new Date().toISOString()};statfsTrace.push(e);try{const s=await host.fs.statfs(...args);e.returned=Object.fromEntries(['type','bsize','blocks','bfree','bavail','files','ffree'].map(k=>[k,s[k]]));e.returnQualifier='Original production numeric StatFs returned unchanged; calculated free bytes must be safe integers.';return s;}catch(error){e.error={name:error.name,code:error.code??null,message:error.message};throw error;}}}};
let result;try{
 const storage=await allocationStorage(observedHost,dir),b=accepted.budgets,existing=authority.capacity.reservedBytes,proposedReservations=5*b.reservationBytesPerAllocation,stagedArtifactAllowance=5*b.maxArtifactBytes;
 const simulatorRequired=existing+proposedReservations+b.minFreeBytes,stagingRequired=existing+proposedReservations+stagedArtifactAllowance+b.minFreeBytes;
 const enough=storage.simulatorFreeBytes>=simulatorRequired&&storage.stagingFreeBytes>=stagingRequired;
 result={status:enough?'PASS':'STORAGE_UNAVAILABLE',helper:'pinned production allocationStorage',simulatorVolume:join(host.account.homedir,'Library/Developer/CoreSimulator'),approvedStagingVolume:dir,storage,requirements:{existingReservations:existing,proposedAllocations:5,proposedReservations,remainingFreeFloor:b.minFreeBytes,stagedArtifactAllowance,simulatorRequired,stagingRequired},margin:{simulatorBytes:storage.simulatorFreeBytes-simulatorRequired,stagingBytes:storage.stagingFreeBytes-stagingRequired},statfsTrace,estimatesAreNotQuotas:true,externalConsumptionUnfenced:true,productionPerPreparationChecksRemainEnabled:true,reservationsMade:0};
}catch(e){result={status:e.reason??'STORAGE_UNAVAILABLE',error:{name:e.name,message:e.message,reason:e.reason??null},statfsTrace};}
console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'?0:3;
