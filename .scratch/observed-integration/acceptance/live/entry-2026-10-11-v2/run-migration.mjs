import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {recordCommand,writeNew,sha} from './commands.mjs';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic',dir=join(repo,'.scratch/observed-integration/acceptance/live/entry-2026-10-11-v2');
const binding=JSON.parse(await fs.readFile(join(dir,'entry-binding.json'),'utf8')),acceptance=JSON.parse(await fs.readFile(join(dir,'01-config-root-acceptance.json'),'utf8'));
if(acceptance.status!=='PASS_BY_ROOT_AUDIT_OF_EXISTING_PRODUCTION_READ'||acceptance.effectiveDigest!=='0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d')throw new Error('Configuration acceptance absent');
const declaration=binding.declaration.path,declarationStat=await fs.lstat(declaration);if(!declarationStat.isFile()||declarationStat.isSymbolicLink()||(declarationStat.mode&0o777)!==0o600||sha(await fs.readFile(declaration))!=='676e554a08bcf44403da1ffef4737d5508c36e1f00e6793951f338fbf280e25b')throw new Error('Declaration changed');
for(const group of Object.values(binding.groups))for(const e of group.files)if(sha(await fs.readFile(join(repo,e.path)))!==e.sha256)throw new Error('Pinned source/compiled/host changed');
const argv=[process.execPath,join(repo,'dist/device/admission-maintenance.js'),'migrate',declaration];
const observed=await recordCommand('02-migration',argv,{timeoutMs:60000,cap:67108864});let raw;try{raw=JSON.parse(observed.stdout);}catch(e){raw={kind:'UNPARSEABLE_MIGRATION_OUTPUT',error:e.message};}
await writeNew('02-migration-result.json',raw);
let success=observed.ok&&raw.version===1&&typeof raw.installationId==='string'&&raw.declaration?.writersStopped===true&&raw.declaration?.historicalRootsDeclaredOrExcluded===true&&Array.isArray(raw.sources);
let preservation={scope:'Compare only production migration collector source byte hashes to stable re-read after migration; no source writes or cleanup',verifiedAtUtc:new Date().toISOString(),allMatch:false,files:[],sources:raw.sources??null};
if(success){
 try{for(const source of raw.sources){if(!source.present)continue;for(const item of source.files){const path=resolve(item.path);if(path!==item.path||!path.startsWith(source.root+'/')||path.endsWith('/.env'))throw new Error('Source preservation path mismatch');
  const before=await fs.lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.size>16777216n)throw new Error('Source preservation input unsafe');
  const key=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>s[k].toString()).join(':');const handle=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let bytes,closedAtUtc;
  try{if(key(before)!==key(await handle.stat({bigint:true})))throw new Error('Source identity replaced');bytes=await handle.readFile();if(key(before)!==key(await handle.stat({bigint:true}))||key(before)!==key(await fs.lstat(path,{bigint:true})))throw new Error('Source bytes changed');}finally{await handle.close();closedAtUtc=new Date().toISOString();}
  const actual=sha(bytes);preservation.files.push({path,bytes:bytes.length,collectorSha256:item.sha256,afterSha256:actual,match:actual===item.sha256,actualHandleClose:closedAtUtc,identity:Object.fromEntries(['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>[k,before[k].toString()]))});if(actual!==item.sha256)throw new Error('Historical source changed after migration');
 }}preservation.allMatch=true;}catch(e){preservation.error={name:e.name,message:e.message,code:e.code??null};success=false;}
}
await writeNew('02-source-preservation.json',preservation);console.log(JSON.stringify({stage:'once-migration',status:success?'PASS':'REFUSED_OR_UNCERTAIN',exitCode:observed.receipt.exitCode,actualClose:observed.receipt.closedAtUtc,installationId:raw.installationId??null,importedActions:raw.importedActions??null,retainedDevices:raw.retainedDevices??null,historicalFilesVerified:preservation.files.length}));process.exitCode=success?0:3;
