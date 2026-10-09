import * as nativeFs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo) throw new Error('Unexpected integration CWD');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS']) if(Object.hasOwn(process.env,key)) throw new Error('Unscrubbed environment: '+key);
const fsTrace=[],processTrace=[],children=[],guardFailures=[],metadata=[];
let sequence=0,lookupCalls=0; const stamp=()=>({sequence:++sequence,atUtc:new Date().toISOString()});
const sha=b=>createHash('sha256').update(b).digest('hex');
const errorInfo=e=>({name:e.name,message:e.message,code:e.code??null,reason:e.reason??null,stack:e.stack??null});
const canonical=p=>typeof p==='string'&&p.startsWith('/')&&resolve(p)===p&&!p.includes('\0')&&p.length<=4096&&p.split('/').every(x=>x.length<=255);
const nameOK=n=>typeof n==='string'&&/^[^/\0]{1,255}$/.test(n)&&n!=='.'&&n!=='..';
const deviceRoot='/Library/Developer/CoreSimulator/Profiles/DeviceTypes';
const defaultRuntime='/Library/Developer/CoreSimulator/Profiles/Runtimes';
const volumeRoot='/Library/Developer/CoreSimulator/Volumes';
const cryptexRoot='/private/var/run/com.apple.security.cryptexd/mnt';
const suffix='/Library/Developer/CoreSimulator/Profiles/Runtimes';
const mountGrammar=/^com\.apple\.iPhoneOS\.SimulatorRuntime-v[0-9]{1,3}(?:\.[0-9]{1,5}){2,3}\.[A-Za-z0-9]{1,64}$/;
const fixedPlists=['/Applications/Xcode.app/Contents/Info.plist','/Applications/Xcode.app/Contents/version.plist','/System/Library/CoreServices/SystemVersion.plist'];
const developerDirectory='/Applications/Xcode.app/Contents/Developer';
const statsOnly=[developerDirectory,'/Applications/Xcode.app/Contents/MacOS/Xcode',developerDirectory+'/usr/bin/simctl','/usr/bin/xcrun','/usr/bin/plutil','/usr/sbin/diskutil',developerDirectory+'/Platforms/iPhoneSimulator.platform'];
const allowedStats=new Set(['/']),allowedPlists=new Set(fixedPlists),allowedDirs=new Map([[deviceRoot,'devices'],[defaultRuntime,'runtimes'],[volumeRoot,'volumes'],[cryptexRoot,'cryptex-mounts']]),allowedMounts=new Set();
let runtimeBundleCount=0,deviceBundleCount=0;
function addPath(p){if(!canonical(p))throw new Error('Noncanonical planned metadata path');let current='/';for(const part of p.split('/').filter(Boolean)){current=join(current,part);allowedStats.add(current);}}
for(const p of [...fixedPlists,...statsOnly,...allowedDirs.keys()])addPath(p);
function addPlist(p){addPath(p);allowedPlists.add(p);}
function addRuntime(root,n){const bundle=join(root,n);for(const s of ['/Contents/Info.plist','/Contents/Resources/profile.plist','/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'])addPlist(bundle+s);}
function reject(operation,p,detail){const e=new Error('Probe guard mismatch: '+operation+' '+String(p)+' '+String(detail??''));guardFailures.push({...stamp(),operation,path:p,detail:detail??null,error:errorInfo(e)});throw e;}
function guard(ok,operation,p,detail){if(!ok)reject(operation,p,detail);}
const allowedRead=(buffer,offset,length,position)=>Buffer.isBuffer(buffer)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>=0&&length<=65537&&offset+length<=buffer.length&&position===null;
const readGuardAudit={scope:'Pure guard predicates only; zero installed-path calls and zero native children before lookup.',
 productionSourceReadRequest:65536,productionDistReadRequest:65536,productionInputCap:65536,
 sentinel65537Allowed:allowedRead(Buffer.alloc(65537),0,65537,null),
 ordinary65536Allowed:allowedRead(Buffer.alloc(65536),0,65536,null),
 over65537Denied:!allowedRead(Buffer.alloc(65538),0,65538,null),
 positionalReadDenied:!allowedRead(Buffer.alloc(65537),0,65537,0),
 writesDenied:true,allReturnedBytesDelegatedUnchanged:true,rootAncestorPermitted:allowedStats.has('/'),
 discovery:'Only immediate installed listings used by pinned code, finite candidates; no prerecorded installed lookup.'};
