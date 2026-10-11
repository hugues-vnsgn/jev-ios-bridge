import * as fs from 'node:fs/promises';
import {dirname} from 'node:path';
import {recordCommand,writeNew} from './commands.mjs';

if(process.argv.length!==3||process.argv[2]!=='--read-only-once-after-root-review')throw new Error('Explicit reviewed once flag required');
const home='/Users/hugues_mini';
const candidates=['.gradle/caches','.gradle/wrapper/dists','Library/Caches/JetBrains','Library/Caches/org.swift.swiftpm','.npm/_cacache','.cache/uv','.cache/bazel-repo-contents-cache','.cache/bazel-repo-cache','.cache/huggingface'].map(p=>home+'/'+p);
const at=()=>new Date().toISOString(),errorOf=e=>({name:e.name,message:e.message,code:e.code??null});
await writeNew('probe-claimed.json',{at:at(),candidates,psBudget:1,lsofBudget:9,mutationsAuthorized:false});
const observations=[];
async function readBounded(fn){let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Read-only metadata deadline exceeded')),3000);})]);}finally{clearTimeout(timer);}}
async function chain(path){const paths=[];for(let p=path;;p=dirname(p)){paths.unshift(p);if(p==='/')break;}
 const result={};for(const p of paths){const s=await readBounded(()=>fs.lstat(p,{bigint:true}));if(s.isSymbolicLink()||!s.isDirectory())throw new Error('Nondirectory/symlink component: '+p);
 result[p]=Object.fromEntries(['dev','ino','uid','gid','mode','size','mtimeNs','ctimeNs'].map(k=>[k,String(s[k])]));}return result;}
function matches(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function parseRecords(bytes){if(!bytes.length)return {valid:true,processes:0,files:0};
 const text=bytes.toString('utf8');if(text.includes('\ufffd')||!text.endsWith('\0\n'))return {valid:false,processes:0,files:0};
 let processes=0,files=0,haveProcess=false,haveFile=false;
 for(let field of text.split('\0')){if(field.startsWith('\n'))field=field.slice(1);if(!field)continue;const tag=field[0],value=field.slice(1);
  if(tag==='p'&&/^\d+$/.test(value)){processes++;haveProcess=true;haveFile=false;}
  else if(tag==='c'&&haveProcess&&value.length){}
  else if(tag==='f'&&haveProcess&&value.length){files++;haveFile=true;}
  else if(tag==='n'&&haveFile&&value.length){}
  else return {valid:false,processes,files};
 }return {valid:processes>0&&files>0,processes,files};}
function classify(o){const r=o.receipt,parsed=parseRecords(o.stdout);const incomplete=r.error||r.stopped||r.signal!==null||!r.captureComplete||o.stderr.length>0||![0,1].includes(r.exitCode)||!parsed.valid;
 return {classification:incomplete?'PROBE_INCOMPLETE':parsed.files?'OPEN_FILES_OBSERVED':r.exitCode===1?'NO_MATCH_OBSERVED':'PROBE_INCOMPLETE',records:parsed};}
let result;
try{
 const ps=await recordCommand('process-names',['/bin/ps','-ax','-o','pid=,uid=,ucomm='],{timeoutMs:30000,cap:2097152});
 const psComplete=ps.ok&&ps.stderr.length===0;
 await writeNew('process-names-result.json',{status:psComplete?'PROCESS_NAME_SNAPSHOT':'PROBE_INCOMPLETE',receipt:'process-names-receipt.json',fullArgumentsRequested:false});
 const npm={path:home+'/.npm',entries:[],limit:256};let handle;
 try{npm.before=await chain(npm.path);handle=await fs.opendir(npm.path);for(let i=0;i<=npm.limit;i++){const e=await readBounded(()=>handle.read());if(!e)break;if(i===npm.limit)throw new Error('Immediate npm entry cap exceeded');npm.entries.push({name:e.name,type:e.isSymbolicLink()?'symlink':e.isDirectory()?'directory':e.isFile()?'file':'other'});}npm.after=await chain(npm.path);if(!matches(npm.before,npm.after))throw new Error('npm component metadata changed');npm.status='IMMEDIATE_NAMES_ONLY';}catch(e){npm.status='PROBE_INCOMPLETE';npm.error=errorOf(e);}finally{if(handle){await handle.close();npm.closedAt=at();}}
 await writeNew('npm-immediate-entries.json',npm);
 for(let i=0;i<candidates.length;i++){
  const item={path:candidates[i],startedAt:at(),lsofCalls:0};
  try{item.before=await chain(item.path);item.lsofCalls=1;const name='candidate-'+String(i+1).padStart(2,'0');const o=await recordCommand(name,['/usr/sbin/lsof','-nP','-F0pcfn','+D',item.path],{timeoutMs:30000,cap:2097152});item.receipt=name+'-receipt.json';Object.assign(item,classify(o));item.after=await chain(item.path);if(!matches(item.before,item.after)){item.classification='PROBE_INCOMPLETE';item.metadataChanged=true;}}
  catch(e){item.classification='PROBE_INCOMPLETE';item.error=errorOf(e);}
  item.completedAt=at();observations.push(item);await writeNew('candidate-'+String(i+1).padStart(2,'0')+'-result.json',item);process.stdout.write(JSON.stringify({path:item.path,classification:item.classification})+'\n');
 }
 result={status:'READ_ONLY_SNAPSHOTS_COMPLETE',processNamesComplete:psComplete,npmStatus:npm.status,observations};
}catch(e){result={status:'PROBE_STOPPED',error:errorOf(e),observations};}
Object.assign(result,{completedAt:at(),qualification:'No-match is only a momentary observation under this process visibility. It does not prove inactivity, future quiescence, complete system process visibility, or authorize relocation. Ancestor checks do not eliminate pathname races. No cache contents were read by this script; lsof walks metadata.',sourceMutations:0,processSignalsByIntent:0,timeoutQualifier:'The command recorder may signal only its own probe child on deadline or output overflow; only direct child close is observed.',operatorState:'IDLE_FOR_ROOT_AUDIT'});
await writeNew('probe-result.json',result);
process.stdout.write(JSON.stringify({status:result.status,observations:observations.length})+'\n');
process.exitCode=result.status==='READ_ONLY_SNAPSHOTS_COMPLETE'?0:3;
