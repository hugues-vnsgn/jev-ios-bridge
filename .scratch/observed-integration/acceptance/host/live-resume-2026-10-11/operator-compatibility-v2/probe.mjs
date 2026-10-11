import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGuard } from './guards.mjs';
import { createRecordingState,stamp,errorInfo,recordFilesystem,recordingLaunch } from './recording.mjs';
import { repo,dir,rootHead,readRepo,sha } from './common.mjs';
if(process.cwd()!==repo||process.argv.length!==3||process.argv[2]!=='--root-reviewed-single-lookup')throw new Error('Not a reviewed once execution command');
if(process.version!=='v26.8.1'||process.execPath!=='/opt/homebrew/Cellar/node/26.8.1/bin/node')throw new Error('Unpinned Node');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Unscrubbed probe environment');
const audit=JSON.parse(await readRepo(dir+'/pure-guard-audit.json'));
if(audit.status!=='PASS'||audit.nativeFilesystemCalls!==0||audit.nativeChildren!==0||audit.lookupCalls!==0||!audit.checks.every(x=>x.pass))throw new Error('Pure guard audit not accepted');
const product=await import(pathToFileURL(join(repo,'dist/observed/allocation-config.js')).href);
const {installedHost,allocationSourceProcess,verifyInstalledCompatibility,trackAllocationSourceProcess,isProductionSourceProcess}=product;
if(![installedHost,allocationSourceProcess,verifyInstalledCompatibility,trackAllocationSourceProcess,isProductionSourceProcess].every(f=>typeof f==='function'))throw new Error('Pinned production seams missing');
const state=createRecordingState(),guard=createGuard(e=>state.guardFailures.push({...stamp(state),operation:e.operation,path:e.path,detail:e.detail??null,error:errorInfo(e)}));
const nativeHost=installedHost(),host={...nativeHost,fs:recordFilesystem(nativeHost.fs,guard,state)};
const actualProcess=allocationSourceProcess(host,[],recordingLaunch(spawn,guard,state,host.account.homedir));
const recordedProcess=trackAllocationSourceProcess(actualProcess,async(operation,invoke)=>{
 guard.require(['/usr/bin/plutil','/usr/sbin/diskutil'].includes(operation),'tracked-operation',operation);
 const entry={...stamp(state),operation,callerStack:new Error().stack,childStartIndex:state.children.length};state.processTrace.push(entry);
 try{const returned=await invoke();Object.assign(entry,{completedAtUtc:new Date().toISOString(),result:returned,childEndIndex:state.children.length});return returned;}
 catch(e){Object.assign(entry,{completedAtUtc:new Date().toISOString(),error:errorInfo(e),childEndIndex:state.children.length});throw e;}
});
if(!isProductionSourceProcess(actualProcess)||!isProductionSourceProcess(recordedProcess))throw new Error('Production tracking identity lost');
const sharedSignal=AbortSignal.timeout(60000);
sharedSignal.addEventListener('abort',()=>state.signalEvents.push({...stamp(state),event:'shared-signal-abort',reason:errorInfo(sharedSignal.reason)}),{once:true});
const request={deviceTypeId:'com.apple.CoreSimulator.SimDeviceType.iPhone-17',runtimeId:'com.apple.CoreSimulator.SimRuntime.iOS-27-0'};
const startedAtUtc=new Date().toISOString();let exactResult,exitCode,lookupCalls=0;
try{
 lookupCalls++;const compatibility=await verifyInstalledCompatibility(request,host,recordedProcess,sharedSignal);
 exactResult={status:'PASS',compatibility};exitCode=0;
}catch(e){exactResult={status:state.guardFailures.length?'PROBE_FAILURE':e.reason??'UNEXPECTED_ERROR',error:errorInfo(e)};exitCode=state.guardFailures.length?2:e.reason==='HOST_PREREQUISITE_MISSING'?3:2;}
if(state.children.some(c=>!c.closedAtUtc)){exactResult={status:'PROBE_FAILURE',cause:'Unconfirmed child close',previous:exactResult};exitCode=2;}
const result={scope:'Single actual pinned production metadata-only lookup, only after Root review; no acceptance/live certification.',rootHead,cwd:process.cwd(),node:process.version,execPath:process.execPath,
 request,startedAtUtc,completedAtUtc:new Date().toISOString(),lookupCalls,exactResult,exitCode,installedHost:{platform:host.platform,architecture:host.architecture,uid:host.account.uid},
 processFactory:'allocationSourceProcess',tracking:'trackAllocationSourceProcess preserves private production invocation context',productionFactoryIdentityConfirmed:true,allowedArtifactRoots:[],
 pureGuardAuditSha256:sha(await readRepo(dir+'/pure-guard-audit.json')),productionLimits:{sharedSignalMs:60000,mountAndConversionTimeoutMs:10000,dispatchesAndChildren:8192,pathChars:4096,basenameChars:255,immediateEntries:1000,legacyMounts:64,cryptexMounts:64,aggregateRuntimeBundles:1000,inputBytes:65536,readSentinelRequestBytes:65537,xcodeInfoOutputBytes:131072,otherOutputBytes:65536,mountKillEscalationMs:250,settlement:'actual close'},
 inventory:guard.inventory(),...state,firstFilesystemError:state.fsTrace.find(x=>x.ok===false)??null,lastFilesystemEvent:state.fsTrace.at(-1)??null,
 identityQualification:'Production bigint returns are serialized losslessly. Strict numeric returns delegate unchanged; two supplementary stable bigint observations at each authorized successful stat provide separate exact identities, without Number coercion or invented binding.',
 liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'},rawEvidencePolicy:'Bounded original byte sizes/hashes distinguish retained recoverable bytes; no redactions.'};
console.log(JSON.stringify(result,null,2));process.exitCode=exitCode;