if(!Object.values(readGuardAudit).filter(v=>typeof v==='boolean').every(Boolean))throw new Error('Pure guard audit failed');
const product=await import(pathToFileURL(join(repo,'dist/observed/allocation-config.js')).href);
const {installedHost,allocationSourceProcess,verifyInstalledCompatibility}=product;
const nativeHost=installedHost();
const fs=nativeHost.fs;
function identity(s){return {dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode,permissions:(s.mode&0o7777).toString(8).padStart(4,'0'),nlink:s.nlink,size:s.size,atimeMs:s.atimeMs,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,birthtimeMs:s.birthtimeMs,type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',isSymbolicLink:s.isSymbolicLink()};}
const guardedFs={
 async lstat(p,...rest){
  guard(canonical(p)&&allowedStats.has(p)&&rest.length===0,'lstat',p);
  const entry={...stamp(),method:'lstat',path:p,callerStack:new Error().stack};fsTrace.push(entry);
  try{const s=await fs.lstat(p);Object.assign(entry,{ok:true,identity:identity(s)});return s;}catch(e){Object.assign(entry,{ok:false,error:errorInfo(e)});throw e;}
 },
 async readdir(p,...rest){
  guard(canonical(p)&&allowedDirs.has(p)&&rest.length===0,'readdir',p);
  const entry={...stamp(),method:'readdir',path:p,kind:allowedDirs.get(p),callerStack:new Error().stack};fsTrace.push(entry);
  try{
   const values=await fs.readdir(p);Object.assign(entry,{ok:true,entries:values});
   guard(values.length<=1000,'readdir-budget',p,values.length);
   const kind=allowedDirs.get(p);
   if(kind==='devices'){
    const names=values.filter(n=>nameOK(n)&&n.endsWith('.simdevicetype'));deviceBundleCount+=names.length;guard(deviceBundleCount<=1000,'device-bundle-budget',p,deviceBundleCount);
    for(const n of names){addPlist(join(p,n,'Contents/Info.plist'));addPlist(join(p,n,'Contents/Resources/profile.plist'));}
   }else if(kind==='runtimes'){
    const names=values.filter(n=>nameOK(n)&&n.endsWith('.simruntime'));runtimeBundleCount+=names.length;guard(runtimeBundleCount<=1000,'aggregate-runtime-bundle-budget',p,runtimeBundleCount);
    for(const n of names)addRuntime(p,n);
   }else if(kind==='volumes'){
    for(const n of values){if(!/^[A-Za-z0-9_-]{1,255}$/.test(n))continue;const root=join(p,n)+suffix;addPath(root);allowedDirs.set(root,'runtimes');}
   }else if(kind==='cryptex-mounts'){
    const names=values.filter(n=>nameOK(n)&&mountGrammar.test(n));guard(names.length<=64,'cryptex-mount-budget',p,names.length);
    for(const n of names){const mount=join(p,n),root=mount+suffix;addPath(root);allowedMounts.add(mount);allowedDirs.set(root,'runtimes');}
   }
   return values;
  }catch(e){Object.assign(entry,{ok:false,error:errorInfo(e)});throw e;}
 },
 async open(p,flags,...rest){
  guard(canonical(p)&&allowedPlists.has(p)&&flags===(constants.O_RDONLY|constants.O_NOFOLLOW)&&rest.length===0,'open-readonly-nofollow',p,flags);
  const entry={...stamp(),method:'open',path:p,flags,callerStack:new Error().stack};fsTrace.push(entry);let handle;
  try{handle=await fs.open(p,flags);Object.assign(entry,{ok:true,fd:handle.fd});}catch(e){Object.assign(entry,{ok:false,error:errorInfo(e)});throw e;}
  const record={path:p,openSequence:entry.sequence,fd:handle.fd,reads:[],identities:[],completeRead:false,capturedBytes:0,totalReturnedBytes:0};metadata.push(record);
  const chunks=[];const hash=createHash('sha256');let eof=false;
  return {
   async stat(...args){
    guard(args.length===0,'handle.stat-options',p);
    const event={...stamp(),method:'handle.stat',path:p,fd:handle.fd};fsTrace.push(event);
    try{const s=await handle.stat();const id=identity(s);Object.assign(event,{ok:true,identity:id});record.identities.push({sequence:event.sequence,...id});return s;}catch(e){Object.assign(event,{ok:false,error:errorInfo(e)});throw e;}
   },
   async read(buffer,offset,length,position){
    guard(allowedRead(buffer,offset,length,position),'handle.read-sentinel-bound',p,{bufferBytes:buffer?.length,offset,length,position});
    const event={...stamp(),method:'handle.read',path:p,fd:handle.fd,requestedBytes:length,bufferBytes:buffer.length,offset,position};fsTrace.push(event);
    try{
     const r=await handle.read(buffer,offset,length,position);const bytes=Buffer.from(buffer.subarray(offset,offset+r.bytesRead));
     hash.update(bytes);const remaining=65537-record.capturedBytes;if(remaining>0){const kept=bytes.subarray(0,remaining);chunks.push(kept);record.capturedBytes+=kept.length;}
     record.totalReturnedBytes+=r.bytesRead;if(!r.bytesRead)eof=true;
     Object.assign(event,{ok:true,bytesRead:r.bytesRead,returnedByteSha256:sha(bytes),returnBufferUnchanged:r.buffer===buffer});record.reads.push({sequence:event.sequence,requestedBytes:length,bytesRead:r.bytesRead});
     return r;
    }catch(e){Object.assign(event,{ok:false,error:errorInfo(e)});throw e;}
   },
   async close(...args){
    guard(args.length===0,'handle.close-options',p);
    const event={...stamp(),method:'handle.close',path:p,fd:handle.fd};fsTrace.push(event);
    try{const value=await handle.close();Object.assign(event,{ok:true});record.completeRead=eof;record.originalReturnedByteSha256=hash.digest('hex');record.retainedBytesBase64=Buffer.concat(chunks).toString('base64');record.captureComplete=record.capturedBytes===record.totalReturnedBytes;return value;}
    catch(e){Object.assign(event,{ok:false,error:errorInfo(e)});throw e;}
   }
  };
 }
};
const host={...nativeHost,fs:new Proxy(guardedFs,{get(target,key){if(Object.hasOwn(target,key))return target[key];reject('filesystem-method',String(key));}})};
function commandKind(executable,args){
 if(executable==='/usr/bin/plutil'&&Array.isArray(args)&&args.length===6&&args.slice(0,5).join('\0')==='-convert\0json\0-o\0-\0--'&&canonical(args[5])&&allowedPlists.has(args[5]))return 'plutil';
 if(executable==='/usr/sbin/diskutil'&&Array.isArray(args)&&args.length===3&&args[0]==='info'&&args[1]==='-plist'&&canonical(args[2])&&allowedMounts.has(args[2]))return 'diskutil';
}
const expectedEnv={HOME:host.account.homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:developerDirectory};
const sharedSignal=AbortSignal.timeout(60000);
const signalEvents=[];sharedSignal.addEventListener('abort',()=>signalEvents.push({...stamp(),event:'shared-signal-abort',reason:errorInfo(sharedSignal.reason)}),{once:true});
function launch(executable,args,options){
 const kind=commandKind(executable,args);
 guard(Boolean(kind)&&options.shell===false&&JSON.stringify(options.stdio)===JSON.stringify(['ignore','pipe','pipe'])&&Object.keys(options).sort().join(',')==='env,shell,stdio','launch',executable,{argv:args});
 guard(options.env&&Object.keys(options.env).sort().join(',')===Object.keys(expectedEnv).sort().join(',')&&Object.entries(expectedEnv).every(([k,v])=>options.env[k]===v),'launch-environment',executable);
 const cap=kind==='plutil'&&args[5]===fixedPlists[0]?131072:65536;
 const entry={...stamp(),index:children.length,kind,argv:[executable,...args],cwd:process.cwd(),spawnOptions:options,outputCap:cap,sharedDeadlineMs:60000,commandTimeoutMs:10000,events:[],killCalls:[],stdoutOriginalBytes:0,stderrOriginalBytes:0,retainedCombinedBytes:0,launchStack:new Error().stack};
 children.push(entry);
 const out=[],err=[],oh=createHash('sha256'),eh=createHash('sha256');
 let child;
 try{child=spawn(executable,args,options);entry.pid=child.pid??null;}
 catch(e){entry.spawnError=errorInfo(e);throw e;}
 const capture=(channel,chunks,hash)=>chunk=>{
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);hash.update(bytes);entry[channel+'OriginalBytes']+=bytes.length;
  const room=cap-entry.retainedCombinedBytes;let retained=0;if(room>0){const keep=Buffer.from(bytes.subarray(0,room));chunks.push(keep);retained=keep.length;entry.retainedCombinedBytes+=retained;}
  entry.events.push({...stamp(),event:channel+'-data',bytes:bytes.length,sha256:sha(bytes),retainedBytes:retained});
 };
 child.stdout?.on('data',capture('stdout',out,oh));child.stderr?.on('data',capture('stderr',err,eh));
 const originalKill=child.kill;
 child.kill=function(...args){const event={...stamp(),args};entry.killCalls.push(event);try{const result=Reflect.apply(originalKill,this,args);event.returned=result;return result;}catch(e){event.error=errorInfo(e);throw e;}};
 child.on('spawn',()=>entry.events.push({...stamp(),event:'spawn'}));
 child.on('error',e=>entry.events.push({...stamp(),event:'error',error:errorInfo(e)}));
 child.on('exit',(code,signal)=>entry.events.push({...stamp(),event:'exit',code,signal}));
 child.once('close',(code,signal)=>{
  entry.events.push({...stamp(),event:'close',code,signal});
  Object.assign(entry,{closedAtUtc:new Date().toISOString(),exitCode:code,signal,stdoutOriginalSha256:oh.digest('hex'),stderrOriginalSha256:eh.digest('hex'),stdoutRetainedBase64:Buffer.concat(out).toString('base64'),stderrRetainedBase64:Buffer.concat(err).toString('base64'),captureComplete:entry.stdoutOriginalBytes+entry.stderrOriginalBytes===entry.retainedCombinedBytes});
 });
 return child;
}
const actualProcess=allocationSourceProcess(host,[],launch);
if(!product.isProductionSourceProcess(actualProcess))throw new Error('Actual process factory identity missing');
const recordedProcess=async(executable,args,options)=>{
 const kind=commandKind(executable,args);
 guard(Boolean(kind)&&options.shell===false&&options.signal===sharedSignal&&options.timeoutMs===10000&&options.maxOutputBytes===(kind==='plutil'&&args[5]===fixedPlists[0]?131072:65536),'caller-process',executable,{argv:args,timeoutMs:options.timeoutMs,maxOutputBytes:options.maxOutputBytes,sharedSignal:options.signal===sharedSignal});
 const entry={...stamp(),argv:[executable,...args],kind,timeoutMs:options.timeoutMs,maxOutputBytes:options.maxOutputBytes,shell:options.shell,sharedSignal:true};processTrace.push(entry);
 try{const result=await actualProcess(executable,args,options);Object.assign(entry,{completedAtUtc:new Date().toISOString(),result});return result;}catch(e){Object.assign(entry,{completedAtUtc:new Date().toISOString(),error:errorInfo(e)});throw e;}
};
const request={deviceTypeId:'com.apple.CoreSimulator.SimDeviceType.iPhone-17',runtimeId:'com.apple.CoreSimulator.SimRuntime.iOS-27-0'};
const startedAtUtc=new Date().toISOString();let exactResult,exitCode;
try{
 lookupCalls++;const compatibility=await verifyInstalledCompatibility(request,host,recordedProcess,sharedSignal);
 exactResult={status:'compatibility-success',compatibility};exitCode=0;
}catch(e){exactResult={status:guardFailures.length?'probe-guard-mismatch':e.reason??'unexpected-error',error:errorInfo(e)};exitCode=guardFailures.length?2:e.reason==='HOST_PREREQUISITE_MISSING'?3:2;}
const result={scope:'One actual guarded repaired compiled metadata compatibility lookup; no account/store/device/SDK/network/build/acceptance effects.',
 cwd:process.cwd(),node:process.version,execPath:process.execPath,lookupCalls,request,startedAtUtc,completedAtUtc:new Date().toISOString(),
 installedHost:{platform:host.platform,architecture:host.architecture,account:{uid:host.account.uid,homedir:host.account.homedir}},
 actualProcessFactory:'allocationSourceProcess',productionFactoryIdentityConfirmed:true,allowedArtifactRoots:[],
 readGuardAudit,guardFailures,exactResult,exitCode,signalEvents,
 productionLimitsPreserved:{sharedDeadlineMs:60000,childLimit:8192,pathChars:4096,listingEntries:1000,cryptexMounts:64,runtimeBundles:1000,inputBytes:65536,xcodeOutputBytes:131072,otherOutputBytes:65536,mountTermination:'Production SIGTERM /250ms SIGKILL, settlement on close; unchanged.'},
 allowedRuntimeInventory:{deviceBundleCount,runtimeBundleCount,approvedMounts:[...allowedMounts],directories:[...allowedDirs].map(([path,kind])=>({path,kind})),plistPaths:[...allowedPlists]},
 fsTrace,processTrace,children,metadataInputs:metadata,
 firstFilesystemError:fsTrace.find(x=>x.ok===false)??null,lastSuccessfulFilesystemEvent:fsTrace.filter(x=>x.ok===true).at(-1)??null,
 firstCallerProcessError:processTrace.find(x=>x.error)??null,
 liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'},
 rawEvidencePolicy:'Original hashes/sizes cover all received child bytes; base64 retention is exact within command cap, completeness explicit, no output redactions applied. No inherited credentials loaded.'};
console.log(JSON.stringify(result,null,2));process.exitCode=exitCode;
