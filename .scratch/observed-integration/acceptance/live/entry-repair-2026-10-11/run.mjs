import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
const evidence=join(repo,'.scratch/observed-integration/acceptance/live/entry-repair-2026-10-11');
const target='/Users/hugues_mini/Library/Application Support/jev-ios-bridge';
const expectedEnv={HOME:'/Users/hugues_mini',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer'};
if(process.cwd()!==repo||process.execPath!=='/opt/homebrew/Cellar/node/26.8.1/bin/node'||process.version!=='v26.8.1'||process.argv.length!==3||process.argv[2]!=='--repair-once-after-root-review')throw new Error('Unpinned repair context');
for(const k of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,k))throw new Error('Unscrubbed environment');
const names=Object.keys(process.env).sort();if(names.some(k=>!Object.hasOwn(expectedEnv,k)&&k!=='__CF_USER_TEXT_ENCODING')||Object.entries(expectedEnv).some(([k,v])=>process.env[k]!==v))throw new Error('Unexpected bounded outer environment');
process.umask(0o077);
const at=()=>new Date().toISOString(),sha=b=>createHash('sha256').update(b).digest('hex');
async function write(name,value){if(name.includes('/')||name==='.'||name==='..')throw new Error('Evidence filename');await fs.writeFile(join(evidence,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
const d=await fs.lstat(evidence,{bigint:true});if(!d.isDirectory()||d.isSymbolicLink()||(d.mode&0o777n)!==0o700n)throw new Error('Evidence directory unsafe');
await write('repair-claimed.json',{claimedAtUtc:at(),budget:1,target,oldPermissions:'0755',newPermissions:'0700',noRecursiveChange:true});
function snapshot(s){
 const identity={};for(const k of ['dev','ino','uid','gid','mode','size','nlink','mtimeNs','ctimeNs']){if(typeof s[k]!=='bigint')throw new Error('Lossless bigint metadata unavailable: '+k);identity[k]=s[k].toString();}
 return {...identity,type:s.isDirectory()?'directory':s.isFile()?'file':s.isSymbolicLink()?'symlink':'other',permissions:(s.mode&0o777n).toString(8).padStart(4,'0')};
}
function requireBefore(s){if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==501n||s.gid!==20n||s.mode!==BigInt(constants.S_IFDIR|0o755))throw new Error('Target is not exact nonsymlink uid501/gid20 directory mode0755');}
function same(a,b,keys){return keys.every(k=>a[k]===b[k]);}
const fullKeys=['dev','ino','uid','gid','mode','size','nlink','mtimeNs','ctimeNs','type'];
const immutableAfterKeys=['dev','ino','uid','gid','size','nlink','mtimeNs','type'];
const result={scope:'One owner-authorized setup repair of exact app-owned directory only',target,startedAtUtc:at(),outerEnvironmentNames:names,operations:[],fchmodCalls:0,actualHandleClose:null,status:'PREPARING',claimsContentOrGuardMutation:false};let handle;
try{
 const beforeStat=await fs.lstat(target,{bigint:true});result.beforePath=snapshot(beforeStat);result.operations.push({method:'lstat',path:target,bigint:true,atUtc:at()});requireBefore(beforeStat);
 const flags=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW;result.openFlags={O_RDONLY:constants.O_RDONLY,O_DIRECTORY:constants.O_DIRECTORY,O_NOFOLLOW:constants.O_NOFOLLOW,combined:flags};
 if(typeof constants.O_DIRECTORY!=='number'||typeof constants.O_NOFOLLOW!=='number')throw new Error('Required directory/nofollow flags unavailable');
 handle=await fs.open(target,flags);result.operations.push({method:'open',path:target,flags,fd:handle.fd,atUtc:at()});
 const descriptorBefore=await handle.stat({bigint:true});result.beforeDescriptor=snapshot(descriptorBefore);requireBefore(descriptorBefore);
 const freshBeforeStat=await fs.lstat(target,{bigint:true});result.freshPathBeforeChange=snapshot(freshBeforeStat);requireBefore(freshBeforeStat);
 if(!same(result.beforePath,result.beforeDescriptor,fullKeys)||!same(result.beforeDescriptor,result.freshPathBeforeChange,fullKeys))throw new Error('Descriptor/path lossless identity mismatch before fchmod');
 result.beforeBindingVerified=true;result.fchmodCalls=1;result.operations.push({method:'fchmod',via:'held FileHandle.chmod',fd:handle.fd,permissions:'0700',atUtc:at()});
 await handle.chmod(0o700);
 const afterDescriptorStat=await handle.stat({bigint:true});result.afterDescriptor=snapshot(afterDescriptorStat);
 const afterPathStat=await fs.lstat(target,{bigint:true});result.afterPath=snapshot(afterPathStat);
 if(!afterDescriptorStat.isDirectory()||afterDescriptorStat.isSymbolicLink()||afterDescriptorStat.uid!==501n||afterDescriptorStat.gid!==20n||afterDescriptorStat.mode!==BigInt(constants.S_IFDIR|0o700))throw new Error('Descriptor mode/owner/type mismatch after fchmod');
 if(!same(result.afterDescriptor,result.afterPath,fullKeys)||!same(result.beforeDescriptor,result.afterDescriptor,immutableAfterKeys))throw new Error('Fresh descriptor/path lossless identity mismatch after fchmod');
 result.afterBindingVerified=true;result.status='REPAIR_VERIFIED';
}catch(error){result.status=result.fchmodCalls?'REPAIR_UNCERTAIN':'REPAIR_REFUSED';result.error={name:error.name,message:error.message,code:error.code??null,stack:error.stack??null};}
finally{if(handle){try{await handle.close();result.actualHandleClose={atUtc:at(),completed:true};result.operations.push({method:'close',completed:true,atUtc:result.actualHandleClose.atUtc});}catch(error){result.status='REPAIR_UNCERTAIN';result.closeError={name:error.name,message:error.message,code:error.code??null};}}}
result.completedAtUtc=at();result.allowedChange='Only exact target permissions0755 to0700, one fchmod through held descriptor. No parent/Xcode/runtime/recursive chmod, content/claim/guard change, configuration read or migration.';
if(result.status==='REPAIR_VERIFIED'&&(!result.actualHandleClose?.completed||result.fchmodCalls!==1))result.status='REPAIR_UNCERTAIN';
await write('result.json',result);
await fs.writeFile(join(evidence,'report.md'),'Exact-directory operational setup repair: '+result.status+'\n\n'+JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
const files=[];for(const name of (await fs.readdir(evidence)).sort()){const p=join(evidence,name),s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600)throw new Error('Evidence file unsafe');const bytes=await fs.readFile(p);files.push({path:name,bytes:bytes.length,sha256:sha(bytes),mode:'0600'});}
await write('artifact-hashes.json',{sealedAtUtc:at(),scope:'Every repair evidence file except this manifest itself',directoriesMode:'0700',files});
console.log(JSON.stringify({status:result.status,target,fchmodCalls:result.fchmodCalls,actualHandleClose:result.actualHandleClose,oldPermissions:result.beforePath?.permissions,newPermissions:result.afterPath?.permissions}));process.exitCode=result.status==='REPAIR_VERIFIED'?0:3;
