import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordCommand,writeNew} from './commands.mjs';
const evidence='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-sam-setup-preparation-2026-10-11';
const sam='/Volumes/Sam',root=sam+'/jev-ios-bridge-release-2026-10-11',children=['build','staging','archive'];
const at=()=>new Date().toISOString(),err=e=>({name:e.name,message:e.message,code:e.code??null});
if(process.argv.length!==3||process.argv[2]!=='--execute-once-after-root-review')throw new Error('Root-review once flag required');
const factsBytes=await fs.readFile(evidence+'/sealed-sam-facts.json'),binding=JSON.parse(await fs.readFile(evidence+'/sealed-sam-binding.json','utf8'));
if(createHash('sha256').update(factsBytes).digest('hex')!==binding.sha256)throw new Error('Sealed Sam facts changed');
const facts=JSON.parse(factsBytes);let toggleCalls=0;const created=[],filesystem=[],closes=[];let held,result;
await writeNew('setup-claimed.json',{claimedAtUtc:at(),toggleBudget:1,newDirectories:[root,...children.map(n=>root+'/'+n)],reviewRequired:true});
async function bounded(operation,path,invoke){let timer;const e={operation,path,startedAtUtc:at()};filesystem.push(e);try{const value=await Promise.race([invoke(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Filesystem deadline exceeded')),3000);})]);e.completedAtUtc=at();return value;}catch(error){e.completedAtUtc=at();e.error=err(error);throw error;}finally{clearTimeout(timer);}}
const identity=s=>Object.fromEntries(['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>[k,String(s[k])]).concat([['directory',s.isDirectory()],['symlink',s.isSymbolicLink()],['permissions',(s.mode&0o7777n).toString(8)]]));
async function stat(path){const s=await bounded('lstat',path,()=>fs.lstat(path,{bigint:true}));const x=identity(s);filesystem.at(-1).identity=x;if(!x.directory||x.symlink)throw new Error('Nondirectory/symlink '+path);return x;}
const same=(a,b,keys=['dev','ino','uid','gid','mode'])=>keys.every(k=>a[k]===b[k]);
async function command(name,argv){const o=await recordCommand(name,argv,{timeoutMs:10000,cap:65536});if(!o.ok)throw new Error('Command refused: '+name);return o;}
async function volume(phase,enabled){await command('sam-'+phase,['/usr/sbin/diskutil','info','-plist',sam]);const o=await command('parse-'+phase,['/opt/homebrew/bin/python3',evidence+'/parse-sam-plist.py','sam-'+phase+'.stdout.bin']);const p=JSON.parse(o.stdout);
 for(const [k,v] of Object.entries({MountPoint:sam,...facts.deviceIdentity,FilesystemType:'hfs',Internal:false,Writable:true,WritableMedia:true,WritableVolume:true,GlobalPermissionsEnabled:enabled,SupportsGlobalPermissionsDisable:true}))if(p[k]!==v)throw new Error('Sam volume/access variance: '+k);
 return p;
}
async function acl(name,paths){const o=await command(name,['/bin/ls','-ldneO',...paths]);const text=o.stdout.toString('utf8');if(/^\s*\d+:\s/m.test(text))throw new Error('Unexpected ACL; retained for Root, no modification');return {paths,receipt:name+'-receipt.json',aclEntries:0};}
async function absent(){try{await bounded('lstat-absent',root,()=>fs.lstat(root,{bigint:true}));throw new Error('Exact namespace already exists');}catch(error){if(error.code!=='ENOENT')throw error;}}
async function privateDir(path){const x=await stat(path);if(x.uid!=='501'||x.gid!=='20'||x.permissions!=='700')throw new Error('Private directory ownership/mode variance: '+path);return x;}
try{
 const ancestorsBefore={};for(const path of ['/','/Volumes',sam])ancestorsBefore[path]=await stat(path);
 if(!same(ancestorsBefore[sam],facts.sam)||ancestorsBefore[sam].permissions!=='775')throw new Error('Sam lstat binding variance');
 for(const path of ['/','/Volumes'])if(ancestorsBefore[path].uid!=='0'||ancestorsBefore[path].permissions!=='755')throw new Error('System ancestor variance: '+path);
 const before=await volume('before',false);const aclBefore=await acl('acl-before',['/','/Volumes',sam]);await absent();
 const immediatelyBefore=await stat(sam);if(!same(immediatelyBefore,ancestorsBefore[sam]))throw new Error('Sam replaced before ownership toggle');
 toggleCalls++;await command('sam-enable-ownership',['/usr/bin/sudo','-n','/usr/sbin/diskutil','enableOwnership',sam]);
 const after=await volume('after',true);const ancestorsAfter={};for(const path of ['/','/Volumes',sam])ancestorsAfter[path]=await stat(path);
 for(const path of ['/','/Volumes',sam])if(!same(ancestorsBefore[path],ancestorsAfter[path]))throw new Error('Ancestor identity/owner/mode variance after ownership interpretation: '+path);
 await bounded('access-write-execute',sam,()=>fs.access(sam,constants.W_OK|constants.X_OK));await absent();
 await bounded('mkdir-exclusive',root,()=>fs.mkdir(root,{mode:0o700}));created.push(root);const rootIdentity=await privateDir(root);
 held=await bounded('open-directory-no-follow',root,()=>fs.open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW));const descriptor=identity(await bounded('fstat',root,()=>held.stat({bigint:true})));if(!same(rootIdentity,descriptor))throw new Error('Namespace descriptor mismatch');
 for(const name of children){const path=root+'/'+name;if(!same(await stat(sam),ancestorsAfter[sam]))throw new Error('Sam identity changed before child creation');await bounded('mkdir-exclusive',path,()=>fs.mkdir(path,{mode:0o700}));created.push(path);await privateDir(path);await bounded('access-read-write-execute',path,()=>fs.access(path,constants.R_OK|constants.W_OK|constants.X_OK));}
 for(const path of created)await privateDir(path);
 if(!same(await stat(root),identity(await bounded('fstat',root,()=>held.stat({bigint:true}))))throw new Error('Final namespace descriptor/path mismatch');
 for(const path of ['/','/Volumes',sam])if(!same(await stat(path),ancestorsAfter[path]))throw new Error('Final ancestor identity/owner/mode variance: '+path);
 const aclAfter=await acl('acl-after',['/','/Volumes',sam,...created]);
 result={status:'SAM_SETUP_CREATED_PENDING_ROOT_PERMISSION_ACCEPTANCE',before,after,ancestorsBefore,ancestorsAfter,aclBefore,aclAfter,namespace:root,privateDirectories:created,permissionQualification:'The exact Sam root remains previously observed 0775 and staff-group writable. New private directories are uid501/gid20/0700 with no ACL entries. This does not establish an unrenameable hostile-parent boundary, and changes no production trust policy. Root must audit before acceptance or use.'};
}catch(error){result={status:'SETUP_REFUSAL',error:err(error),createdDirectories:created};}
finally{if(held){const e={path:root,closeStartedAtUtc:at()};closes.push(e);try{await held.close();e.closedAtUtc=at();e.success=true;}catch(error){e.error=err(error);result={status:'SETUP_REFUSAL',error:err(error),priorResult:result};}}}
Object.assign(result,{completedAtUtc:at(),toggleCalls,filesystem,closes,noRecursiveChmodChown:true,noMountChanges:true,sourceRemovals:0,relocations:0,builds:0,deviceOperations:0,operatorState:'IDLE_FOR_ROOT_AUDIT'});
await writeNew('setup-result.json',result);await new Promise(done=>process.stdout.write(JSON.stringify(result)+'\n',done));process.exit(result.status==='SAM_SETUP_CREATED_PENDING_ROOT_PERMISSION_ACCEPTANCE'?0:3);
