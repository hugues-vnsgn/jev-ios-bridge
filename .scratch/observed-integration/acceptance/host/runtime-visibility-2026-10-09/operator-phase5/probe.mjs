import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { userInfo,arch,platform } from 'node:os';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo)throw new Error('Unexpected cwd');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Key/loader environment present');
const startedAt=new Date().toISOString(),account=userInfo(),root=join(repo,'.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09');
const hash=b=>createHash('sha256').update(b).digest('hex'),evidenceHashes=[];
async function acceptedArtifact(phase,name){
 const p=join(root,'operator-phase'+phase,name),bytes=await fs.readFile(p);
 const manifest=JSON.parse(await fs.readFile(join(root,'operator-phase'+phase,'artifact-hashes.json'),'utf8'));
 if(manifest.files.find(x=>x.path===name)?.sha256!==hash(bytes))throw new Error('Prior artifact provenance mismatch');
 evidenceHashes.push({path:p,sha256:hash(bytes)});return JSON.parse(bytes);
}
const candidates=await acceptedArtifact(3,'candidate-paths.json'),catalog=await acceptedArtifact(3,'catalog.json'),phase4=await acceptedArtifact(4,'result.json');
const records=catalog.sanitizedValue.images.filter(x=>x.runtimeInfo?.bundleIdentifier==='com.apple.CoreSimulator.SimRuntime.iOS-27-0');
if(records.length!==1||catalog.status!=='PARSED_STABLE'||!catalog.stableAcrossParse)throw new Error('Expected catalog record not unique/stable');
const record=records[0],bundle=fileURLToPath(record.runtimeInfo.bundlePath.relative).replace(/\/$/,'');
const mount='/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ';
const suffix='/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS 27.0.simruntime';
if(bundle!==mount+suffix||bundle!==candidates.priorityRuntimeBundle.path||bundle!==phase4.catalogAssertion.bundle||record.runtimeInfo.build!=='24A434'||record.uuid!==phase4.catalogAssertion.uuid)throw new Error('Approved mount/bundle derivation mismatch');
const leaves=['Contents/Info.plist','Contents/Resources/profile.plist','Contents/Resources/RuntimeRoot/System/Library/CoreServices/SystemVersion.plist'].map(x=>join(bundle,x));
if(JSON.stringify(leaves)!==JSON.stringify(candidates.priorityMetadataFiles.map(x=>x.path))||JSON.stringify(leaves)!==JSON.stringify(phase4.metadata.slice(0,3).map(x=>x.path)))throw new Error('Approved runtime leaf mismatch');
const xcode='/Applications/Xcode.app/Contents/Info.plist',expectedXcodeSha='537783b4c639af6ee31208fe2ec12a40bacbb0fc8f5dd2820f54e03063c4dbe8';
if(phase4.metadata.find(x=>x.path===xcode)?.before.sha256!==expectedXcodeSha||phase4.metadata.find(x=>x.path==='/System/Library/CoreServices/SystemVersion.plist')?.sanitizedValue.ProductVersion!=='27.0.1')throw new Error('Accepted Xcode/host context mismatch');
const namespace='/private/var/run/com.apple.security.cryptexd';
const statPaths=['/private/var/run',namespace,namespace+'/mnt',mount,...leaves];
const diskutil='/usr/sbin/diskutil',stat='/usr/bin/stat',plutil='/usr/bin/plutil';
const executables=[diskutil,stat,plutil],trace=[],children=[],statResults=[];
const format='%d|%i|%u|%g|%p|%f|%Sf',budget=1024*1024,used=new Set();
const describe=s=>({type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other',uid:s.uid,gid:s.gid,mode:'0'+(s.mode&0o7777).toString(8),modeBits:s.mode,nlink:s.nlink,size:s.size,dev:s.dev,ino:s.ino,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.mode,s.uid,s.gid,s.nlink].join(':');
const errorValue=e=>({code:e.code??null,syscall:e.syscall??null,message:e.message});
const log=(method,path,data={})=>trace.push({sequence:trace.length+1,atUtc:new Date().toISOString(),method,path,...data});
function ancestors(p){if(!p.startsWith('/')||resolve(p)!==p||p.includes('\0'))throw new Error('Noncanonical path');const a=['/'];let cur='';for(const part of p.split('/').filter(Boolean)){cur+='/'+part;a.push(cur);}return a;}
const allowedStats=new Set([...statPaths,xcode,...executables].flatMap(ancestors));
async function chain(p){
 const entries=[];
 for(const part of ancestors(p)){
  if(!allowedStats.has(part))throw new Error('Stat allowlist rejected path');
  let s;try{s=await fs.lstat(part);}catch(e){log('lstat',part,{ok:false,error:errorValue(e)});throw Object.assign(new Error('Installed path inaccessible'),{code:e.code??'LSTAT_ERROR',blockedAt:part,cause:errorValue(e),entries});}
  const entry={path:part,...describe(s)};entries.push(entry);log('lstat',part,{ok:true,...describe(s)});
  if(s.isSymbolicLink())throw Object.assign(new Error('Symlink not followed'),{code:'SYMLINK_NOT_FOLLOWED',blockedAt:part,entries});
  if(part!==p&&!s.isDirectory())throw Object.assign(new Error('Ancestor not directory'),{code:'ANCESTOR_NOT_DIRECTORY',blockedAt:part,entries});
 }
 return {entries,leaf:entries.at(-1)};
}
async function stableXcode(){
 const chainBefore=await chain(xcode),before=await fs.lstat(xcode);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||!Number.isSafeInteger(before.size)||before.size<0||before.size>65536)throw Object.assign(new Error('Xcode input type/size uncertain'),{code:'UNSAFE_XCODE_INPUT',blockedAt:xcode});
 const h=await fs.open(xcode,constants.O_RDONLY|constants.O_NOFOLLOW);log('open-readonly-nofollow',xcode,{flags:constants.O_RDONLY|constants.O_NOFOLLOW});
 try{
  const opened=await h.stat();if(stamp(before)!==stamp(opened))throw Object.assign(new Error('Xcode replaced at open'),{code:'METADATA_CHANGED',blockedAt:xcode});
  const chunks=[];let size=0;
  while(true){const b=Buffer.alloc(65536),r=await h.read(b,0,b.length,null);if(!r.bytesRead)break;size+=r.bytesRead;if(size>65536)throw Object.assign(new Error('Xcode input exceeds cap'),{code:'INPUT_SIZE_CAP',blockedAt:xcode});chunks.push(b.subarray(0,r.bytesRead));}
  const final=await h.stat(),chainAfter=await chain(xcode),after=await fs.lstat(xcode),bytes=Buffer.concat(chunks),sha256=hash(bytes);
  if(stamp(before)!==stamp(final)||stamp(before)!==stamp(after)||JSON.stringify(chainBefore.entries)!==JSON.stringify(chainAfter.entries)||bytes.length!==before.size)throw Object.assign(new Error('Xcode input/ancestors changed'),{code:'METADATA_CHANGED',blockedAt:xcode});
  if(sha256!==expectedXcodeSha)throw Object.assign(new Error('Xcode input differs from accepted hash'),{code:'INPUT_HASH_MISMATCH',blockedAt:xcode});
  const value={path:xcode,bytes:bytes.length,sha256,stamp:stamp(before),before:describe(before),opened:describe(opened),finalHandle:describe(final),after:describe(after),ancestorEntries:chainBefore.entries};
  log('stable-read-hash',xcode,value);return value;
 }finally{await h.close();}
}
const sensitive=/token|secret|credential|password|passphrase|auth|api[-_]?key|cookie|session|bearer|private[-_]?key/i;
function redactString(s){return s.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,'$1<REDACTED>').replace(/(\b(?:token|secret|credential|password|passphrase|api[-_]?key|cookie|session|bearer|private[-_]?key)\b\s*[=:]\s*)[^\s,;<]+/gi,'$1<REDACTED>').replace(/(<key>[^<]*(?:token|secret|credential|password|passphrase|auth|api[-_]?key|cookie|session|bearer|private[-_]?key)[^<]*<\/key>\s*)<(?:string|data)>[\s\S]*?<\/(?:string|data)>/gi,'$1<string>REDACTED</string>');}
function redact(v){if(Array.isArray(v))return v.map(redact);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,sensitive.test(k)?'<REDACTED>':redact(x)]));return typeof v==='string'?redactString(v):v;}
function sanitizeJSONOutput(s){try{return JSON.stringify(redact(JSON.parse(s)),null,2)+'\n';}catch{return s?'<REDACTED_UNPARSED_JSON_OUTPUT>':'';}}
const env={HOME:account.homedir,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
async function child(executable,args,target,kind){
 const permitted=(executable===diskutil&&JSON.stringify(args)===JSON.stringify(['info','-plist',mount])&&target===mount)
  ||(executable===stat&&args.length===3&&args[0]==='-f'&&args[1]===format&&statPaths.includes(args[2])&&target===args[2])
  ||(executable===plutil&&JSON.stringify(args)===JSON.stringify(['-convert','json','-o','-','--',xcode])&&target===xcode);
 if(!permitted)throw new Error('Child argv allowlist rejected');
 const key=JSON.stringify([executable,...args]);if(used.has(key))throw new Error('Child repetition rejected');used.add(key);
 const targetBefore=await chain(target),exe=await chain(executable);
 if(targetBefore.leaf.type!==(leaves.includes(target)||target===xcode?'file':'directory'))throw Object.assign(new Error('Unexpected target type'),{code:'TARGET_TYPE_UNCERTAIN',blockedAt:target});
 if(exe.leaf.type!=='file'||!(exe.leaf.modeBits&0o111))throw Object.assign(new Error('Executable unavailable'),{code:'EXECUTABLE_SEAM_UNAVAILABLE',blockedAt:executable});
 const receipt={kind,argv:[executable,...args],cwd:repo,startedAt:new Date().toISOString(),environment:env,shell:false,stdin:'ignored',timeoutMs:10000,hardTerminationMs:12000,maxCombinedOutputBytes:budget,targetBefore,executableAncestorStats:exe.entries};children.push(receipt);
 const captured=await new Promise(done=>{
  const p=spawn(executable,args,{cwd:repo,env,shell:false,stdio:['ignore','pipe','pipe']}),out=[],err=[];let seen=0,kept=0,overflow=false,timedOut=false,error=null;
  const timer=setTimeout(()=>{timedOut=true;try{p.kill('SIGTERM');}catch{}},10000),hard=setTimeout(()=>{try{p.kill('SIGKILL');}catch{}},12000);
  const capture=chunks=>b=>{seen+=b.length;const remaining=budget-kept;if(remaining>0){const slice=b.subarray(0,Math.min(remaining,b.length));chunks.push(slice);kept+=slice.length;}if(seen>budget){overflow=true;try{p.kill('SIGTERM');}catch{}}};
  p.stdout.on('data',capture(out));p.stderr.on('data',capture(err));p.on('error',e=>{error=errorValue(e);});
  p.once('close',(exitCode,signal)=>{clearTimeout(timer);clearTimeout(hard);const stdout=Buffer.concat(out).toString('utf8'),stderr=Buffer.concat(err).toString('utf8');
   Object.assign(receipt,{completedAt:new Date().toISOString(),exitCode,signal,timedOut,overflow,error,observedCombinedBytes:seen,retainedCombinedBytes:kept,outputComplete:!overflow,stdoutBytes:Buffer.byteLength(stdout),stderrBytes:Buffer.byteLength(stderr),stdoutSha256:hash(stdout),stderrSha256:hash(stderr),stdoutSanitized:kind==='EXACT_XCODE_PLUTIL_1MIB'?sanitizeJSONOutput(stdout):redactString(stdout),stderrSanitized:redactString(stderr),redaction:'Sensitive XML-key/assignment/bearer values redacted; parsed JSON recursively redacted. Hashes describe complete original outputs only when outputComplete=true.'});done({stdout,stderr});
  });
 });
 try{receipt.targetAfter=await chain(target);receipt.targetStable=JSON.stringify(targetBefore.entries)===JSON.stringify(receipt.targetAfter.entries);}
 catch(e){receipt.targetStable=false;receipt.targetAfterError={...errorValue(e),blockedAt:e.blockedAt??target,entries:e.entries??null};}
 if(receipt.exitCode!==0||receipt.signal||receipt.timedOut||receipt.overflow||receipt.error||!receipt.targetStable)throw Object.assign(new Error('Bounded child/result unstable or failed'),{code:!receipt.targetStable?'TARGET_CHANGED':'CHILD_FAILED',blockedAt:target,receiptIndex:children.length-1});
 return {receipt,...captured};
}
let plistModule=null,parserAvailability;
try{const require=createRequire(join(repo,'package.json'));const resolved=require.resolve('plist');plistModule=require('plist');if(typeof plistModule.parse!=='function')throw Object.assign(new Error('Installed plist package has no parse function'),{code:'NO_PARSE_FUNCTION'});parserAvailability={status:'AVAILABLE',package:'plist',resolved};}
catch(e){parserAvailability={status:'UNAVAILABLE',package:'plist',error:errorValue(e),fallbackUsed:false};}
let mountResult={path:mount,startedAt:new Date().toISOString()};
try{
 const c=await child(diskutil,['info','-plist',mount],mount,'EXACT_DISKUTIL_INFO');mountResult.receiptIndex=children.length-1;
 if(!plistModule){mountResult.status='OUTPUT_RECORDED_PARSER_UNAVAILABLE';mountResult.readOnlyConclusion='UNKNOWN';mountResult.mountPointCorrespondence='UNVERIFIED';}
 else{try{const value=redact(plistModule.parse(c.stdout));mountResult.sanitizedValue=value;mountResult.mountPointCorrespondence=value?.MountPoint===mount?'EXACT_MATCH':'MISMATCH_OR_MISSING';mountResult.readOnlyVolume=value?.ReadOnlyVolume??null;mountResult.readOnlyMedia=value?.ReadOnlyMedia??null;mountResult.status='PARSED_STABLE';mountResult.readOnlyConclusion=value?.MountPoint===mount&&value?.ReadOnlyVolume===true?'EXACT_MOUNT_REPORTS_READ_ONLY':'UNSUPPORTED_OR_UNKNOWN';}catch(e){mountResult.status='OUTPUT_RECORDED_PARSE_FAILED';mountResult.parsingError=errorValue(e);mountResult.mountPointCorrespondence='UNVERIFIED';mountResult.readOnlyConclusion='UNKNOWN';}}
}catch(e){Object.assign(mountResult,{status:'BOUNDED_STOP',error:errorValue(e),blockedAt:e.blockedAt??mount,receiptIndex:e.receiptIndex??null,readOnlyConclusion:'UNKNOWN',mountPointCorrespondence:'UNVERIFIED'});}
mountResult.completedAt=new Date().toISOString();
for(const target of statPaths){
 const item={path:target,startedAt:new Date().toISOString()};statResults.push(item);
 try{
  const c=await child(stat,['-f',format,target],target,'EXACT_LSTAT_FLAGS');item.receiptIndex=children.length-1;
  const fields=c.stdout.trimEnd().split('|');if(fields.length!==7)throw Object.assign(new Error('Stat output shape uncertain'),{code:'STAT_OUTPUT_SHAPE',blockedAt:target});
  const [device,inode,uid,gid,mode,flagsNumeric,flagsText]=fields,observed=c.receipt.targetBefore.leaf;
  const idsMatch=Number(device)===observed.dev&&Number(inode)===observed.ino&&Number(uid)===observed.uid&&Number(gid)===observed.gid&&/^[0-7]+$/.test(mode)&&parseInt(mode,8)===observed.modeBits;
  Object.assign(item,{status:idsMatch?'RECORDED_STABLE':'STAT_LSTAT_CORRESPONDENCE_UNCERTAIN',fields:{device,inode,uid,gid,mode,flagsNumeric,flagsText},lstatCorrespondence:idsMatch?'MATCH':'UNCERTAIN',targetBefore:c.receipt.targetBefore,targetAfter:c.receipt.targetAfter,protectionConclusion:'NO_POLICY_INFERENCE_FROM_FLAGS'});
 }catch(e){Object.assign(item,{status:'BOUNDED_STOP',error:errorValue(e),blockedAt:e.blockedAt??target,receiptIndex:e.receiptIndex??item.receiptIndex??null});}
 item.completedAt=new Date().toISOString();
}
const xcodeResult={path:xcode,startedAt:new Date().toISOString()};
try{
 xcodeResult.before=await stableXcode();
 const c=await child(plutil,['-convert','json','-o','-','--',xcode],xcode,'EXACT_XCODE_PLUTIL_1MIB');xcodeResult.receiptIndex=children.length-1;
 xcodeResult.after=await stableXcode();xcodeResult.stableAcrossConversion=xcodeResult.before.stamp===xcodeResult.after.stamp&&xcodeResult.before.sha256===xcodeResult.after.sha256&&JSON.stringify(xcodeResult.before.ancestorEntries)===JSON.stringify(xcodeResult.after.ancestorEntries);
 if(!xcodeResult.stableAcrossConversion)throw Object.assign(new Error('Xcode changed across conversion'),{code:'METADATA_CHANGED',blockedAt:xcode});
 const parsed=JSON.parse(c.stdout);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Object.assign(new Error('Xcode JSON not object'),{code:'JSON_SHAPE',blockedAt:xcode});
 xcodeResult.sanitizedValue=redact(parsed);c.receipt.stdoutSanitized=JSON.stringify(xcodeResult.sanitizedValue,null,2)+'\n';
 const osVersion=s=>typeof s==='string'&&/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(s)?s.split('.').map(Number):null;
 const compare=(a,b)=>{for(let i=0;i<3;i++){const d=(a[i]??0)-(b[i]??0);if(d)return d;}return 0;};
 const min=osVersion(parsed.LSMinimumSystemVersion),host=osVersion('27.0.1');
 xcodeResult.predicates=[{id:'CFBundleIdentifier',verdict:parsed.CFBundleIdentifier==='com.apple.dt.Xcode'?'MATCH':'DISCREPANCY',actual:parsed.CFBundleIdentifier,expected:'com.apple.dt.Xcode',sourceAnchor:'src/observed/allocation-config.ts:181'},{id:'CFBundleExecutable',verdict:parsed.CFBundleExecutable==='Xcode'?'MATCH':'DISCREPANCY',actual:parsed.CFBundleExecutable,expected:'Xcode',sourceAnchor:'src/observed/allocation-config.ts:181'},{id:'LSMinimumSystemVersion',verdict:min&&host&&compare(min,host)<=0?'MATCH':'DISCREPANCY',actual:parsed.LSMinimumSystemVersion,hostVersion:'27.0.1',hostVersionBasis:'Accepted phase4 host SystemVersion; not reread phase5.',sourceAnchor:'src/observed/allocation-config.ts:182'}];
 xcodeResult.status=xcodeResult.predicates.every(x=>x.verdict==='MATCH')?'COMPLETE_STABLE_METADATA_MATCH':'COMPLETE_STABLE_METADATA_DISCREPANCY';
 xcodeResult.completeJSONBytes=c.receipt.stdoutBytes;xcodeResult.completeJSONSha256=c.receipt.stdoutSha256;
}catch(e){Object.assign(xcodeResult,{status:'BOUNDED_STOP',error:errorValue(e),blockedAt:e.blockedAt??xcode,receiptIndex:e.receiptIndex??xcodeResult.receiptIndex??null});}
xcodeResult.completedAt=new Date().toISOString();
console.log(JSON.stringify({schemaVersion:1,scope:'One finite phase5 metadata batch: exact diskutil info, seven exact stat paths, one bounded Xcode JSON conversion. No acceptance or repairs.',cwd:repo,startedAt,completedAt:new Date().toISOString(),host:{platform:platform(),architecture:arch(),uid:account.uid,homedir:account.homedir},catalogAssertion:{status:'MATCHED_PHASE3_PHASE4_EXPECTED_RECORD',mountRoot:mount,bundle,uuid:record.uuid,runtimeId:record.runtimeInfo.bundleIdentifier,build:record.runtimeInfo.build,priorEvidenceHashes:evidenceHashes},parserAvailability,mountResult,statResults,xcodeResult,children,trace,liveRows:{L01:'UNVERIFIED',L02:'UNVERIFIED',L03:'UNVERIFIED',L04:'UNVERIFIED',L05:'UNVERIFIED'}},null,2));
