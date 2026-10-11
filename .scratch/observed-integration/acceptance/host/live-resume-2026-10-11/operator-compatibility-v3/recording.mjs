import { createHash } from 'node:crypto';
import { statArgsOK, readOK, statSurface, losslessIdentity, sameLossless, ProbeGuardError } from './guards.mjs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const errorInfo=e=>({name:e?.name??typeof e,message:e?.message??String(e),code:e?.code??null,reason:e?.reason??null,stack:e?.stack??null});
export function createRecordingState(){return {sequence:0,fsTrace:[],processTrace:[],children:[],metadata:[],guardFailures:[],signalEvents:[]};}
export const stamp=state=>({sequence:++state.sequence,atUtc:new Date().toISOString()});
export function recordFilesystem(nativeFs,guard,state){
 async function observeStat(method,path,args,invoke,extra={}){
  guard.require(statArgsOK(args),method+'-options',path,{args});
  const event={...stamp(state),method,path,args,...extra,callerStack:new Error().stack};state.fsTrace.push(event);
  let returned;
  try{returned=await invoke(args);}catch(e){Object.assign(event,{ok:false,error:errorInfo(e)});throw e;}
  Object.assign(event,{ok:true,returnedSurface:statSurface(path,returned)});
  try{
   if(args.length===1){event.losslessIdentity=losslessIdentity(path,returned);event.identityOrigin='actual production bigint return';}
   else{
    // Observe this already authorized path/handle again; never replace the production Number Stats.
    const one=await invoke([{bigint:true}]),two=await invoke([{bigint:true}]);
    event.losslessCompanions=[{...stamp(state),identity:losslessIdentity(path,one),surface:statSurface(path,one)},{...stamp(state),identity:losslessIdentity(path,two),surface:statSurface(path,two)}];
    const a=event.losslessCompanions[0].identity,b=event.losslessCompanions[1].identity;
    guard.require(sameLossless(a,b),'identity-companion-change',path);
    for(const k of ['dev','ino','uid','gid','mode','size','nlink']){
     const value=returned[k];if(Number.isSafeInteger(value))guard.require(BigInt(value).toString()===a[k],'safe-return-companion-mismatch',path,{field:k});
    }
    guard.require(event.returnedSurface.type===a.type,'return-companion-type-mismatch',path);
    event.losslessIdentity=a;event.identityOrigin='two stable supplementary bigint observations after actual production numeric return';
    event.qualification='Unsafe Number fields are recorded as uncertain, never converted to bigint or represented as exact; production returned object is unchanged. Companions are distinct observations, not reconstructed Number identities. Numeric timestamps remain at supplied precision; companions retain ctimeNs/mtimeNs without coercion.';
   }
  }catch(e){if(e instanceof ProbeGuardError&&!state.guardFailures.some(x=>x.error?.message===e.message))state.guardFailures.push({...stamp(state),error:errorInfo(e),operation:e.operation,path:e.path,detail:e.detail});else if(!(e instanceof ProbeGuardError))guard.require(false,'identity-companion-uncertainty',path,errorInfo(e));throw e;}
  return returned;
 }
 const allowed={
  async lstat(path,...args){
   guard.require(guard.statAllowed(path),'lstat-path',path);
   return observeStat('lstat',path,args,a=>Reflect.apply(nativeFs.lstat,nativeFs,[path,...a]));
  },
  async readdir(path,...args){
   guard.require(guard.directoryAllowed(path)&&args.length===0,'readdir',path);
   const event={...stamp(state),method:'readdir',path,callerStack:new Error().stack};state.fsTrace.push(event);
   try{const result=await nativeFs.readdir(path);Object.assign(event,{ok:true,entries:result});guard.observeListing(path,result);return result;}
   catch(e){Object.assign(event,{ok:false,error:errorInfo(e)});throw e;}
  },
  async open(path,flags,...args){
   guard.require(guard.openAllowed(path,flags,args),'open-readonly-nofollow',path,{flags,args});
   const event={...stamp(state),method:'open',path,flags,callerStack:new Error().stack};state.fsTrace.push(event);
   let handle;try{handle=await nativeFs.open(path,flags);Object.assign(event,{ok:true,fd:handle.fd});}catch(e){Object.assign(event,{ok:false,error:errorInfo(e)});throw e;}
   const record={path,openSequence:event.sequence,fd:handle.fd,reads:[],identities:[],originalReturnedBytes:0,retainedBytes:0,completeRead:false};state.metadata.push(record);
   const chunks=[],hash=createHash('sha256');let eof=false;
   const methods={
    async stat(...args){
     const returned=await observeStat('handle.stat',path,args,a=>Reflect.apply(handle.stat,handle,a),{fd:handle.fd});
     const trace=state.fsTrace.at(-1);record.identities.push({sequence:trace.sequence,identity:trace.losslessIdentity,origin:trace.identityOrigin});return returned;
    },
    async read(buffer,offset,length,position){
     guard.require(readOK(buffer,offset,length,position),'handle.read-sentinel-bound',path,{bufferBytes:buffer?.length,offset,length,position});
     guard.require(record.originalReturnedBytes<=65537,'handle.read-capture-bound',path);
     const trace={...stamp(state),method:'handle.read',path,fd:handle.fd,bufferBytes:buffer.length,offset,requestedBytes:length,position};state.fsTrace.push(trace);
     try{
      const result=await handle.read(buffer,offset,length,position),bytes=Buffer.from(buffer.subarray(offset,offset+result.bytesRead));
      hash.update(bytes);record.originalReturnedBytes+=result.bytesRead;
      const room=65537-record.retainedBytes,keep=Buffer.from(bytes.subarray(0,Math.max(0,room)));chunks.push(keep);record.retainedBytes+=keep.length;if(result.bytesRead===0)eof=true;
      Object.assign(trace,{ok:true,bytesRead:result.bytesRead,returnedByteSha256:sha(bytes),returnBufferUnchanged:result.buffer===buffer});record.reads.push({sequence:trace.sequence,requestedBytes:length,bytesRead:result.bytesRead});
      // Input overflow is left to the unchanged product; recording retains only the bounded sentinel allowance.
      return result;
     }catch(e){Object.assign(trace,{ok:false,error:errorInfo(e)});throw e;}
    },
    async close(...args){
     guard.require(args.length===0,'handle.close-options',path);
     const trace={...stamp(state),method:'handle.close',path,fd:handle.fd};state.fsTrace.push(trace);
     try{const value=await handle.close();Object.assign(trace,{ok:true});Object.assign(record,{completeRead:eof,originalReturnedByteSha256:hash.digest('hex'),retainedBytesBase64:Buffer.concat(chunks).toString('base64'),captureComplete:record.originalReturnedBytes===record.retainedBytes,closedAtUtc:trace.atUtc});return value;}
     catch(e){Object.assign(trace,{ok:false,error:errorInfo(e)});throw e;}
    }
   };
   return new Proxy(methods,{get(target,key){if(key==='then')return undefined;if(Object.hasOwn(target,key))return target[key];guard.require(false,'file-handle-method',path,{method:String(key)});}});
  }
 };
 return new Proxy(allowed,{get(target,key){if(Object.hasOwn(target,key))return target[key];guard.require(false,'filesystem-method',String(key));}});
}
export function recordingLaunch(nativeSpawn,guard,state,homedir){
 return function launch(executable,args,options){
  guard.require(guard.launchOK(executable,args,options,homedir),'launch',executable,{argv:args,optionNames:Object.keys(options??{})});
  guard.require(state.children.length<8192,'actual-child-budget',executable);
  const kind=guard.commandKind(executable,args),cap=guard.outputCap(executable,args);
  const entry={...stamp(state),index:state.children.length,kind,argv:[executable,...args],cwd:process.cwd(),spawnOptions:options,outputCap:cap,events:[],killCalls:[],stdoutOriginalBytes:0,stderrOriginalBytes:0,retainedCombinedBytes:0,launchStack:new Error().stack};state.children.push(entry);
  let child;try{child=nativeSpawn(executable,args,options);entry.pid=child.pid??null;}catch(e){entry.spawnError=errorInfo(e);throw e;}
  const out=[],err=[],oh=createHash('sha256'),eh=createHash('sha256');
  const capture=(channel,chunks,hash)=>chunk=>{
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);hash.update(bytes);entry[channel+'OriginalBytes']+=bytes.length;
   const room=cap-entry.retainedCombinedBytes,keep=Buffer.from(bytes.subarray(0,Math.max(0,room)));chunks.push(keep);entry.retainedCombinedBytes+=keep.length;
   entry.events.push({...stamp(state),event:channel+'-data',bytes:bytes.length,sha256:sha(bytes),retainedBytes:keep.length});
  };
  child.stdout?.on('data',capture('stdout',out,oh));child.stderr?.on('data',capture('stderr',err,eh));
  const originalKill=child.kill;
  child.kill=function(...signals){
   guard.require(signals.length===1&&(signals[0]==='SIGTERM'||(kind==='diskutil'&&signals[0]==='SIGKILL')),'child-signal',executable,{signals});
   const event={...stamp(state),signals};entry.killCalls.push(event);
   try{const returned=Reflect.apply(originalKill,this,signals);event.returned=returned;return returned;}catch(e){event.error=errorInfo(e);throw e;}
  };
  child.on('spawn',()=>entry.events.push({...stamp(state),event:'spawn'}));
  child.on('error',e=>entry.events.push({...stamp(state),event:'error',error:errorInfo(e)}));
  child.on('exit',(code,signal)=>entry.events.push({...stamp(state),event:'exit',code,signal}));
  child.once('close',(code,signal)=>{
   entry.events.push({...stamp(state),event:'close',code,signal});
   Object.assign(entry,{closedAtUtc:new Date().toISOString(),exitCode:code,signal,stdoutOriginalSha256:oh.digest('hex'),stderrOriginalSha256:eh.digest('hex'),
    stdoutRetainedBase64:Buffer.concat(out).toString('base64'),stderrRetainedBase64:Buffer.concat(err).toString('base64'),
    captureComplete:entry.stdoutOriginalBytes+entry.stderrOriginalBytes===entry.retainedCombinedBytes});
  });
  return child;
 };
}
