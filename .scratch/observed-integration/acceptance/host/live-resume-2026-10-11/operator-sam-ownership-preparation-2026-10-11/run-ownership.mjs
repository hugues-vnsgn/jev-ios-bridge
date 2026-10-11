import * as fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {recordCommand,writeNew} from './commands.mjs';
const evidence='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-sam-ownership-preparation-2026-10-11';
const sam='/Volumes/Sam',ancestors=['/','/Volumes',sam],at=()=>new Date().toISOString(),err=e=>({name:e.name,message:e.message,code:e.code??null});
if(process.argv.length!==3||process.argv[2]!=='--ownership-once-after-root-review')throw new Error('Root-review once flag required');
const bytes=await fs.readFile(evidence+'/sealed-sam-facts.json'),binding=JSON.parse(await fs.readFile(evidence+'/sealed-sam-binding.json','utf8'));
if(createHash('sha256').update(bytes).digest('hex')!==binding.sha256)throw new Error('Sealed Sam facts changed');
const facts=JSON.parse(bytes);if(!facts.samIdentity||!facts.deviceIdentity)throw new Error('Sealed facts schema mismatch');
const filesystem=[];let toggleCalls=0,mutationState='NOT_ATTEMPTED',toggleReceipt=null,result;
await writeNew('ownership-claimed.json',{claimedAtUtc:at(),toggleBudget:1,scope:['Fresh identity/ancestor/ACL proof','One noninteractive enableOwnership','Normal fresh same-volume typed check after clean direct sudo close only'],noSamDirectoryCreation:true,noSamOpenOrChmod:true});
const identity=s=>Object.fromEntries(['dev','ino','uid','gid','mode','size','nlink','mtimeNs','ctimeNs'].map(k=>[k,String(s[k])]).concat([['directory',s.isDirectory()],['symlink',s.isSymbolicLink()],['permissions',(s.mode&0o7777n).toString(8)]]));
async function stat(path){let timer;const e={operation:'lstat',path,startedAtUtc:at()};filesystem.push(e);try{const s=await Promise.race([fs.lstat(path,{bigint:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Read-only lstat deadline exceeded')),3000);})]);e.completedAtUtc=at();e.identity=identity(s);if(!e.identity.directory||e.identity.symlink)throw new Error('Nondirectory/symlink ancestor');return e.identity;}catch(error){e.completedAtUtc=at();e.error=err(error);throw error;}finally{clearTimeout(timer);}}
const same=(a,b)=>['dev','ino','uid','gid','mode'].every(k=>a[k]===b[k]);
async function command(name,argv){const o=await recordCommand(name,argv,{timeoutMs:10000,cap:65536});if(!o.ok)throw new Error('Command refused/uncertain: '+name);return o;}
async function volume(phase,enabled){await command('sam-'+phase,['/usr/sbin/diskutil','info','-plist',sam]);const o=await command('parse-'+phase,['/opt/homebrew/bin/python3',evidence+'/parse-sam-plist.py','sam-'+phase+'.stdout.bin']);const p=JSON.parse(o.stdout);
 for(const [k,v] of Object.entries({MountPoint:sam,...facts.deviceIdentity,FilesystemType:'hfs',Internal:false,Writable:true,WritableMedia:true,WritableVolume:true,GlobalPermissionsEnabled:enabled,SupportsGlobalPermissionsDisable:true}))if(p[k]!==v)throw new Error('Sam volume/access variance: '+k);
 return p;
}
async function acl(name){const o=await command(name,['/bin/ls','-ldneO',...ancestors]);if(/^\s*\d+:\s/m.test(o.stdout.toString('utf8')))throw new Error('Unexpected ancestor ACL; no ACL changes');return {paths:ancestors,receipt:name+'-receipt.json',aclEntries:0};}
try{
 const beforeIdentities={};for(const path of ancestors)beforeIdentities[path]=await stat(path);
 if(!same(beforeIdentities[sam],facts.samIdentity)||beforeIdentities[sam].permissions!=='775')throw new Error('Sam non-following identity/mode binding variance');
 for(const path of ['/','/Volumes'])if(beforeIdentities[path].uid!=='0'||beforeIdentities[path].permissions!=='755')throw new Error('System ancestor variance');
 const before=await volume('before',false),aclBefore=await acl('acl-before');if(!same(await stat(sam),beforeIdentities[sam]))throw new Error('Sam replaced before ownership attempt');
 toggleCalls++;mutationState='UNCONFIRMED_AFTER_TOGGLE_ATTEMPT';
 const toggle=await recordCommand('sam-enable-ownership',['/usr/bin/sudo','-n','/usr/sbin/diskutil','enableOwnership',sam],{timeoutMs:10000,cap:65536});toggleReceipt=toggle.receipt;
 if(!toggle.ok)throw new Error('Ownership command refused or uncertain; no recovery query in this scope');
 const after=await volume('after',true);mutationState='GLOBAL_PERMISSIONS_ENABLED_OBSERVED_BY_FRESH_TYPED_QUERY';
 const afterIdentities={};for(const path of ancestors)afterIdentities[path]=await stat(path);
 for(const path of ancestors)if(!same(beforeIdentities[path],afterIdentities[path]))throw new Error('Ancestor identity/owner/mode variance after ownership interpretation');
 const aclAfter=await acl('acl-after');
 result={status:'OWNERSHIP_ENABLED_PENDING_ROOT_ACCEPTANCE',before,after,beforeIdentities,afterIdentities,aclBefore,aclAfter,namespacePermissionAcceptance:'Pending; the exact Sam root remains 0775/staff-group writable. Future exact held-descriptor root repair and namespace creation require separate Root dispatch.'};
}catch(error){result={status:toggleCalls?'OWNERSHIP_ATTEMPT_STOPPED_PENDING_ROOT_AUDIT':'PRE_OWNERSHIP_REFUSAL',error:err(error),recoveryQueryExecuted:false,recoveryRequirement:toggleCalls?'If command outcome is uncertain, Root must separately review recovery-query scope. No automatic retry, rollback or follow-up query.':null};}
Object.assign(result,{completedAtUtc:at(),toggleCalls,mutationState,toggleReceiptFile:toggleReceipt?'sam-enable-ownership-receipt.json':null,actualDirectSudoClose:toggleReceipt?.closedAtUtc??null,directChildQualifier:'The recorder observes only the direct sudo child close. Any diskutil descendant is unobserved; timeout/kill does not establish mutation settlement.',filesystem,noMountUnmountRepartitionCommands:true,samMkdirCalls:0,samOpenCalls:0,samChmodCalls:0,recursiveChmodChownCalls:0,relocations:0,sourceRemovals:0,builds:0,deviceOperations:0,operatorState:'IDLE_FOR_ROOT_AUDIT'});
await writeNew('ownership-result.json',result);await new Promise(done=>process.stdout.write(JSON.stringify(result)+'\n',done));process.exit(result.status==='OWNERSHIP_ENABLED_PENDING_ROOT_ACCEPTANCE'?0:3);
