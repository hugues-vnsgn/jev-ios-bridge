import * as fs from 'node:fs/promises';
import {recordCommand,writeNew} from './commands.mjs';
if(process.argv.length!==3||process.argv[2]!=='--read-only-once')throw new Error('Explicit once argument required');
const sam='/Volumes/Sam',simulator='/Users/hugues_mini/Library/Developer/CoreSimulator';
const at=()=>new Date().toISOString();
const error=e=>({name:e.name,message:e.message,code:e.code??null});
const metadata=[];let diskutilCalls=0,observed=null;
await writeNew('diagnosis-claimed.json',{claimedAtUtc:at(),diskutilBudget:1,lstatBudget:4,statfsBudget:2,metadataDeadlineMs:3000});
async function sample(operation,path){
 const item={operation,path,startedAtUtc:at()};metadata.push(item);let timer;
 try{
  const s=await Promise.race([fs[operation](path,{bigint:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Metadata read deadline exceeded')),3000);})]);
  item.completedAtUtc=at();
  item.value=Object.fromEntries((operation==='lstat'?['dev','ino','uid','gid','mode','size','nlink','mtimeNs','ctimeNs']:['type','bsize','blocks','bfree','bavail','files','ffree']).map(k=>[k,String(s[k])]));
  if(operation==='lstat')Object.assign(item.value,{permissions:(s.mode&0o7777n).toString(8),directory:s.isDirectory(),symlink:s.isSymbolicLink()});
  else{item.value.availableBytes=String(s.bavail*s.bsize);item.value.typeHex='0x'+s.type.toString(16);}
  return item.value;
 }catch(e){item.completedAtUtc=at();item.error=error(e);throw e;}finally{clearTimeout(timer);}
}
let result;
try{
 const samBefore=await sample('lstat',sam);if(!samBefore.directory||samBefore.symlink)throw new Error('Sam is not a nonsymlink directory');
 const simulatorBefore=await sample('lstat',simulator);if(!simulatorBefore.directory||simulatorBefore.symlink)throw new Error('Simulator path is not a nonsymlink directory');
 const samFs=await sample('statfs',sam),simulatorFs=await sample('statfs',simulator);
 diskutilCalls++;observed=await recordCommand('diskutil',['/usr/sbin/diskutil','info','-plist',sam],{timeoutMs:10000,cap:65536});
 if(!observed.ok)throw new Error('Bounded diskutil query refused; no repeat');
 const samAfter=await sample('lstat',sam),simulatorAfter=await sample('lstat',simulator);
 const stable=JSON.stringify(samBefore)===JSON.stringify(samAfter)&&JSON.stringify(simulatorBefore)===JSON.stringify(simulatorAfter);
 if(!stable)throw new Error('Sampled path metadata changed during diagnosis');
 result={status:'RAW_SAM_FACTS_CAPTURED',samPath:sam,simulatorPath:simulator,sam:samBefore,simulator:simulatorBefore,samFilesystem:samFs,simulatorFilesystem:simulatorFs,distinctStatDevice:samBefore.dev!==simulatorBefore.dev,samAtLeast70GiB:BigInt(samFs.availableBytes)>=75161927680n,thresholdBytes:'75161927680',sampledIdentitiesStable:true,identityQualification:'Non-following bigint lstat before/after; path reads are not an atomic mount pin.',diskutilParsing:'Raw plist retained for finite Python plistlib summary; no product parser change.',actualDiskutilClose:observed.receipt.closedAtUtc};
}catch(e){result={status:'DIAGNOSIS_REFUSAL',error:error(e),actualDiskutilClose:observed?.receipt.closedAtUtc??null};}
Object.assign(result,{completedAtUtc:at(),diskutilCalls,metadata,metadataDeadlineMs:3000,noWritesToSam:true,recursiveScans:0,migrationCalls:0,builds:0,deviceOperations:0,relocationSupport:'Not established by this volume diagnosis'});
await writeNew('metadata-result.json',result);await new Promise(done=>process.stdout.write(JSON.stringify(result)+'\n',done));process.exit(result.status==='RAW_SAM_FACTS_CAPTURED'?0:3);
