import * as fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {installedHost,allocationStorage,allocationDefaults} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/dist/observed/allocation-config.js';
const evidence='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-storage-recheck-2026-10-11';
const simulatorPath='/Users/hugues_mini/Library/Developer/CoreSimulator';
const stagingPath='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/entry-2026-10-11-v2';
const bindings=JSON.parse(await fs.readFile(evidence+'/input-bindings.json','utf8'));
for(const b of bindings){const bytes=await fs.readFile(evidence+'/'+b.copy);if(createHash('sha256').update(bytes).digest('hex')!==b.sha256)throw new Error('Evidence input changed');}
const accepted=JSON.parse(await fs.readFile(evidence+'/config-root-acceptance.json','utf8'));
const authority=JSON.parse(await fs.readFile(evidence+'/authority-result.json','utf8'));
const prior=JSON.parse(await fs.readFile(evidence+'/prior-storage-result.json','utf8'));
if(accepted.effectiveDigest!=='0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d'||accepted.version!==1||authority.status!=='PASS'||authority.capacity.reservedBytes!==0||authority.capacity.heldAllocations!==0)throw new Error('Unaccepted configuration/capacity input');
const b=accepted.budgets;
if(Object.keys(b).length!==13||Object.keys(allocationDefaults).length!==13||Object.entries(allocationDefaults).some(([key,value])=>b[key]!==value))throw new Error('Default budgets changed');
const requirements={existingReservations:authority.capacity.reservedBytes,proposedAllocations:5,proposedReservations:5*b.reservationBytesPerAllocation,remainingFreeFloor:b.minFreeBytes,stagedArtifactAllowance:5*b.maxArtifactBytes};
requirements.simulatorRequired=requirements.existingReservations+requirements.proposedReservations+requirements.remainingFreeFloor;
requirements.stagingRequired=requirements.simulatorRequired+requirements.stagedArtifactAllowance;
if(prior.simulatorVolume!==simulatorPath||prior.approvedStagingVolume!==stagingPath||Object.entries(requirements).some(([key,value])=>prior.requirements[key]!==value))throw new Error('Storage paths/requirements changed');
const host=installedHost();if(host.account.homedir!=='/Users/hugues_mini'||host.account.uid!==501)throw new Error('Unexpected production account');
const paths=[simulatorPath,stagingPath],statfsTrace=[];let helperCalls=0;
const observedHost={...host,fs:{statfs:async(...args)=>{
 const index=statfsTrace.length;if(index>=2||args.length!==1||args[0]!==paths[index])throw new Error('Unexpected storage filesystem request');
 const e={path:args[0],startedAtUtc:new Date().toISOString()};statfsTrace.push(e);
 try{const s=await host.fs.statfs(...args);e.completedAtUtc=new Date().toISOString();e.returned=Object.fromEntries(['type','bsize','blocks','bfree','bavail','files','ffree'].map(k=>[k,s[k]]));e.allRecordedFieldsAreSafeIntegers=Object.values(e.returned).every(Number.isSafeInteger);e.returnQualifier='Original production numeric StatFs object returned unchanged; production validates calculated free bytes.';return s;}
 catch(error){e.completedAtUtc=new Date().toISOString();e.error={name:error.name,code:error.code??null,message:error.message};throw error;}
}}};
const startedAtUtc=new Date().toISOString(),start=performance.now();let result;
try{
 helperCalls++;const storage=await allocationStorage(observedHost,stagingPath);
 if(statfsTrace.length!==2)throw new Error('Incomplete exact storage trace');
 const margin={simulatorBytes:storage.simulatorFreeBytes-requirements.simulatorRequired,stagingBytes:storage.stagingFreeBytes-requirements.stagingRequired};
 result={status:margin.simulatorBytes>=0&&margin.stagingBytes>=0?'PASS':'STORAGE_UNAVAILABLE',helper:'pinned production allocationStorage',simulatorVolume:simulatorPath,approvedStagingVolume:stagingPath,storage,requirements,margin,shortfall:{simulatorBytes:Math.max(0,-margin.simulatorBytes),stagingBytes:Math.max(0,-margin.stagingBytes)}};
}catch(error){result={status:error.reason??'STORAGE_UNAVAILABLE',error:{name:error.name,message:error.message,reason:error.reason??null},requirements};}
Object.assign(result,{startedAtUtc,completedAtUtc:new Date().toISOString(),durationMs:performance.now()-start,helperCalls,statfsTrace,configurationDigest:accepted.effectiveDigest,budgets:b,reservationSource:'Previously accepted entry capacity; not freshly read by this dispatch',estimatesAreNotQuotas:true,externalConsumptionUnfenced:true,productionPerPreparationChecksRemainEnabled:true,reservationsMade:0,migrationCalls:0,deviceOperations:0,builds:0});
console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'?0:3;
