import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo)throw new Error('Unexpected cwd');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Key/loader environment present');
const account=userInfo(),developer='/Applications/Xcode.app/Contents/Developer';
const simulator='/Library/Developer/CoreSimulator';
const imageRoots=[simulator+'/Cryptex/Images',simulator+'/Images/mnt'];
const asset='/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/3e800c38767f9f2c5fc86acdad7adf44565e051a.asset';
const assetData=asset+'/AssetData';
const catalog=simulator+'/Images/images.plist';
const scriptDir=dirname(fileURLToPath(import.meta.url));
const parserScript=join(scriptDir,'parse-images.py');
const python='/usr/bin/python3',plutil='/usr/bin/plutil';
const startedAt=new Date().toISOString();
const trace=[],ancestorStats=[],ancestorCache=new Map(),inventories=[],metadata=[],children=[],limits=[],candidatePaths=[],childInspections=[],assetDataStats=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const describe=s=>({type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',uid:s.uid,gid:s.gid,mode:'0'+(s.mode&0o7777).toString(8),modeBits:s.mode,nlink:s.nlink,size:s.size,dev:s.dev,ino:s.ino,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.mode,s.uid,s.gid,s.nlink].join(':');
const errorValue=e=>({code:e.code??null,syscall:e.syscall??null,message:e.message});
const log=(method,path,data={})=>{const entry={sequence:trace.length+1,atUtc:new Date().toISOString(),method,path,...data};trace.push(entry);return entry;};
function ancestors(p){if(!p.startsWith('/')||resolve(p)!==p||p.includes('\0'))throw new Error('Unapproved noncanonical path');const out=['/'];let cur='';for(const part of p.split('/').filter(Boolean)){cur+='/'+part;out.push(cur);}return out;}
const allowedStats=new Set([...imageRoots,asset,assetData,catalog,python,plutil].flatMap(ancestors));
const allowedPlists=new Set();
const allowedInventories=new Set([...imageRoots,asset,assetData]);
function authorizeStatChain(p){for(const a of ancestors(p))allowedStats.add(a);}
function conservative(n){return /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(n)&&!['Devices','Caches','Cache','Personalization'].some(x=>x.toLowerCase()===n.toLowerCase());}
function candidate(path,basis,kind='UNVISITED_CANDIDATE'){candidatePaths.push({path,basis,kind,followed:false});}
const bundles=new Map();
function approveBundle(p,basis){
 if(bundles.has(p))return;
 authorizeStatChain(p);bundles.set(p,{path:p,basis});
 for(const suffix of ['Contents/Info.plist','Contents/Resources/profile.plist','Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist']){const full=join(p,suffix);authorizeStatChain(full);allowedPlists.add(full);}
}
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
async function inventory(root){
 if(!allowedInventories.has(root))throw new Error('Inventory guard rejected root');
 const chain=await inspectChain(root);
 if(!chain.ok){const result={root,status:'BOUNDED_STOP',reason:chain.reason,blockedAt:chain.blockedAt,error:chain.error??null};inventories.push(result);return result;}
 if(chain.leaf.type!=='directory'){const result={root,status:'BOUNDED_STOP',reason:'NOT_DIRECTORY'};inventories.push(result);return result;}
 let handle;const names=[],entries=[];
 try{
  const before=await fs.lstat(root);log('inventory.lstat.before',root,{ok:true,...describe(before)});
  if(before.isSymbolicLink()||!before.isDirectory())throw Object.assign(new Error('Inventory root changed type'),{code:'ROOT_CHANGED'});
  handle=await fs.opendir(root);log('opendir',root,{ok:true});
  while(true){const entry=await handle.read();if(!entry)break;if(names.length===1000){const r={root,status:'BOUNDED_STOP',reason:'ENTRY_CAP_EXCEEDED',maximumNames:1000,names,moreEntries:true};limits.push({subprobe:root,reason:r.reason});inventories.push(r);return r;}names.push(entry.name);entries.push({name:entry.name,type:entry.isSymbolicLink()?'symlink':entry.isDirectory()?'directory':entry.isFile()?'file':'other'});}
  const after=await fs.lstat(root);log('inventory.lstat.after',root,{ok:true,...describe(after)});
  const stable=stamp(before)===stamp(after);
  const r={root,status:stable?'COMPLETE':'BOUNDED_STOP',reason:stable?null:'ROOT_CHANGED',count:names.length,names:names.sort(),entries:entries.sort((a,b)=>a.name.localeCompare(b.name)),before:describe(before),after:describe(after)};
  log('immediate-directory-inventory',root,{ok:stable,count:names.length,names:r.names});inventories.push(r);return r;
 }catch(e){const r={root,status:'BOUNDED_STOP',reason:e.code??'INVENTORY_ERROR',error:errorValue(e),names:names.sort()};log('inventory.error',root,{ok:false,error:r.error});inventories.push(r);return r;}
 finally{if(handle)await handle.close();}
}
for(const root of [...imageRoots,asset,assetData])await inventory(root);
for(const root of imageRoots){
 const initial=inventories.find(x=>x.root===root);if(initial?.status!=='COMPLETE')continue;
 const directoryEntries=initial.entries.filter(x=>x.type==='directory');
 if(directoryEntries.length>10){limits.push({subprobe:root,reason:'DIRECTORY_CHILD_CAP_EXCEEDED',count:directoryEntries.length,maximum:10});continue;}
 for(const entry of initial.entries)if(entry.type!=='directory')candidate(join(root,entry.name),'Observed immediate root entry; no bytes opened.',entry.type==='symlink'?'SYMLINK_NOT_FOLLOWED':'IMMEDIATE_NAME_ONLY');
 for(const entry of directoryEntries){
  if(!conservative(entry.name)){limits.push({subprobe:join(root,entry.name),reason:'NONCONSERVATIVE_OR_FORBIDDEN_COMPONENT'});continue;}
  const child=join(root,entry.name);authorizeStatChain(child);const chain=await inspectChain(child);
  childInspections.push({path:child,status:chain.ok?chain.leaf.type:'BOUNDED_STOP',reason:chain.reason??null});
  if(!chain.ok||chain.leaf.type!=='directory')continue;
  if(entry.name.endsWith('.simruntime')){approveBundle(child,'Direct immediate image-root bundle.');continue;}
  allowedInventories.add(child);const immediate=await inventory(child);
  if(immediate.status==='COMPLETE')for(const e of immediate.entries){
   const p=join(child,e.name);
   if(!conservative(e.name)){candidate(p,'Observed child name; nonconservative/forbidden component not followed.');continue;}
   if(e.type==='directory'&&e.name.endsWith('.simruntime'))approveBundle(p,'Direct bundle in approved immediate image child inventory.');
   else if(/\.(?:plist|xml|json|simruntime)$/i.test(e.name))candidate(p,'Exact runtime/catalog-like name in approved child inventory; no other descendant explored.',e.type==='symlink'?'SYMLINK_NOT_FOLLOWED':'UNVISITED_METADATA_CANDIDATE');
  }
  const fixed=join(child,'Library/Developer/CoreSimulator/Profiles/Runtimes');authorizeStatChain(fixed);allowedInventories.add(fixed);const runtimes=await inventory(fixed);
  if(runtimes.status==='COMPLETE')for(const e of runtimes.entries){
   const p=join(fixed,e.name);if(!conservative(e.name)){candidate(p,'Nonconservative fixed-root entry; not followed.');continue;}
   if(e.type==='directory'&&e.name.endsWith('.simruntime'))approveBundle(p,'Bundle in approved fixed-suffix runtime inventory.');
   else candidate(p,'Observed fixed-runtime-root name; no other suffix explored.',e.type==='symlink'?'SYMLINK_NOT_FOLLOWED':'IMMEDIATE_NAME_ONLY');
  }
 }
}
const dataInventory=inventories.find(x=>x.root===assetData);
if(dataInventory?.status==='COMPLETE')for(const entry of dataInventory.entries){
 const p=join(assetData,entry.name);if(!conservative(entry.name)){candidate(p,'AssetData immediate name not followed due component guard.');continue;}
 authorizeStatChain(p);const chain=await inspectChain(p);assetDataStats.push({path:p,status:chain.ok?chain.leaf.type:'BOUNDED_STOP',reason:chain.reason??null,stat:chain.leaf??null});
 if(chain.ok&&chain.leaf.type==='directory'&&entry.name.endsWith('.simruntime'))approveBundle(p,'Directly contained approved AssetData runtime bundle.');
 else candidate(p,'AssetData immediate name/stat only; payload/image bytes not opened.',chain.reason==='SYMLINK_NOT_FOLLOWED'?'SYMLINK_NOT_FOLLOWED':'IMMEDIATE_NAME_STAT_ONLY');
}
const assetInventory=inventories.find(x=>x.root===asset);
if(assetInventory?.status==='COMPLETE')for(const e of assetInventory.entries)if(e.name!=='AssetData')candidate(join(asset,e.name),'Approved asset immediate name only; metadata/payload contents not read in phase3.','IMMEDIATE_NAME_ONLY');
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
const sensitive=/token|secret|credential|password|passphrase|auth|api[-_]?key|cookie|session|bearer|private[-_]?key/i;
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
async function childCommand(executable,args,kind){
 const pythonAllowed=executable===python&&args.length===5&&args[0]==='-I'&&args[1]==='-S'&&args[2]==='-B'&&args[3]===parserScript&&args[4]===catalog;
 const plutilAllowed=executable===plutil&&args.length===6&&args.slice(0,5).join('\0')==='-convert\0json\0-o\0-\0--'&&allowedPlists.has(args[5]);
 if(!pythonAllowed&&!plutilAllowed)throw new Error('Child guard rejected argv');
 const chain=await inspectChain(executable);if(!chain.ok||chain.leaf.type!=='file'||!(chain.leaf.modeBits&0o111))throw Object.assign(new Error('Guarded metadata executable unavailable'),{code:'EXECUTABLE_SEAM_UNAVAILABLE',blockedAt:chain.blockedAt??executable});
 const receipt={kind,argv:[executable,...args],cwd:repo,startedAt:new Date().toISOString(),environment:childEnv,shell:false,stdin:'ignored',exitCode:null,signal:null};children.push(receipt);
 return await new Promise(done=>{
  const child=spawn(executable,args,{cwd:repo,env:childEnv,shell:false,stdio:['ignore','pipe','pipe']});const out=[],err=[];let count=0,overflow=false,timedOut=false,childError=null;
  const timer=setTimeout(()=>{timedOut=true;try{child.kill('SIGTERM');}catch{}},10000);
  const hardTimer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},12000);
  const capture=chunks=>b=>{count+=b.length;if(count>8*1024*1024){overflow=true;try{child.kill('SIGTERM');}catch{}return;}chunks.push(b);};
  child.stdout.on('data',capture(out));child.stderr.on('data',capture(err));child.on('error',e=>{childError=errorValue(e);});
  child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hardTimer);const stdout=Buffer.concat(out).toString('utf8'),stderr=Buffer.concat(err).toString('utf8');let value=null;
   try{value=redact(JSON.parse(stdout));}catch{}
   const sanitizedStderr=stderr?redactString(stderr).replace(/((?:token|secret|credential|password|auth|session)[A-Za-z_-]*\s*[=:]\s*)[^\s,;]+/gi,'$1<REDACTED>'):'';
   Object.assign(receipt,{completedAt:new Date().toISOString(),exitCode:code,signal,timedOut,overflow,error:childError,stdout:value!==null?JSON.stringify(value,null,2)+'\n':stdout?'<REDACTED_UNPARSED_STDOUT>':'',stderr:sanitizedStderr,stdoutOriginalBytes:Buffer.byteLength(stdout),stderrOriginalBytes:Buffer.byteLength(stderr),stdoutOriginalSha256:hash(stdout),stderrOriginalSha256:hash(stderr),redaction:'Structured key/URL redaction; unparsed stdout withheld; stderr credential assignments/bearer values redacted.'});done({receipt,value});
  });
 });
}
let catalogResult;
try{const c=await childCommand(python,['-I','-S','-B',parserScript,catalog],'PYTHON_STANDARD_LIBRARY_PLISTLIB');catalogResult={status:c.value?.status??'OUTPUT_UNAVAILABLE',receiptIndex:children.length-1,...(c.value??{})};if(c.value?.sanitizedValue)Object.assign(catalogResult,selected(c.value.sanitizedValue));}
catch(e){catalogResult={status:'BOUNDED_STOP',error:errorValue(e),blockedAt:e.blockedAt??null};}
for(const p of [...allowedPlists].sort()){
 const item={path:p,startedAt:new Date().toISOString()};metadata.push(item);
 try{item.before=await stableRead(p);const c=await childCommand(plutil,['-convert','json','-o','-','--',p],'APPROVED_RUNTIME_BUNDLE_PLIST');item.conversionIndex=children.length-1;
  item.after=await stableRead(p);item.stableAcrossConversion=item.before.stamp===item.after.stamp&&item.before.sha256===item.after.sha256;
  if(!item.stableAcrossConversion)throw Object.assign(new Error('Metadata changed across conversion'),{code:'METADATA_CHANGED'});
  if(c.receipt.exitCode!==0||c.receipt.signal||c.receipt.timedOut||c.receipt.overflow||c.value===null)throw Object.assign(new Error('Bounded conversion failed'),{code:'CONVERSION_FAILED'});
  Object.assign(item,{status:'READ_STABLE_CONVERTED',sanitizedValue:c.value,...selected(c.value)});
 }catch(e){Object.assign(item,{status:'BOUNDED_STOP',reason:e.code??'METADATA_ERROR',error:errorValue(e),blockedAt:e.blockedAt??null});}
 finally{item.completedAt=new Date().toISOString();}
}
const result={schemaVersion:1,scope:'Once-only phase3 finite installed-metadata schedule; no production compatibility call/bypass; no arbitrary catalog path followed.',cwd:repo,startedAt,completedAt:new Date().toISOString(),imageRoots,asset,assetData,ancestorStats,inventories,childInspections,assetDataStats,bundles:[...bundles.values()],metadata,catalog:catalogResult,children,limits,trace,
 candidatePaths:[...candidatePaths,...(catalogResult.candidatePaths??[]).map(x=>({...x,basis:'Catalog-reported location; not followed.',kind:'CATALOG_REPORTED_UNVISITED'}))],liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'}};
console.log(JSON.stringify(result,null,2));
