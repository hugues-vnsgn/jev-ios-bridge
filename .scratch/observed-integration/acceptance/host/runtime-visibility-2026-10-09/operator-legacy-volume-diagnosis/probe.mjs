import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { parseReadonlyMountMetadata } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/dist/observed/installed-plist.js';

const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo)throw new Error('Wrong integration CWD');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Unscrubbed environment');
const roots=['/Library/Developer/CoreSimulator/Volumes/iOS_22G86','/Library/Developer/CoreSimulator/Volumes/iOS_23E254a'];
const suffix='/Library/Developer/CoreSimulator/Profiles/Runtimes';
const executable='/usr/sbin/diskutil',account=userInfo(),environment={HOME:account.homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
const signal=AbortSignal.timeout(60000),fsTrace=[],children=[],mounts=[],guardFailures=[],signalEvents=[];
let seq=0,lstats=0,bundleCount=0;
const stamp=()=>({sequence:++seq,atUtc:new Date().toISOString()}),sha=b=>createHash('sha256').update(b).digest('hex');
const errorInfo=e=>({name:e.name,message:e.message,code:e.code??null,stack:e.stack??null});
const canonical=p=>typeof p==='string'&&p.startsWith('/')&&resolve(p)===p&&!p.includes('\0')&&p.length<=4096&&p.split('/').every(x=>x.length<=255);
const allowedLstat=new Set(['/']),allowedListings=new Set(roots.map(r=>r+suffix));
function components(p){if(!canonical(p))throw new Error('Noncanonical metadata path');let current='/';const values=['/'];for(const name of p.split('/').filter(Boolean)){current=join(current,name);values.push(current);}return values;}
for(const p of [executable,...allowedListings])for(const component of components(p))allowedLstat.add(component);
function guard(ok,operation,p){if(!ok){const e=new Error('Manual diagnostic guard rejected '+operation+': '+p);guardFailures.push({...stamp(),operation,path:p,error:errorInfo(e)});throw e;}}
function identity(s){return {dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode,permissions:(s.mode&0o7777).toString(8).padStart(4,'0'),nlink:s.nlink,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',isSymbolicLink:s.isSymbolicLink()};}
signal.addEventListener('abort',()=>signalEvents.push({...stamp(),event:'shared60s-abort',reason:errorInfo(signal.reason)}),{once:true});
async function lstat(p,phase){
 signal.throwIfAborted();guard(canonical(p)&&allowedLstat.has(p),'lstat',p);if(++lstats>100000)throw new Error('100000 lstat-event bound exceeded');
 const record={...stamp(),method:'lstat',path:p,phase};fsTrace.push(record);
 try{const s=await fs.lstat(p);record.ok=true;record.identity=identity(s);signal.throwIfAborted();return record;}
 catch(e){record.ok=false;record.error=errorInfo(e);throw e;}
}
async function snapshotTargets(targets,phase){
 const paths=new Map();
 for(const [path,leafType]of targets)for(const component of components(path)){
  const type=component===path?leafType:'directory';
  if(paths.has(component)&&paths.get(component)!==type)throw new Error('Conflicting component type');
  paths.set(component,type);
 }
 const records=[];
 for(const [path,type]of paths){const record=await lstat(path,phase);records.push(record);
  if(record.identity.isSymbolicLink)throw new Error('Symlink component; no descendants authorized: '+path);
  if(record.identity.type!==type)throw new Error('Unexpected component type; no descendants authorized: '+path);
 }
 return records.map(r=>({path:r.path,sequence:r.sequence,...r.identity}));
}
const equalSnapshots=(a,b)=>a.length===b.length&&a.every((v,i)=>JSON.stringify({...v,sequence:undefined})===JSON.stringify({...b[i],sequence:undefined}));
const targetChain=root=>[[root+suffix,'directory']];
async function executableSnapshot(phase){
 const records=await snapshotTargets([[executable,'file']],phase);
 for(const r of records)if(![0,account.uid].includes(r.uid)||(r.mode&0o022)||(r.path===executable&&!(r.mode&0o111)))throw new Error('Fixed executable strict trust refusal: '+r.path);
 return records;
}
async function query(root){
 signal.throwIfAborted();guard(roots.includes(root)&&!children.some(c=>c.root===root),'once-exact-mount-query',root);
 const args=['info','-plist',root],receipt={...stamp(),index:children.length,root,argv:[executable,...args],cwd:process.cwd(),shell:false,environment,timeoutMs:10000,maxCombinedOutputBytes:65536,sharedDeadlineMs:60000,events:[],stdoutOriginalBytes:0,stderrOriginalBytes:0,retainedCombinedBytes:0,stopReason:null,closed:false};
 children.push(receipt);
 const out=[],err=[],outHash=createHash('sha256'),errHash=createHash('sha256');
 let child,stopped=false,timer,escalation;
 const stop=reason=>{
  if(stopped||receipt.closed)return;stopped=true;receipt.stopReason=reason;receipt.events.push({...stamp(),event:'stop-request',reason});
  try{const returned=child.kill('SIGTERM');receipt.events.push({...stamp(),event:'kill',signal:'SIGTERM',returned});}catch(e){receipt.events.push({...stamp(),event:'kill-error',signal:'SIGTERM',error:errorInfo(e)});}
  escalation=setTimeout(()=>{if(receipt.closed)return;try{const returned=child.kill('SIGKILL');receipt.events.push({...stamp(),event:'kill',signal:'SIGKILL',returned});}catch(e){receipt.events.push({...stamp(),event:'kill-error',signal:'SIGKILL',error:errorInfo(e)});}},250);
 };
 const abort=()=>stop('shared60s-abort');
 try{child=spawn(executable,args,{cwd:repo,shell:false,env:environment,stdio:['ignore','pipe','pipe']});receipt.pid=child.pid??null;}
 catch(e){receipt.spawnError=errorInfo(e);throw e;}
 const capture=(channel,chunks,hash)=>chunk=>{
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);hash.update(bytes);receipt[channel+'OriginalBytes']+=bytes.length;
  const room=65536-receipt.retainedCombinedBytes;let kept=0;if(room>0){const part=Buffer.from(bytes.subarray(0,room));chunks.push(part);receipt.retainedCombinedBytes+=part.length;kept=part.length;}
  receipt.events.push({...stamp(),event:channel+'-data',bytes:bytes.length,sha256:sha(bytes),retainedBytes:kept});
  if(receipt.stdoutOriginalBytes+receipt.stderrOriginalBytes>65536)stop('combined-output-overflow');
 };
 child.stdout.on('data',capture('stdout',out,outHash));child.stderr.on('data',capture('stderr',err,errHash));
 child.on('spawn',()=>receipt.events.push({...stamp(),event:'spawn'}));
 child.on('error',e=>{receipt.childError=errorInfo(e);receipt.events.push({...stamp(),event:'error',error:errorInfo(e)});});
 child.on('exit',(code,signal)=>receipt.events.push({...stamp(),event:'exit',code,signal}));
 timer=setTimeout(()=>stop('child10s-timeout'),10000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 await new Promise(done=>child.once('close',(code,sig)=>{
  receipt.closed=true;clearTimeout(timer);if(escalation)clearTimeout(escalation);signal.removeEventListener('abort',abort);
  receipt.events.push({...stamp(),event:'close',code,signal:sig});Object.assign(receipt,{exitCode:code,signal:sig,closedAtUtc:new Date().toISOString()});done();
 }));
 const stdout=Buffer.concat(out),stderr=Buffer.concat(err);
 Object.assign(receipt,{stdoutOriginalSha256:outHash.digest('hex'),stderrOriginalSha256:errHash.digest('hex'),stdoutRetainedBase64:stdout.toString('base64'),stderrRetainedBase64:stderr.toString('base64'),captureComplete:receipt.retainedCombinedBytes===receipt.stdoutOriginalBytes+receipt.stderrOriginalBytes});
 if(receipt.childError||receipt.exitCode!==0||receipt.signal!==null||receipt.stopReason||!receipt.captureComplete)throw new Error('Uncertain mount query completion: '+root);
 signal.throwIfAborted();return {receipt,stdout};
}
async function listRuntimeRoot(root,mount){
 const path=root+suffix,entry={path,before:await snapshotTargets(targetChain(root),'before-runtime-listing'),entries:null,after:null,stable:null};mount.runtimeListing=entry;
 signal.throwIfAborted();guard(allowedListings.has(path),'immediate-runtime-listing',path);
 const trace={...stamp(),method:'readdir',path,phase:'runtime-listing'};fsTrace.push(trace);
 try{const values=await fs.readdir(path);trace.ok=true;trace.entries=values;entry.entries=values;signal.throwIfAborted();}catch(e){trace.ok=false;trace.error=errorInfo(e);throw e;}
 entry.after=await snapshotTargets(targetChain(root),'after-runtime-listing');entry.stable=equalSnapshots(entry.before,entry.after);
 if(!entry.stable)throw new Error('Runtime listing ancestor identity changed: '+path);
 if(entry.entries.length>1000)throw new Error('Immediate runtime listing exceeds1000 entries');
 for(const n of entry.entries)if(typeof n!=='string'||!n.length||n.length>255||n.includes('/')||n.includes('\0')||n==='.'||n==='..')throw new Error('Unsafe immediate runtime basename');
 const names=entry.entries.filter(n=>n.endsWith('.simruntime')).sort();bundleCount+=names.length;if(bundleCount>1000)throw new Error('Aggregate runtime bundle bound exceeded');
 mount.runtimeBundleBasenames=names;mount.runtimeBundles=[];
 for(const name of names){
  signal.throwIfAborted();const base=join(path,name),targets=['/Contents/Info.plist','/Contents/Resources/profile.plist','/Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'].map(s=>[base+s,'file']);
  for(const [p]of targets)for(const component of components(p))allowedLstat.add(component);
  const bundle={basename:name,bundlePath:base,before:null,after:null,stable:null};mount.runtimeBundles.push(bundle);
  bundle.before=await snapshotTargets(targets,'runtime-bundle-identities-before');
  bundle.after=await snapshotTargets(targets,'runtime-bundle-identities-after');bundle.stable=equalSnapshots(bundle.before,bundle.after);
  if(!bundle.stable)throw new Error('Runtime component identity changed: '+base);
 }
 const finalChain=await snapshotTargets(targetChain(root),'after-runtime-component-inspection');mount.finalChain=finalChain;
 if(!equalSnapshots(entry.after,finalChain))throw new Error('Runtime root changed during component inspection');
}
const startedAtUtc=new Date().toISOString();let status='COMPLETE_TWO_MOUNT_DIAGNOSIS',uncertainty=null;
try{
 for(const root of roots){
  signal.throwIfAborted();const mount={root,proof:null,readOnlyConclusion:'UNKNOWN',rootBefore:null,rootAfter:null,executableBefore:null,executableAfter:null,queryStable:null,parserError:null};mounts.push(mount);
  mount.executableBefore=await executableSnapshot('before-mount-query-executable');
  mount.rootBefore=await snapshotTargets(targetChain(root),'before-mount-query-root-and-suffix');
  const {receipt,stdout}=await query(root);mount.childIndex=receipt.index;
  mount.rootAfter=await snapshotTargets(targetChain(root),'after-mount-query-root-and-suffix');
  mount.executableAfter=await executableSnapshot('after-mount-query-executable');
  mount.queryStable=equalSnapshots(mount.rootBefore,mount.rootAfter)&&equalSnapshots(mount.executableBefore,mount.executableAfter);
  try{mount.proof=parseReadonlyMountMetadata(stdout.toString('utf8'),root);}
  catch(e){mount.parserError=errorInfo(e);throw new Error('Shipped pure parser refused exact mount proof: '+root);}
  if(!mount.queryStable)throw new Error('Mount query ancestor identity changed: '+root);
  mount.readOnlyConclusion='EXACT_MOUNT_REPORTS_UNWRITABLE';
  await listRuntimeRoot(root,mount);
 }
}catch(e){status='STOPPED_ON_FIRST_UNCERTAINTY';uncertainty={...stamp(),error:errorInfo(e),mount:mounts.at(-1)?.root??null};}
const permissions=new Map();
for(const e of fsTrace)if(e.method==='lstat'&&e.ok)permissions.set(e.path,{path:e.path,...e.identity});
const result={scope:'Separate manual bounded legacy-volume metadata diagnosis; no production compatibility call, runtime byte read or SourceProcess bypass.',
 startedAtUtc,completedAtUtc:new Date().toISOString(),cwd:process.cwd(),node:process.version,execPath:process.execPath,roots,status,uncertainty,guardFailures,
 invokedChildren:children.length,perRootQueryCounts:Object.fromEntries(roots.map(root=>[root,children.filter(c=>c.root===root).length])),mounts,children,fsTrace,permissionPatterns:[...permissions.values()],signalEvents,lstatEventCount:lstats,aggregateRuntimeBundleCount:bundleCount,
 parser:'Actual shipped pure dist/observed/installed-plist.js parseReadonlyMountMetadata',
 limits:{shared60s:true,child10s:true,combined65536:true,mountOnly250msHardEscalation:true,path4096:true,listing1000:true,aggregateBundles1000:true,lstat100000:true,readonlyNonsymlinkTraversalOnly:true},
 runtimeFileOpenCount:0,plutilCount:0,compatibilityLookupCount:0,
 trustPolicy:'Legacy volume trust proposal remains unapproved. Permission observations are manual diagnostic metadata, not production guard authorization or compatibility certification.',
 liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'},rawEvidencePolicy:'Raw received child bytes retained within64KiB; complete-original hashes/sizes and completeness explicit; no redaction, credentials or loader variables inherited.'};
console.log(JSON.stringify(result,null,2));process.exitCode=uncertainty?3:0;
