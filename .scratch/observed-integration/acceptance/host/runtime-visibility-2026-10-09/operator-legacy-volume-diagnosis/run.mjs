import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import {repo,ev,dir,sha,readRepo,writeNew,references,snapshot} from './common.mjs';
if(process.cwd()!==repo)throw new Error('Wrong outer integration CWD');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Unscrubbed outer environment');
const refs=await references();await writeNew('preservation-references.json',refs);
const before=await snapshot(refs);await writeNew('preservation-before.json',before);
if(!before.allMatch){await writeNew('result.json',{status:'PRE_NATIVE_PRESERVATION_REFUSAL',nativeChildren:0,mismatches:before.mismatches});console.log(JSON.stringify({status:'PRE_NATIVE_PRESERVATION_REFUSAL',nativeChildren:0,mismatches:before.mismatches}));process.exitCode=2;}
else{
 const environment={HOME:userInfo().homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
 const argv=[process.execPath,join(repo,dir,'probe.mjs')],receipt={outerShellCommand:'env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS /opt/homebrew/Cellar/node/26.8.1/bin/node '+dir+'/run.mjs',argv,cwd:repo,node:process.version,environment,outerEnvironmentNames:Object.keys(process.env).sort(),scrubbed:['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'],startedAtUtc:new Date().toISOString(),events:[],captureLimit:536870912,outerSignalPolicy:'No added outer signals; diagnostic shared60s, child10s and mount-only250ms escalation, settlement on close.'};
 const out=[],err=[];let bytes=0,overflow=false;
 const child=spawn(argv[0],argv.slice(1),{cwd:repo,shell:false,env:environment,stdio:['ignore','pipe','pipe']});receipt.pid=child.pid??null;
 child.stdout.on('data',b=>{bytes+=b.length;if(bytes<=receipt.captureLimit)out.push(Buffer.from(b));else overflow=true;});
 child.stderr.on('data',b=>{bytes+=b.length;if(bytes<=receipt.captureLimit)err.push(Buffer.from(b));else overflow=true;});
 child.on('error',e=>receipt.events.push({atUtc:new Date().toISOString(),event:'error',name:e.name,message:e.message,code:e.code??null}));
 child.on('exit',(code,signal)=>receipt.events.push({atUtc:new Date().toISOString(),event:'exit',code,signal}));
 const completion=await new Promise(done=>child.once('close',(code,signal)=>done({code,signal})));Object.assign(receipt,completion,{closedAtUtc:new Date().toISOString(),outputBytes:bytes,captureComplete:!overflow});receipt.events.push({atUtc:receipt.closedAtUtc,event:'close',...completion});
 const stdout=Buffer.concat(out),stderr=Buffer.concat(err);await writeNew('stdout.txt',stdout);await writeNew('stderr.txt',stderr);await writeNew('command.json',receipt);
 const after=await snapshot(refs);await writeNew('preservation-after.json',after);
 let result;try{result=JSON.parse(stdout);}catch(e){result={status:'PROBE_OUTPUT_UNCERTAINTY',error:{name:e.name,message:e.message},nativeChildren:'UNKNOWN'};}
 await writeNew('result.json',result);
 if(result.children){
  await fs.mkdir(join(repo,dir,'children'),{mode:0o700});const children=[];
  for(const c of result.children){const name=String(c.index).padStart(2,'0'),out=Buffer.from(c.stdoutRetainedBase64??'','base64'),err=Buffer.from(c.stderrRetainedBase64??'','base64');
   await writeNew('children/'+name+'.stdout.bin',out);await writeNew('children/'+name+'.stderr.bin',err);
   const {stdoutRetainedBase64,stderrRetainedBase64,...entry}=c;entry.rawFiles={stdout:'children/'+name+'.stdout.bin',stderr:'children/'+name+'.stderr.bin',stdoutRetainedBytes:out.length,stderrRetainedBytes:err.length,stdoutRetainedSha256:sha(out),stderrRetainedSha256:sha(err),redaction:'none',complete:c.captureComplete===true};children.push(entry);
  }
  await writeNew('child-receipts.json',children);await writeNew('filesystem-identities.json',result.fsTrace);await writeNew('permission-patterns.json',result.permissionPatterns);await writeNew('mount-proofs.json',result.mounts);
 }
 const summary={status:result.status,uncertainty:result.uncertainty??result.error??null,nativeChildren:result.invokedChildren,perRootQueryCounts:result.perRootQueryCounts,mountProofs:result.mounts?.map(m=>({root:m.root,readOnlyConclusion:m.readOnlyConclusion,proof:m.proof,queryStable:m.queryStable,runtimeListingStable:m.runtimeListing?.stable??null,runtimeEntries:m.runtimeListing?.entries?.length??null,runtimeBundleBasenames:m.runtimeBundleBasenames??null,bundleIdentityStability:m.runtimeBundles?.map(b=>({basename:b.basename,stable:b.stable}))??null})),exitCode:completion.code,signal:completion.signal,allChildrenClosed:result.children?.every(c=>c.closed)??null,allRawOutputsComplete:result.children?.every(c=>c.captureComplete)??null,allChildrenExit0:result.children?.every(c=>c.exitCode===0&&c.signal===null)??null,lstatEvents:result.lstatEventCount,runtimeFileOpenCount:result.runtimeFileOpenCount,plutilCount:result.plutilCount,compatibilityLookupCount:result.compatibilityLookupCount,preservationBefore:before.allMatch,preservationAfter:after.allMatch,preservationCounts:Object.fromEntries(Object.entries(after.groups).map(([k,v])=>[k,v.count])),liveRows:result.liveRows??'UNVERIFIED'};
 await writeNew('summary.json',summary);
 const report=['# Bounded manual legacy-volume metadata diagnosis','',JSON.stringify(summary,null,2),'', 'Full HEAD pin:91084c0c065373a978c8437f8f8362c4f5e4dbc9. Product Source:3edf247ab44d3332bc4bab5f3a43104536d84ce9, candidate720cb380d07102d72b20a6a4f5f7787a0ab88f2b. Sole owner-confirmed GPT-6.1-Sol xhigh operator; actual integration CWD. Orca historical main ownership disclosed; main working-tree files unused.','', 'Exact two roots bound from genuine prior trace8988. Native schedule is only serial /usr/sbin/diskutil info -plist, once per root, stopping on first uncertainty. Each child has fixed argv/environment,64KiB combined output,10s deadline, shared60s, mount-only SIGTERM/250ms SIGKILL escalation and confirmed close. No native trial.','', 'Shipped pure parseReadonlyMountMetadata validates exact MountPoint and three typed false Writable fields. lstat snapshots include canonical / ancestors and known suffix, before/after queries and immediate listings; runtime bundle component chains/leaves only. No runtime file contents opened or plutil conversion. Permissions/devices are recorded metadata, not newly approved trust.','', 'All raw bytes, original and retained hashes/sizes/completeness, child events/argv/cwd, filesystem identity traces and explicit Source/dist/original-host/prior compatibility/Root record hash vectors are private and adjacent. Only new operator-legacy-volume-diagnosis artifacts were written. No fake-host caches/traces/symlinks followed.','', 'Production compatibility was not repeated. No Source/dist changes, tests/builds/commits, account/config/admission/journal/lease/Devices, simulator/device/SDK/network/backend, app/migration/activation/live/download/mount/permission/cleanup/claim operations. Legacy trust proposal remains unapproved; L01–L05 UNVERIFIED. Return idle.',''].join('\n');await writeNew('report.md',report);
 console.log(JSON.stringify(summary));process.exitCode=completion.code??2;
}
