import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { userInfo,arch,platform } from 'node:os';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo)throw new Error('Unexpected cwd');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Key/loader environment present');
const startedAt=new Date().toISOString(),account=userInfo();
const evidence=join(repo,'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09');
const candidateFile=join(evidence,'operator-phase3/candidate-paths.json'),catalogFile=join(evidence,'operator-phase3/catalog.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const candidateBytes=await fs.readFile(candidateFile),catalogBytes=await fs.readFile(catalogFile);
const priorManifest=JSON.parse(await fs.readFile(join(evidence,'operator-phase3/artifact-hashes.json'),'utf8'));
for(const [name,bytes]of [['candidate-paths.json',candidateBytes],['catalog.json',catalogBytes]])if(priorManifest.files.find(f=>f.path===name)?.sha256!==hash(bytes))throw new Error('Catalog provenance mismatch');
const candidates=JSON.parse(candidateBytes),catalog=JSON.parse(catalogBytes);
const matches=catalog.sanitizedValue.images.filter(x=>x.runtimeInfo?.bundleIdentifier==='com.apple.CoreSimulator.SimRuntime.iOS-27-0');
if(matches.length!==1||catalog.status!=='PARSED_STABLE'||!catalog.stableAcrossParse)throw new Error('Expected stable catalog record not unique');
const record=matches[0],url=record.runtimeInfo.bundlePath.relative;
const bundle=fileURLToPath(url).replace(/\/$/,'');
const expectedBundle='/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime';
if(bundle!==expectedBundle||bundle!==candidates.priorityRuntimeBundle.path||url!==candidates.priorityRuntimeBundle.catalogURL||record.runtimeInfo.build!=='24A434'||record.runtimeInfo.platformIdentifier!=='com.apple.platform.iphonesimulator'||JSON.stringify(record.runtimeInfo.supportedArchitectures)!=='["arm64"]')throw new Error('Approved runtime candidate differs from phase3 expected record');
const suffixes=['Contents/Info.plist','Contents/Resources/profile.plist','Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'];
const runtimePlists=suffixes.map(x=>join(bundle,x));
if(JSON.stringify(runtimePlists)!==JSON.stringify(candidates.priorityMetadataFiles.map(x=>x.path)))throw new Error('Approved runtime suffix mismatch');
const paths=[...runtimePlists,'/Applications/Xcode.app/Contents/Info.plist','/Applications/Xcode.app/Contents/version.plist','/System/Library/CoreServices/SystemVersion.plist','/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17.simdevicetype/Contents/Info.plist','/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone 17.simdevicetype/Contents/Resources/profile.plist'];
const plutil='/usr/bin/plutil',allowedPlists=new Set(paths);
const trace=[],metadata=[],children=[];
const describe=s=>({type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',uid:s.uid,gid:s.gid,mode:'0'+(s.mode&0o7777).toString(8),modeBits:s.mode,nlink:s.nlink,size:s.size,dev:s.dev,ino:s.ino,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.mode,s.uid,s.gid,s.nlink].join(':');
const errorValue=e=>({code:e.code??null,syscall:e.syscall??null,message:e.message});
const log=(method,path,data={})=>trace.push({sequence:trace.length+1,atUtc:new Date().toISOString(),method,path,...data});
function ancestors(p){if(!p.startsWith('/')||resolve(p)!==p||p.includes('\0'))throw new Error('Unapproved noncanonical path');const out=['/'];let cur='';for(const part of p.split('/').filter(Boolean)){cur+='/'+part;out.push(cur);}return out;}
const allowedStats=new Set([...paths,plutil].flatMap(ancestors));
async function inspectChain(p){
 const entries=[];
 for(const part of ancestors(p)){
  if(!allowedStats.has(part))throw new Error('Stat guard rejected path');
  let s;try{s=await fs.lstat(part);}catch(e){log('lstat',part,{ok:false,error:errorValue(e)});throw Object.assign(new Error('Installed metadata ancestor/leaf inaccessible'),{code:e.code??'LSTAT_ERROR',syscall:e.syscall,blockedAt:part,cause:errorValue(e),entries});}
  const entry={path:part,...describe(s)};entries.push(entry);log('lstat',part,{ok:true,...describe(s)});
  if(s.isSymbolicLink())throw Object.assign(new Error('Symlink not followed'),{code:'SYMLINK_NOT_FOLLOWED',blockedAt:part,entries});
  if(part!==p&&!s.isDirectory())throw Object.assign(new Error('Ancestor not directory'),{code:'ANCESTOR_NOT_DIRECTORY',blockedAt:part,entries});
 }
 return {entries,leaf:entries.at(-1)};
}
async function stableRead(p){
 if(!allowedPlists.has(p))throw new Error('Plist read guard rejected path');
 const chain=await inspectChain(p),before=await fs.lstat(p);log('metadata.lstat.before',p,{ok:true,...describe(before)});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1)throw Object.assign(new Error('Metadata is not a single-link regular file'),{code:'UNSAFE_METADATA_TYPE',blockedAt:p});
 if(!Number.isSafeInteger(before.size)||before.size<0||before.size>1024*1024)throw Object.assign(new Error('Metadata exceeds 1MiB or size uncertain'),{code:'INPUT_SIZE_CAP_OR_UNCERTAINTY',blockedAt:p});
 const handle=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);log('open-readonly-nofollow',p,{ok:true,flags:constants.O_RDONLY|constants.O_NOFOLLOW});
 try{
  const opened=await handle.stat();if(stamp(before)!==stamp(opened))throw Object.assign(new Error('Metadata replaced at open'),{code:'METADATA_CHANGED',blockedAt:p});
  const chunks=[];let bytes=0;
  while(true){const b=Buffer.alloc(65536),r=await handle.read(b,0,b.length,null);if(!r.bytesRead)break;bytes+=r.bytesRead;if(bytes>1024*1024)throw Object.assign(new Error('Metadata read exceeds cap'),{code:'INPUT_SIZE_CAP_OR_UNCERTAINTY',blockedAt:p});chunks.push(b.subarray(0,r.bytesRead));}
  const finalHandle=await handle.stat(),afterChain=await inspectChain(p),after=await fs.lstat(p);
  if(stamp(before)!==stamp(finalHandle)||stamp(before)!==stamp(after)||JSON.stringify(chain.entries)!==JSON.stringify(afterChain.entries))throw Object.assign(new Error('Metadata or ancestor changed during read'),{code:'METADATA_CHANGED',blockedAt:p});
  const data=Buffer.concat(chunks);if(data.length!==before.size)throw Object.assign(new Error('Metadata byte length differs'),{code:'METADATA_CHANGED',blockedAt:p});
  const value={bytes:data.length,sha256:hash(data),stamp:stamp(before),before:describe(before),opened:describe(opened),finalHandle:describe(finalHandle),after:describe(after),ancestorEntries:chain.entries};
  log('stable-read-hash',p,{ok:true,...value});return value;
 }finally{await handle.close();}
}
const sensitive=/token|secret|credential|password|passphrase|auth|api[-_]?key|cookie|session|bearer|private[-_]?key/i;
function redactString(s){
 if(/^\w+:\/\//.test(s))try{const u=new URL(s);let changed=false;if(u.username||u.password){u.username='REDACTED';u.password='';changed=true;}for(const k of u.searchParams.keys())if(sensitive.test(k)){u.searchParams.set(k,'REDACTED');changed=true;}if(changed)return u.toString();}catch{}
 return s.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,'$1<REDACTED>');
}
function redact(v){if(Array.isArray(v))return v.map(redact);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,sensitive.test(k)?'<REDACTED>':redact(x)]));return typeof v==='string'?redactString(v):v;}
const childEnv={HOME:account.homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
async function convert(p){
 const args=['-convert','json','-o','-','--',p];
 if(!allowedPlists.has(p)||args.length!==6||args.slice(0,5).join('\0')!=='-convert\0json\0-o\0-\0--')throw new Error('Child guard rejected argv');
 const target=await inspectChain(p);if(target.leaf.type!=='file'||target.leaf.nlink!==1||target.leaf.size>1024*1024)throw Object.assign(new Error('Metadata uncertain before child'),{code:'UNSAFE_METADATA_TYPE',blockedAt:p});
 const executable=await inspectChain(plutil);if(executable.leaf.type!=='file'||!(executable.leaf.modeBits&0o111))throw Object.assign(new Error('Guarded plutil unavailable'),{code:'EXECUTABLE_SEAM_UNAVAILABLE',blockedAt:plutil});
 const receipt={argv:[plutil,...args],cwd:repo,startedAt:new Date().toISOString(),environment:childEnv,shell:false,stdin:'ignored',exitCode:null,signal:null,executableAncestorStats:executable.entries};children.push(receipt);
 return await new Promise(done=>{
  const child=spawn(plutil,args,{cwd:repo,env:childEnv,shell:false,stdio:['ignore','pipe','pipe']});const out=[],err=[];let count=0,overflow=false,timedOut=false,childError=null;
  const timer=setTimeout(()=>{timedOut=true;try{child.kill('SIGTERM');}catch{}},10000),hardTimer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},12000);
  const capture=chunks=>b=>{count+=b.length;if(count>65536){overflow=true;try{child.kill('SIGTERM');}catch{}return;}chunks.push(b);};
  child.stdout.on('data',capture(out));child.stderr.on('data',capture(err));child.on('error',e=>{childError=errorValue(e);});
  child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(hardTimer);const stdout=Buffer.concat(out).toString('utf8'),stderr=Buffer.concat(err).toString('utf8');let value=null;try{value=redact(JSON.parse(stdout));}catch{}
   Object.assign(receipt,{completedAt:new Date().toISOString(),exitCode:code,signal,timedOut,overflow,error:childError,stdout:value!==null?JSON.stringify(value,null,2)+'\n':stdout?'<REDACTED_UNPARSED_STDOUT>':'',stderr:stderr?'<REDACTED_STDERR>':'',stdoutOriginalBytes:Buffer.byteLength(stdout),stderrOriginalBytes:Buffer.byteLength(stderr),stdoutOriginalSha256:hash(stdout),stderrOriginalSha256:hash(stderr),redaction:'Structured sensitive-key/URL/bearer redaction; unparsed stdout and nonempty stderr withheld; original byte counts and hashes preserved.'});done({receipt,value});
  });
 });
}
for(const p of paths){
 const item={path:p,startedAt:new Date().toISOString()};metadata.push(item);
 try{item.before=await stableRead(p);const c=await convert(p);item.conversionIndex=children.length-1;item.after=await stableRead(p);item.stableAcrossConversion=item.before.stamp===item.after.stamp&&item.before.sha256===item.after.sha256&&JSON.stringify(item.before.ancestorEntries)===JSON.stringify(item.after.ancestorEntries);
  if(!item.stableAcrossConversion)throw Object.assign(new Error('Metadata/ancestors changed across conversion'),{code:'METADATA_CHANGED',blockedAt:p});
  if(c.receipt.exitCode!==0||c.receipt.signal||c.receipt.timedOut||c.receipt.overflow||c.value===null||typeof c.value!=='object'||Array.isArray(c.value))throw Object.assign(new Error('Bounded JSON conversion failed'),{code:'CONVERSION_FAILED',blockedAt:p});
  Object.assign(item,{status:'READ_STABLE_CONVERTED',sanitizedValue:c.value});
 }catch(e){Object.assign(item,{status:'BOUNDED_STOP',reason:e.code??'METADATA_ERROR',error:errorValue(e),syscallError:e.cause??null,blockedAt:e.blockedAt??p,ancestorEntriesAtStop:e.entries??null,candidate:{path:p,followed:false,requiresNewRootDispatch:true}});}
 finally{item.completedAt=new Date().toISOString();}
}
const result={schemaVersion:1,scope:'Once-only exact eight-plist metadata diagnosis; no production compatibility call/bypass and no other installed paths followed.',cwd:repo,startedAt,completedAt:new Date().toISOString(),host:{platform:platform(),architecture:arch(),uid:account.uid,homedir:account.homedir},catalogAssertion:{status:'MATCHED_EXPECTED_RECORD',candidateFileSha256:hash(candidateBytes),catalogFileSha256:hash(catalogBytes),catalogInputSha256:catalog.before.sha256,uuid:record.uuid,runtimeId:record.runtimeInfo.bundleIdentifier,build:record.runtimeInfo.build,supportedArchitectures:record.runtimeInfo.supportedArchitectures,catalogURL:url,bundle},paths,metadata,children,trace,liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'}};
console.log(JSON.stringify(result,null,2));
