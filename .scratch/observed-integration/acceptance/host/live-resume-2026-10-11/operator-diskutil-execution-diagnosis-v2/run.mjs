import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join,resolve,relative } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
const dir='.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-diskutil-execution-diagnosis-v2';
const prior='.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-compatibility-v2';
const mount='/Library/Developer/CoreSimulator/Volumes/iOS_22G86';
const argv=['/usr/sbin/diskutil','info','-plist',mount];
const env={HOME:'/Users/hugues_mini',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
const cap=65536,timeoutMs=10000,escalationMs=250;
const sha=b=>createHash('sha256').update(b).digest('hex');
const errorInfo=e=>({name:e?.name??typeof e,message:e?.message??String(e),code:e?.code??null,stack:e?.stack??null});
const at=()=>new Date().toISOString();
if(process.cwd()!==repo||process.execPath!=='/opt/homebrew/Cellar/node/26.8.1/bin/node'||process.version!=='v26.8.1'||process.argv.length!==3||process.argv[2]!=='--elevated-once')throw new Error('Unexpected diagnostic command');
for(const name of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,name))throw new Error('Unscrubbed environment');
const outerEnvironmentNames=Object.keys(process.env).sort();
if(outerEnvironmentNames.some(k=>!Object.hasOwn(env,k)&&k!=='__CF_USER_TEXT_ENCODING')||Object.entries(env).some(([k,v])=>process.env[k]!==v))throw new Error('Outer environment differs from bounded expected environment');
process.umask(0o077);
async function readRepo(path){
 const p=resolve(repo,path);if(!p.startsWith(repo+'/')||p===join(repo,'.env'))throw new Error('Unauthorized evidence/parser read');
 let current=repo;const parts=relative(repo,p).split('/');
 for(let i=0;i<parts.length;i++){current=join(current,parts[i]);const s=await fs.lstat(current,{bigint:true});if(s.isSymbolicLink()||(i<parts.length-1&&!s.isDirectory()))throw new Error('Repository alias');}
 const s=await fs.lstat(p,{bigint:true});if(!s.isFile()||s.nlink!==1n)throw new Error('Not regular single-link input');
 const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.size,s.nlink,s.mtimeNs,s.ctimeNs].map(String).join(':');
 const handle=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(identity(s)!==identity(await handle.stat({bigint:true})))throw new Error('Input replaced');const bytes=await handle.readFile();
  if(identity(s)!==identity(await handle.stat({bigint:true}))||identity(s)!==identity(await fs.lstat(p,{bigint:true})))throw new Error('Input changed');return bytes;
 }finally{await handle.close();}
}
async function writeNew(name,value){
 const p=resolve(repo,dir,name);if(!p.startsWith(join(repo,dir)+'/'))throw new Error('Outside private diagnostic evidence');
 await fs.writeFile(p,Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
const directory=await fs.lstat(join(repo,dir));if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o777)!==0o700)throw new Error('Private directory mismatch');
await writeNew('outer-environment-names.json',{scope:'Names only; optional Apple-injected __CF_USER_TEXT_ENCODING is never forwarded.',names:outerEnvironmentNames});
await writeNew('query-claimed.json',{claimedAtUtc:at(),diagnosticBudget:1,compatibilityRerun:false});
const parserPath='dist/observed/installed-plist.js',parserPin='bfa578bac5fe8b3a1101ea945b8db8f0f54bccf29c9ab4de0122831d0162df5f';
let receipt,result,priorChild,priorReceiptsPin,priorOut,priorErr,parserBefore;
try{
 parserBefore=await readRepo(parserPath);if(sha(parserBefore)!==parserPin)throw new Error('Reviewed parser changed');
 const priorBytes=await readRepo(prior+'/child-receipts.json');priorReceiptsPin=sha(priorBytes);priorChild=JSON.parse(priorBytes)[134];
 if(priorChild.index!==134||JSON.stringify(priorChild.argv)!==JSON.stringify(argv)||JSON.stringify(priorChild.spawnOptions)!==JSON.stringify({shell:false,env,stdio:['ignore','pipe','pipe']})
  ||priorChild.exitCode!==1||priorChild.signal!==null||!priorChild.closedAtUtc||!priorChild.captureComplete)throw new Error('Exact failed child0134 binding mismatch');
 priorOut=await readRepo(prior+'/children/0134.stdout.bin');priorErr=await readRepo(prior+'/children/0134.stderr.bin');
 if(priorOut.length!==0||priorErr.length!==203||sha(priorOut)!==priorChild.stdoutOriginalSha256||sha(priorErr)!==priorChild.stderrOriginalSha256)throw new Error('Failed child0134 raw bytes mismatch');
 await writeNew('failed-child0134-receipt.json',priorChild);await writeNew('failed-child0134.stdout.bin',priorOut);await writeNew('failed-child0134.stderr.bin',priorErr);
 receipt={argv,cwd:repo,spawnOptions:{shell:false,env,stdio:['ignore','pipe','pipe']},startedAtUtc:at(),outputCap:cap,timeoutMs,escalationMs,events:[],killCalls:[],
  stdoutOriginalBytes:0,stderrOriginalBytes:0,retainedCombinedBytes:0,permissionRequest:'exec_command require_escalated; one bounded read-only diagnostic only',outerEnvironment:env};
 const out=[],err=[],oh=createHash('sha256'),eh=createHash('sha256');
 let child,stopped=false,overflow=false,timedOut=false,childError,timer,escalation;
 const stop=reason=>{
  if(stopped)return;stopped=true;if(reason==='timeout')timedOut=true;
  receipt.events.push({atUtc:at(),event:'stop-request',reason});
  const deliver=signal=>{const item={atUtc:at(),signal};receipt.killCalls.push(item);try{item.returned=child.kill(signal);}catch(e){item.error=errorInfo(e);childError=e;}};
  deliver('SIGTERM');escalation=setTimeout(()=>deliver('SIGKILL'),escalationMs);
 };
 try{child=spawn(argv[0],argv.slice(1),receipt.spawnOptions);receipt.pid=child.pid??null;}
 catch(e){receipt.spawnError=errorInfo(e);throw e;}
 const capture=(channel,list,hash)=>chunk=>{
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);hash.update(bytes);receipt[channel+'OriginalBytes']+=bytes.length;
  const room=cap-receipt.retainedCombinedBytes,keep=Buffer.from(bytes.subarray(0,Math.max(0,room)));list.push(keep);receipt.retainedCombinedBytes+=keep.length;
  receipt.events.push({atUtc:at(),event:channel+'-data',bytes:bytes.length,sha256:sha(bytes),retainedBytes:keep.length});
  if(receipt.stdoutOriginalBytes+receipt.stderrOriginalBytes>cap){overflow=true;stop('output-overflow');}
 };
 child.stdout.on('data',capture('stdout',out,oh));child.stderr.on('data',capture('stderr',err,eh));
 child.on('spawn',()=>receipt.events.push({atUtc:at(),event:'spawn'}));
 child.on('error',e=>{childError=e;receipt.events.push({atUtc:at(),event:'error',error:errorInfo(e)});});
 child.on('exit',(code,signal)=>receipt.events.push({atUtc:at(),event:'exit',code,signal}));
 timer=setTimeout(()=>stop('timeout'),timeoutMs);
 const close=await new Promise(done=>child.once('close',(code,signal)=>{clearTimeout(timer);if(escalation)clearTimeout(escalation);receipt.events.push({atUtc:at(),event:'close',code,signal});done({code,signal});}));
 Object.assign(receipt,{closedAtUtc:at(),exitCode:close.code,signal:close.signal,timedOut,overflow,stopped,childError:childError?errorInfo(childError):null,
  stdoutOriginalSha256:oh.digest('hex'),stderrOriginalSha256:eh.digest('hex'),captureComplete:receipt.stdoutOriginalBytes+receipt.stderrOriginalBytes===receipt.retainedCombinedBytes,redaction:'none'});
 const stdout=Buffer.concat(out),stderr=Buffer.concat(err);await writeNew('stdout.bin',stdout);await writeNew('stderr.bin',stderr);await writeNew('child-receipt.json',receipt);
 let parsed=null,parseError=null;
 if(close.code===0&&close.signal===null&&!stopped&&!childError&&!overflow&&receipt.captureComplete){
  try{const parser=await import(pathToFileURL(join(repo,parserPath)).href);parsed=parser.parseReadonlyMountMetadata(stdout.toString('utf8'),mount);}catch(e){parseError=errorInfo(e);}
 }
 const parserAfter=await readRepo(parserPath),priorAfter=await readRepo(prior+'/child-receipts.json'),rawOutAfter=await readRepo(prior+'/children/0134.stdout.bin'),rawErrAfter=await readRepo(prior+'/children/0134.stderr.bin');
 const preserved=sha(parserAfter)===parserPin&&sha(priorAfter)===priorReceiptsPin&&sha(rawOutAfter)===sha(priorOut)&&sha(rawErrAfter)===sha(priorErr);
 result={status:parsed&&preserved?'ELEVATED_QUERY_READONLY_MOUNT_CONFIRMED':'DIAGNOSTIC_REFUSAL',diagnosticCalls:1,compatibilityCalls:0,compatibility:'UNVERIFIED',argv,parsed,parseError,
  childExitCode:close.code,childSignal:close.signal,actualClose:receipt.closedAtUtc,timedOut,overflow,captureComplete:receipt.captureComplete,priorChild0134:{exitCode:1,stdoutBytes:0,stderrBytes:203,stderrSha256:sha(priorErr)},
  comparison:{argvEqual:true,environmentEqual:true,shellFalseUnchanged:true,originalFailureStderrEqual:stderr.equals(priorErr),freshExitSuccessful:close.code===0,freshStdoutBytes:stdout.length,freshStderrBytes:stderr.length},
  evidencePreserved:preserved,parserPath,parserSha256:parserPin,permissionScope:'A require_escalated tool execution was requested. The tool result is the authority for actual elevation approval; no permission-profile or credential value was inspected.',
  finding:parsed?'The same exact read-only query succeeds in the elevated execution context, while child0134 failed under default workspace-write. This isolates execution context as relevant; the specific sandbox/framework/IPC rule is not identified. Fresh typed read-only mount fields are confirmed only for this single query.':'The elevated query did not establish a typed read-only mount proof; no alternate route or repeat.',
  operatorState:'IDLE_FOR_ROOT_AUDIT'};
}catch(e){result={status:'DIAGNOSTIC_SCRIPT_FAILURE',error:errorInfo(e),diagnosticCalls:receipt?'ATTEMPTED_ONCE':0,compatibilityCalls:0,compatibility:'UNVERIFIED',operatorState:'IDLE_FOR_ROOT_AUDIT'};}
await writeNew('result.json',result);
await writeNew('report.md','# Bounded diskutil execution-context diagnosis\n\n'+JSON.stringify(result,null,2)+'\n\nOnly failed child0134 and the pinned production parser were consumed as comparison inputs. Raw outputs, argv, exact minimal environment, exits, signals, timeout/overflow handling and actual close are adjacent. No compatibility rerun, native follow-up, host/runtime/account/device mutation, SDK/network/app build, migration or live case. The diagnostic does not pass production compatibility. Operator idle.\n');
const files=[];for(const name of (await fs.readdir(join(repo,dir))).sort()){
 const p=join(repo,dir,name),s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600)throw new Error('Evidence type/mode mismatch');const bytes=await readRepo(dir+'/'+name);files.push({path:name,bytes:bytes.length,sha256:sha(bytes),mode:'0600'});
}
await writeNew('artifact-hashes.json',{sealedAtUtc:at(),scope:'All diagnostic evidence except this manifest itself; exact received tool approval result is preserved separately if available.',directoriesMode:'0700',files});
console.log(JSON.stringify({status:result.status,diagnosticCalls:result.diagnosticCalls,compatibilityCalls:0,parsed:result.parsed??null,childExitCode:result.childExitCode??null,actualClose:result.actualClose??null,operatorState:result.operatorState}));process.exitCode=result.status==='ELEVATED_QUERY_READONLY_MOUNT_CONFIRMED'?0:2;
