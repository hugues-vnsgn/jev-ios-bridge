import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { join, resolve } from 'node:path';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo)throw new Error('Unexpected cwd');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Sensitive or loader environment key present');
const account=userInfo();
const developer='/Applications/Xcode.app/Contents/Developer';
const simulator='/Library/Developer/CoreSimulator';
const assets='/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime';
const roots=[simulator+'/Images',simulator+'/Cryptex',simulator+'/Volumes',simulator+'/Profiles/Runtimes',assets];
const targets=[
 {path:'/Applications/Xcode.app/Contents/Info.plist',type:'file'},
 {path:'/Applications/Xcode.app/Contents/version.plist',type:'file'},
 {path:'/Applications/Xcode.app/Contents/MacOS/Xcode',type:'file'},
 {path:developer,type:'directory'},
 {path:developer+'/usr/bin/simctl',type:'file'},
 {path:developer+'/Platforms/iPhoneSimulator.platform',type:'directory'},
 {path:'/System/Library/CoreServices/SystemVersion.plist',type:'file'},
 {path:'/usr/bin/xcrun',type:'file'},
 {path:'/usr/bin/plutil',type:'file'},
 ...['Profiles/DeviceTypes','Profiles/Runtimes','Volumes','Images','Cryptex'].map(p=>({path:simulator+'/'+p,type:'directory'}))
];
const startedAt=new Date().toISOString();
const trace=[],ancestorStats=[],ancestorCache=new Map(),inventories=[],metadata=[],children=[],limits=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const describe=s=>({type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',uid:s.uid,gid:s.gid,mode:'0'+(s.mode&0o7777).toString(8),modeBits:s.mode,nlink:s.nlink,size:s.size,dev:s.dev,ino:s.ino,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.mode,s.uid,s.gid,s.nlink].join(':');
const errorValue=e=>({code:e.code??null,syscall:e.syscall??null,message:e.message});
const log=(method,path,data={})=>{const entry={sequence:trace.length+1,atUtc:new Date().toISOString(),method,path,...data};trace.push(entry);return entry;};
function ancestors(p){if(!p.startsWith('/')||resolve(p)!==p||p.includes('\0'))throw new Error('Unapproved noncanonical path');const out=['/'];let cur='';for(const part of p.split('/').filter(Boolean)){cur+='/'+part;out.push(cur);}return out;}
const initialAllowed=new Set([...targets.map(x=>x.path),...roots,simulator+'/Images/images.plist',assets+'/Info.plist',assets+'/AssetInfo.plist'].flatMap(ancestors));
const allowedStats=new Set(initialAllowed);
const allowedPlists=new Set([simulator+'/Images/images.plist',assets+'/Info.plist',assets+'/AssetInfo.plist']);
async function cachedStat(p){
 if(!allowedStats.has(p))throw new Error('Stat guard rejected path');
 if(ancestorCache.has(p))return ancestorCache.get(p);
 let entry;
 try{const s=await fs.lstat(p);entry={path:p,ok:true,...describe(s)};log('lstat',p,{ok:true,...describe(s)});}
 catch(e){entry={path:p,ok:false,error:errorValue(e)};log('lstat',p,{ok:false,error:errorValue(e)});}
 ancestorCache.set(p,entry);ancestorStats.push(entry);return entry;
}
async function inspectChain(p){
 const entries=[];
 for(const part of ancestors(p)){
  const entry=await cachedStat(part);entries.push(entry);
  if(!entry.ok)return {ok:false,blockedAt:part,reason:entry.error.code,error:entry.error,entries};
  if(entry.type==='symlink')return {ok:false,blockedAt:part,reason:'SYMLINK_NOT_FOLLOWED',entries};
  if(part!==p&&entry.type!=='directory')return {ok:false,blockedAt:part,reason:'ANCESTOR_NOT_DIRECTORY',entries};
 }
 return {ok:true,entries,leaf:entries.at(-1)};
}
function predicateDiagnostic(t,chain){
 const checks=chain.entries.filter(x=>x.path!=='/').map(s=>({path:s.path,ok:s.ok,failures:!s.ok?['LSTAT_'+s.error.code]:[
  ...(s.type==='symlink'?['SYMLINK']:[]),...(![0,account.uid].includes(s.uid)?['UNEXPECTED_OWNER']:[]),
  ...((s.modeBits&0o022)?['GROUP_OR_OTHER_WRITABLE']:[]),...(s.path!==t.path&&s.type!=='directory'?['ANCESTOR_NOT_DIRECTORY']:[]),
  ...(s.path===t.path&&s.type!==t.type?['LEAF_TYPE_MISMATCH']:[])]}));
 const first=checks.find(x=>!x.ok||x.failures.length);
 return {path:t.path,expectedType:t.type,inspection:chain.ok?'COMPLETE':'BOUNDED_STOP',firstProductionPredicateFailure:first??null,allObservedFailures:checks.filter(x=>!x.ok||x.failures.length),originalPredicateWouldPass:chain.ok&&!first};
}
const trustDiagnostics=[];
for(const t of targets)trustDiagnostics.push(predicateDiagnostic(t,await inspectChain(t.path)));
async function inventory(root){
 const chain=await inspectChain(root);
 if(!chain.ok){const result={root,status:'BOUNDED_STOP',reason:chain.reason,blockedAt:chain.blockedAt,error:chain.error??null};inventories.push(result);return result;}
 if(chain.leaf.type!=='directory'){const result={root,status:'BOUNDED_STOP',reason:'NOT_DIRECTORY'};inventories.push(result);return result;}
 let handle;const names=[];
 try{
  const before=await fs.lstat(root);log('inventory.lstat.before',root,{ok:true,...describe(before)});
  if(before.isSymbolicLink()||!before.isDirectory())throw Object.assign(new Error('Inventory root changed type'),{code:'ROOT_CHANGED'});
  handle=await fs.opendir(root);log('opendir',root,{ok:true});
  while(true){const entry=await handle.read();if(!entry)break;if(names.length===1000){const r={root,status:'BOUNDED_STOP',reason:'ENTRY_CAP_EXCEEDED',maximumNames:1000,names,moreEntries:true};limits.push({subprobe:root,reason:r.reason});inventories.push(r);return r;}names.push(entry.name);}
  const after=await fs.lstat(root);log('inventory.lstat.after',root,{ok:true,...describe(after)});
  const stable=stamp(before)===stamp(after);
  const r={root,status:stable?'COMPLETE':'BOUNDED_STOP',reason:stable?null:'ROOT_CHANGED',count:names.length,names:names.sort(),before:describe(before),after:describe(after)};
  log('immediate-directory-inventory',root,{ok:stable,count:names.length,names:r.names});inventories.push(r);return r;
 }catch(e){const r={root,status:'BOUNDED_STOP',reason:e.code??'INVENTORY_ERROR',error:errorValue(e),names:names.sort()};log('inventory.error',root,{ok:false,error:r.error});inventories.push(r);return r;}
 finally{if(handle)await handle.close();}
}
for(const root of roots)await inventory(root);
const assetInventory=inventories.find(x=>x.root===assets);
const childInspections=[];
if(assetInventory?.status==='COMPLETE'){
 const names=assetInventory.names.filter(n=>n!=='Info.plist'&&n!=='AssetInfo.plist');
 if(names.length>50){limits.push({subprobe:'asset-child-metadata',reason:'CHILD_CAP_EXCEEDED',observedImmediateNames:names.length,maximumChildren:50});}
 else for(const name of names){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(name)){childInspections.push({name,status:'BOUNDED_STOP',reason:'NONCONSERVATIVE_COMPONENT_NAME'});continue;}
  const p=join(assets,name);allowedStats.add(p);const chain=await inspectChain(p);
  childInspections.push({name,path:p,status:chain.ok?chain.leaf.type:'BOUNDED_STOP',reason:chain.reason??null});
  if(chain.ok&&chain.leaf.type==='directory')for(const file of ['Info.plist','AssetInfo.plist']){const candidate=join(p,file);allowedStats.add(candidate);allowedPlists.add(candidate);}
 }
}
async function stableRead(p){
 if(!allowedPlists.has(p))throw new Error('Plist read guard rejected path');
 const chain=await inspectChain(p);if(!chain.ok)throw Object.assign(new Error('Metadata chain inspection stopped'),{code:chain.reason,blockedAt:chain.blockedAt});
 const before=await fs.lstat(p);log('metadata.lstat.before',p,{ok:true,...describe(before)});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1)throw Object.assign(new Error('Metadata is not a single-link regular file'),{code:'UNSAFE_METADATA_TYPE'});
 if(before.size>1024*1024)throw Object.assign(new Error('Metadata exceeds 1MiB input cap'),{code:'INPUT_SIZE_CAP'});
 const handle=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);log('open-readonly-nofollow',p,{ok:true,flags:constants.O_RDONLY|constants.O_NOFOLLOW});
 try{
  const opened=await handle.stat();if(stamp(before)!==stamp(opened))throw Object.assign(new Error('Metadata replaced at open'),{code:'METADATA_CHANGED'});
  const chunks=[];let bytes=0;
  while(true){const b=Buffer.alloc(65536);const r=await handle.read(b,0,b.length,null);if(!r.bytesRead)break;bytes+=r.bytesRead;if(bytes>1024*1024)throw Object.assign(new Error('Metadata read exceeds 1MiB input cap'),{code:'INPUT_SIZE_CAP'});chunks.push(b.subarray(0,r.bytesRead));}
  const finalHandle=await handle.stat(),after=await fs.lstat(p);
  if(stamp(before)!==stamp(finalHandle)||stamp(before)!==stamp(after))throw Object.assign(new Error('Metadata changed during read'),{code:'METADATA_CHANGED'});
  const data=Buffer.concat(chunks);const result={bytes:data.length,sha256:hash(data),stamp:stamp(before),before:describe(before),opened:describe(opened),finalHandle:describe(finalHandle),after:describe(after)};
  log('stable-read-hash',p,{ok:true,...result});return result;
 }finally{await handle.close();}
}
const sensitive=/token|secret|credential|password|passphrase|authorization|api[-_]?key|cookie|session|bearer|private[-_]?key/i;
function redactString(s){
 if(/^\w+:\/\//.test(s))try{const u=new URL(s);let changed=false;if(u.username||u.password){u.username='REDACTED';u.password='';changed=true;}for(const k of u.searchParams.keys())if(sensitive.test(k)){u.searchParams.set(k,'REDACTED');changed=true;}if(changed)return u.toString();}catch{}
 return s.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,'$1<REDACTED>');
}
function redact(value){if(Array.isArray(value))return value.map(redact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitive.test(k)?'<REDACTED>':redact(v)]));return typeof value==='string'?redactString(value):value;}
function selected(value){
 const fields=[],paths=[];let capped=false;
 function walk(v,trail=[]){if(capped)return;if(v&&typeof v==='object'){for(const [k,item]of Object.entries(v))walk(item,[...trail,k]);return;}const field=trail.join('.');
  if(/runtime|version|build|image|platform|avail|location|path|mount|asset|identifier|(?:^|\.)os|size|type|name|status/i.test(field)){if(fields.length===10000){capped=true;return;}fields.push({field,value:v});}
  if(typeof v==='string'&&v!=='<REDACTED>'){let p=null;if(v.startsWith('/')&&!v.includes('\0'))p=v;else if(v.startsWith('file://'))try{const u=new URL(v);if((!u.hostname||u.hostname==='localhost')&&!u.username&&!u.password)p=decodeURIComponent(u.pathname);}catch{}if(p)paths.push({field,path:p,sourceValue:v,followed:false});}
 }
 walk(value);return {fields,candidatePaths:paths,fieldCapReached:capped};
}
const childEnv={HOME:account.homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:developer};
const plutilChain=await inspectChain('/usr/bin/plutil');
const canConvert=plutilChain.ok&&plutilChain.leaf.type==='file'&&(plutilChain.leaf.modeBits&0o111)!==0;
async function convert(p){
 if(!allowedPlists.has(p)||!canConvert)throw Object.assign(new Error('No guarded plutil executable seam'),{code:'PLUTIL_SEAM_UNAVAILABLE'});
 const executable='/usr/bin/plutil',args=['-convert','json','-o','-','--',p];
 if(executable!=='/usr/bin/plutil'||args.length!==6||args.slice(0,5).join('\0')!=='-convert\0json\0-o\0-\0--'||!allowedPlists.has(args[5]))throw new Error('Child guard rejected argv');
 const receipt={argv:[executable,...args],cwd:repo,startedAt:new Date().toISOString(),environment:childEnv,shell:false,stdin:'ignored',exitCode:null,signal:null};children.push(receipt);
 return await new Promise(resolveChild=>{
  const child=spawn(executable,args,{cwd:repo,env:childEnv,shell:false,stdio:['ignore','pipe','pipe']});
  const out=[],err=[];let count=0,overflow=false,timedOut=false,childError=null;
  const stop=()=>{try{child.kill('SIGTERM');}catch{}};
  const timer=setTimeout(()=>{timedOut=true;stop();},10000);
  const hardTimer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},12000);
  function capture(chunks){return b=>{count+=b.length;if(count>8*1024*1024){overflow=true;stop();return;}chunks.push(b);};}
  child.stdout.on('data',capture(out));child.stderr.on('data',capture(err));child.on('error',e=>{childError=errorValue(e);});
  child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hardTimer);const stdout=Buffer.concat(out).toString('utf8'),stderr=Buffer.concat(err).toString('utf8');
   let value=null,sanitizedStdout;try{value=redact(JSON.parse(stdout));sanitizedStdout=JSON.stringify(value,null,2)+'\n';}catch{sanitizedStdout=stdout?'<REDACTED_UNPARSED_OUTPUT>':'';}
   Object.assign(receipt,{completedAt:new Date().toISOString(),exitCode:code,signal,timedOut,overflow,error:childError,stdout:sanitizedStdout,stderr:stderr?'<REDACTED_NONEMPTY_STDERR>':'',stdoutOriginalBytes:Buffer.byteLength(stdout),stderrOriginalBytes:Buffer.byteLength(stderr),stdoutOriginalSha256:hash(stdout),stderrOriginalSha256:hash(stderr),redaction:'Credential/token/auth/session fields and credential-bearing URL parts redacted recursively; unparsed stdout/nonempty stderr withheld.'});
   resolveChild({receipt,value});
  });
 });
}
for(const p of [...allowedPlists].sort()){
 const item={path:p,startedAt:new Date().toISOString()};metadata.push(item);
 try{
  item.before=await stableRead(p);
  if(!canConvert){Object.assign(item,{status:'BOUNDED_STOP',reason:'PLUTIL_SEAM_UNAVAILABLE'});continue;}
  const conversion=await convert(p);item.conversionIndex=children.length-1;
  item.after=await stableRead(p);item.stableAcrossConversion=item.before.stamp===item.after.stamp&&item.before.sha256===item.after.sha256;
  if(!item.stableAcrossConversion)throw Object.assign(new Error('Metadata changed across conversion'),{code:'METADATA_CHANGED'});
  if(conversion.receipt.exitCode!==0||conversion.receipt.signal||conversion.receipt.timedOut||conversion.receipt.overflow||conversion.value===null)throw Object.assign(new Error('Bounded metadata conversion failed'),{code:'CONVERSION_FAILED'});
  Object.assign(item,{status:'READ_STABLE_CONVERTED',sanitizedValue:conversion.value,...selected(conversion.value)});
 }catch(e){Object.assign(item,{status:'BOUNDED_STOP',reason:e.code??'METADATA_ERROR',error:errorValue(e),blockedAt:e.blockedAt??null});log('metadata-subprobe-stop',p,{ok:false,error:item.error,blockedAt:item.blockedAt});}
 finally{item.completedAt=new Date().toISOString();}
}
const result={schemaVersion:1,scope:'Phase2 once-only installed metadata batch. No production compatibility rerun; no catalog-reported path followed.',cwd:repo,startedAt,completedAt:new Date().toISOString(),hostAccountUid:account.uid,
 fixedTrustTargets:targets,ancestorStats,trustDiagnostics,inventories,assetChildInspections:childInspections,metadata,children,limits,trace,
 candidatePaths:metadata.flatMap(m=>(m.candidatePaths??[]).map(c=>({metadataInput:m.path,...c}))),
 liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'}};
console.log(JSON.stringify(result,null,2));
