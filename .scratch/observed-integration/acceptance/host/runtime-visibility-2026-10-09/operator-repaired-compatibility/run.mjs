import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { repo,ev,dir,sha,readRepo,writeNew,references,snapshot } from './common.mjs';
if(process.cwd()!==repo)throw new Error('Wrong outer CWD');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Unscrubbed outer environment');
const refs=await references();await writeNew('prior-evidence-reference.json',refs);
const before=await snapshot(refs);await writeNew('source-hashes-before.json',before);
if(!before.allMatch){await writeNew('result.json',{status:'pre-lookup-binding-refusal',lookupCalls:0,mismatches:before.mismatches});console.log(JSON.stringify({status:'pre-lookup-binding-refusal',lookupCalls:0,mismatches:before.mismatches}));process.exitCode=2;}
else {
 const environment={HOME:userInfo().homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
 const argv=[process.execPath,join(repo,dir,'probe.mjs')];
 const command={outerShellCommand:'env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS /opt/homebrew/Cellar/node/26.8.1/bin/node '+dir+'/run.mjs',cwd:process.cwd(),argv,probeEnvironment:environment,outerEnvironmentNames:Object.keys(process.env).sort(),scrubbed:['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'],node:process.version,startedAtUtc:new Date().toISOString(),outerCaptureLimitBytes:536870912,outerSignalPolicy:'No additional signals or deadline; production shared60s and child deadlines/termination/close handling preserved.',events:[]};
 const chunks=[],errors=[];let bytes=0,tooLarge=false;
 const child=spawn(argv[0],argv.slice(1),{cwd:repo,env:environment,shell:false,stdio:['ignore','pipe','pipe']});command.pid=child.pid??null;
 child.stdout.on('data',b=>{bytes+=b.length;if(bytes<=command.outerCaptureLimitBytes)chunks.push(Buffer.from(b));else tooLarge=true;});
 child.stderr.on('data',b=>{bytes+=b.length;if(bytes<=command.outerCaptureLimitBytes)errors.push(Buffer.from(b));else tooLarge=true;});
 child.on('error',e=>command.events.push({atUtc:new Date().toISOString(),event:'error',name:e.name,code:e.code??null,message:e.message}));
 child.on('exit',(code,signal)=>command.events.push({atUtc:new Date().toISOString(),event:'exit',code,signal}));
 const close=await new Promise(done=>child.once('close',(code,signal)=>done({code,signal})));
 Object.assign(command,{...close,closedAtUtc:new Date().toISOString(),capturedBytes:bytes,captureComplete:!tooLarge});command.events.push({atUtc:command.closedAtUtc,event:'close',...close});
 const stdout=Buffer.concat(chunks),stderr=Buffer.concat(errors);
 await writeNew('stdout.txt',stdout);await writeNew('stderr.txt',stderr);await writeNew('command.json',command);
 const after=await snapshot(refs);await writeNew('source-hashes-after.json',after);
 let result;try{result=JSON.parse(stdout);}catch(e){result={status:'probe-output-unparseable',lookupCalls:'UNKNOWN',error:{name:e.name,message:e.message}};}
 await writeNew('result.json',result);
 if(result.children){
  await fs.mkdir(join(repo,dir,'children'),{mode:0o700});await fs.mkdir(join(repo,dir,'metadata'),{mode:0o700});
  const childReceipts=[];
  for(const child of result.children){
   const name=String(child.index).padStart(4,'0');
   const out=Buffer.from(child.stdoutRetainedBase64??'','base64'),err=Buffer.from(child.stderrRetainedBase64??'','base64');
   await writeNew('children/'+name+'.stdout.bin',out);await writeNew('children/'+name+'.stderr.bin',err);
   const {stdoutRetainedBase64,stderrRetainedBase64,...receipt}=child;
   receipt.rawFiles={stdout:'children/'+name+'.stdout.bin',stderr:'children/'+name+'.stderr.bin',stdoutRetainedBytes:out.length,stderrRetainedBytes:err.length,stdoutRetainedSha256:sha(out),stderrRetainedSha256:sha(err),redaction:'none',complete:child.captureComplete===true};childReceipts.push(receipt);
  }
  const inputReceipts=[];
  for(let i=0;i<result.metadataInputs.length;i++){const input=result.metadataInputs[i],name=String(i).padStart(4,'0'),bytes=Buffer.from(input.retainedBytesBase64??'','base64');await writeNew('metadata/'+name+'.bin',bytes);const {retainedBytesBase64,...record}=input;record.rawFile='metadata/'+name+'.bin';record.retainedSha256=sha(bytes);record.redaction='none';inputReceipts.push(record);}
  await writeNew('child-receipts.json',childReceipts);await writeNew('filesystem-trace.json',result.fsTrace);await writeNew('caller-process-trace.json',result.processTrace);await writeNew('metadata-input-hashes.json',inputReceipts);await writeNew('guard-audit.json',{...result.readGuardAudit,guardFailures:result.guardFailures});
 }
 const summary={status:result.exactResult?.status??result.status,compatibility:result.exactResult?.compatibility??null,lookupCalls:result.lookupCalls,guardFailures:result.guardFailures?.length??null,childCount:result.children?.length??null,childrenClosed:result.children?.every(c=>c.closedAtUtc)??null,diskutilChildren:result.children?.filter(c=>c.kind==='diskutil').length??null,exitCode:close.code,signal:close.signal,preservationBefore:before.allMatch,preservationAfter:after.allMatch,counts:Object.fromEntries(Object.entries(after.groups).map(([k,v])=>[k,v.count])),outerCaptureComplete:!tooLarge,liveRows:result.liveRows??'UNVERIFIED'};
 await writeNew('summary.json',summary);
 const report=['# Repaired installed metadata compatibility recheck','',JSON.stringify(summary,null,2),'','Pinned full integration HEAD: e971d3312b595a5d841b1d70288302c40f7a5b70. Product Source:3edf247ab44d3332bc4bab5f3a43104536d84ce9, candidate720cb380d07102d72b20a6a4f5f7787a0ab88f2b.','', 'Actual integration CWD; sole term_19640861-824c-4f24-8789-3f584723bc5a, owner-confirmed GPT-6.1-Sol xhigh. Orca ownership metadata still main; no main working-tree file was accessed or modified.','', 'One actual installedHost / production allocationSourceProcess with recording launch seam / verifyInstalledCompatibility call. Production counters, internal mount proof calls, fixed environment, argv, output/deadline/abort/close behavior, readonly nofollow input and ancestor checks delegate unchanged. Nested diskutil children are captured at the real launch seam.','', 'Guard predicate audit performed in memory before lookup; no preliminary native trial. Pinned Source/dist request65536 bytes; authorized sentinel65537 request allowed with unchanged return bytes and unchanged production65536 input cap.','', 'Raw child stdout/stderr and metadata read bytes are retained as private binary files, with complete-original hashes/sizes and explicit capture completeness. No redaction was applied. Complete identity/caller traces and before/after correspondence are adjacent.','', 'Original phase1–5 artifacts, consumed policy/owner/gate bindings and original15 host files remain preserved according to explicit manifests; generated fake host runtime fixture traces, caches and symlinks were excluded and not followed.','', 'No account configuration/admission/journal/lease/Devices access, simulator or SDK/network/backend command, activation/migration, app build, live case, cleanup or claim change. L01–L05 remain UNVERIFIED. Return idle.',''].join('\n');
 await writeNew('report.md',report);
 console.log(JSON.stringify(summary));process.exitCode=close.code??2;
}
