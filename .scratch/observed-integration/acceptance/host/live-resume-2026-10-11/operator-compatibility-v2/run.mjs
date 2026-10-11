import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { repo,dir,rootHead,readRepo,writeNew,snapshot,seal,sha } from './common.mjs';
import { environmentFor } from './guards.mjs';
if(process.cwd()!==repo||process.argv.length!==3||process.argv[2]!=='--execute-once-after-root-review')throw new Error('Execution withheld pending explicit Root review');
if(process.execPath!=='/opt/homebrew/Cellar/node/26.8.1/bin/node'||process.version!=='v26.8.1')throw new Error('Unpinned Node');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Unscrubbed outer environment');
const refs=JSON.parse(await readRepo(dir+'/references.json')).groups;
const preparation=JSON.parse(await readRepo(dir+'/artifact-hashes-prepared.json'));
for(const f of preparation.files)if(sha(await readRepo(dir+'/'+f.path))!==f.sha256)throw new Error('Reviewed preparation file changed: '+f.path);
const before=await snapshot(refs);await writeNew('execution-source-hashes-before.json',before);
if(!before.allMatch){await writeNew('result.json',{status:'PROBE_FAILURE',stage:'pre-lookup-binding',lookupCalls:0,mismatches:before.mismatches});await writeNew('report.md','PROBE_FAILURE before lookup: pinned correspondence changed. No lookup ran; operator idle.\n');await seal();process.exitCode=2;}
else{
 // Exclusive creation consumes the one dispatch budget; never rerun after any result or uncertainty.
 await writeNew('lookup-claimed.json',{claimedAtUtc:new Date().toISOString(),rootHead,lookupBudget:1,phase:'reviewed-once-metadata'});
 const env=environmentFor(userInfo().homedir),argv=[process.execPath,join(repo,dir,'probe.mjs'),'--root-reviewed-single-lookup'];
 const command={outerShellCommand:'env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS /opt/homebrew/Cellar/node/26.8.1/bin/node '+dir+'/run.mjs --execute-once-after-root-review',
  cwd:repo,argv,env,outerEnvironmentNames:Object.keys(process.env).sort(),startedAtUtc:new Date().toISOString(),events:[],captureLimitBytes:536870912,
  outerSignalPolicy:'No added timeout or signal; pinned production shared60s and child termination/close behavior preserved.'};
 let child;const out=[],err=[],outHash=(await import('node:crypto')).createHash('sha256'),errHash=(await import('node:crypto')).createHash('sha256');let outBytes=0,errBytes=0,retained=0,overflow=false;
 try{child=spawn(argv[0],argv.slice(1),{cwd:repo,env,shell:false,stdio:['ignore','pipe','pipe']});command.pid=child.pid??null;}
 catch(e){await writeNew('result.json',{status:'PROBE_FAILURE',stage:'outer-spawn',lookupCalls:0,budgetConsumed:true,error:{name:e.name,message:e.message}});throw e;}
 const capture=(list,hash,channel)=>chunk=>{hash.update(chunk);if(channel==='stdout')outBytes+=chunk.length;else errBytes+=chunk.length;
  const room=command.captureLimitBytes-retained,keep=Buffer.from(chunk.subarray(0,Math.max(0,room)));list.push(keep);retained+=keep.length;if(keep.length!==chunk.length)overflow=true;};
 child.stdout.on('data',capture(out,outHash,'stdout'));child.stderr.on('data',capture(err,errHash,'stderr'));
 child.on('error',e=>command.events.push({atUtc:new Date().toISOString(),event:'error',name:e.name,message:e.message,code:e.code??null}));
 child.on('exit',(code,signal)=>command.events.push({atUtc:new Date().toISOString(),event:'exit',code,signal}));
 const close=await new Promise(done=>child.once('close',(code,signal)=>done({code,signal})));
 command.events.push({atUtc:new Date().toISOString(),event:'close',...close});
 Object.assign(command,{closedAtUtc:new Date().toISOString(),...close,stdoutOriginalBytes:outBytes,stderrOriginalBytes:errBytes,stdoutOriginalSha256:outHash.digest('hex'),stderrOriginalSha256:errHash.digest('hex'),captureComplete:!overflow,retainedBytes:retained,redaction:'none'});
 const stdout=Buffer.concat(out),stderr=Buffer.concat(err);await writeNew('stdout.txt',stdout);await writeNew('stderr.txt',stderr);await writeNew('command.json',command);
 const after=await snapshot(refs);await writeNew('execution-source-hashes-after.json',after);
 let result;try{result=JSON.parse(stdout);}catch(e){result={exactResult:{status:'PROBE_FAILURE',cause:'Unparseable probe output'},lookupCalls:'UNKNOWN',error:{name:e.name,message:e.message}};}
 if(overflow||!after.allMatch)result={...result,priorExactResult:result.exactResult,exactResult:{status:'PROBE_FAILURE',cause:overflow?'Outer capture overflow':'After-lookup correspondence mismatch'}};
 await writeNew('result.json',result);
 if(result.children){
  await fs.mkdir(join(repo,dir,'children'),{mode:0o700});await fs.mkdir(join(repo,dir,'metadata'),{mode:0o700});
  const children=[];for(const c of result.children){const name=String(c.index).padStart(4,'0'),out=Buffer.from(c.stdoutRetainedBase64??'','base64'),err=Buffer.from(c.stderrRetainedBase64??'','base64');
   await writeNew('children/'+name+'.stdout.bin',out);await writeNew('children/'+name+'.stderr.bin',err);
   const {stdoutRetainedBase64,stderrRetainedBase64,...receipt}=c;children.push({...receipt,rawFiles:{stdout:'children/'+name+'.stdout.bin',stderr:'children/'+name+'.stderr.bin',stdoutRetainedBytes:out.length,stderrRetainedBytes:err.length,stdoutRetainedSha256:sha(out),stderrRetainedSha256:sha(err),complete:c.captureComplete===true,redaction:'none'}});
  }
  const inputs=[];for(let i=0;i<result.metadata.length;i++){const m=result.metadata[i],name=String(i).padStart(4,'0'),bytes=Buffer.from(m.retainedBytesBase64??'','base64');await writeNew('metadata/'+name+'.bin',bytes);const {retainedBytesBase64,...receipt}=m;inputs.push({...receipt,rawFile:'metadata/'+name+'.bin',retainedSha256:sha(bytes),redaction:'none'});}
  await writeNew('child-receipts.json',children);await writeNew('metadata-input-hashes.json',inputs);await writeNew('filesystem-trace.json',result.fsTrace);await writeNew('caller-process-trace.json',result.processTrace);
 }
 const summary={status:result.exactResult?.status??'PROBE_FAILURE',compatibility:result.exactResult?.compatibility??null,lookupCalls:result.lookupCalls,guardFailures:result.guardFailures?.length??null,childCount:result.children?.length??null,childrenClosed:result.children?.every(c=>Boolean(c.closedAtUtc))??null,
  preservationBefore:before.allMatch,preservationAfter:after.allMatch,outerCaptureComplete:!overflow,exitCode:close.code,signal:close.signal,operatorState:'IDLE_FOR_ROOT_AUDIT'};
 await writeNew('summary.json',summary);
 await writeNew('report.md','# Once metadata compatibility result\n\n'+JSON.stringify(summary,null,2)+'\n\nPinned full HEAD '+rootHead+'. See result.json, complete lossless identity traces, original/retained byte receipts and before/after correspondence. Any guard mismatch is probe failure. No repeat, cleanup, operational entry, migration or L01–L05 is authorized. Operator idle for Root cause/result audit.\n');
 await seal();console.log(JSON.stringify(summary));process.exitCode=summary.status==='PASS'?0:2;
}
