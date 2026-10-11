import * as fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {recordCommand,writeNew} from './commands.mjs';
if(process.argv.length!==3||process.argv[2]!=='--read-only-once-after-root-review'||process.getuid()!==501||process.getgid()!==20)throw new Error('Unexpected readiness command/account');
const bound=await fs.readFile('.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-cache-refinement-2026-10-11/artifact-hashes.json');
if(createHash('sha256').update(bound).digest('hex')!=='83ae86a93b9e9a43266f9a600829349a06dcfc604e29addb635ad153a2849d2e')throw new Error('Refinement seal changed');
const roots=['/Users/hugues_mini/.gradle/caches/8.13','/Users/hugues_mini/.gradle/caches/9.7.1','/Users/hugues_mini/Library/Caches/JetBrains'];
const otherRoots=['/Users/hugues_mini/.konan','/Users/hugues_mini/.m2','/Users/hugues_mini/.bun/install/cache','/Users/hugues_mini/Library/Developer/Xcode/Archives'];
const at=()=>new Date().toISOString(),errorOf=e=>({name:e.name,message:e.message,code:e.code??null}),metadata=[];
await writeNew('readiness-claimed.json',{claimedAtUtc:at(),roots,otherRoots,psBudget:0,retainedPsSnapshotReused:true,lsofBudget:3,duBudget:1,lsofPsTimeoutMs:30000,lsofPsCombinedCap:2097152,duTimeoutMs:180000,duCombinedCap:65536,sourceMutations:0,archiveAuthorized:false});
async function facts(path){const event={path,startedAtUtc:at()};metadata.push(event);let timer;try{const s=await Promise.race([fs.lstat(path,{bigint:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Read-only lstat deadline exceeded')),3000);})]);event.settledAtUtc=at();if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Nondirectory/symlink readiness root');const x=Object.fromEntries(['dev','ino','uid','gid','mode','size','nlink'].map(k=>[k,String(s[k])]).concat([['mtime_ns',String(s.mtimeNs)],['ctime_ns',String(s.ctimeNs)],['directory',true],['symlink',false],['permissions',(s.mode&0o7777n).toString(8)]]));event.facts=x;return x;}catch(e){event.error=errorOf(e);event.failedAtUtc=at();throw e;}finally{clearTimeout(timer);}}
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
const observations=[];let result,processNames,duObservation;
try{
 const retained='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-cache-readiness-2026-10-11';
 const psStdout=await fs.readFile(retained+'/process-names.stdout.bin'),psReceiptBytes=await fs.readFile(retained+'/process-names-receipt.json'),psReceipt=JSON.parse(psReceiptBytes);
 if(createHash('sha256').update(psStdout).digest('hex')!=='1234aa8d701f81c80cb909c775415a86ca4f4cd610477ff7929b781edc5c3461'||createHash('sha256').update(psReceiptBytes).digest('hex')!=='3c79e7185b401fb39e10059d95dd016cc69cb81d87225112385ad3142805c20c')throw new Error('Retained successful ps evidence changed');
 if(psReceipt.exitCode!==0||psReceipt.signal!==null||psReceipt.error||psReceipt.stopped||!psReceipt.captureComplete||psReceipt.stderrOriginalBytes!==0||!psReceipt.closedAtUtc)throw new Error('Retained ps receipt was not successful');
 await writeNew('retained-process-names.stdout.bin',psStdout);await writeNew('retained-process-names-receipt.json',psReceiptBytes);
 const ps={stdout:psStdout};
 const entries=ps.stdout.toString('utf8').split('\n').filter(Boolean).map(line=>{const m=/^\s*([1-9]\d*)\s+([+-]?\d+)\s+(.+)$/.exec(line);if(!m)throw new Error('Unparsed executable-name record');return {pid:m[1],uid:m[2],executableName:m[3].trim()};});
 const names=[...new Set(entries.map(x=>x.executableName))].sort(),possibleIdeNames=names.filter(name=>/idea|intellij|pycharm|webstorm|clion|goland|rubymine|rider|datagrip|dataspell|phpstorm|rustrover|jetbrains|android.?studio|studio|fleet/i.test(name));
 processNames={status:'REUSED_SUCCESSFUL_EXECUTABLE_NAMES_ONLY',receipt:'retained-process-names-receipt.json',sourceSnapshotClosedAtUtc:psReceipt.closedAtUtc,processRecords:entries.length,possibleJetBrainsIdeExecutableNames:possibleIdeNames,genericJavaExecutableObserved:names.includes('java'),qualification:'Name-only process visibility is a point-in-time snapshot. Possible IDE names are conservative hints, not a complete absence proof; raw pid/uid/ucomm bytes remain for Root inspection. No full arguments requested.'};
 await writeNew('process-names-result.json',processNames);
 for(let i=0;i<roots.length;i++){
  const path=roots[i],name='readiness-'+String(i+1).padStart(2,'0'),item={path,startedAtUtc:at()};
  item.before=await facts(path);const o=await recordCommand(name,['/usr/sbin/lsof','-nP','-F0pcfn','+D',path],{timeoutMs:30000,cap:2097152});item.receipt=name+'-receipt.json';Object.assign(item,classify(o));item.after=await facts(path);if(JSON.stringify(item.before)!==JSON.stringify(item.after)){item.classification='PROBE_INCOMPLETE';item.metadataChanged=true;}
  item.completedAtUtc=at();observations.push(item);await writeNew(name+'-result.json',item);process.stdout.write(JSON.stringify({path,classification:item.classification})+'\n');
  if(item.classification==='PROBE_INCOMPLETE')throw new Error('Readiness snapshot incomplete: '+path);
 }
 const du=await recordCommand('other-four',['/usr/bin/du','-sk','-P',...otherRoots],{timeoutMs:180000,cap:65536});
 const receipt=du.receipt,lines=du.stderr.toString('utf8').split('\n').filter(Boolean);
 const missing=otherRoots.filter(path=>lines.includes('du: '+path+': No such file or directory'));
 const complete=receipt.signal===null&&!receipt.stopped&&!receipt.error&&receipt.captureComplete&&[0,1].includes(receipt.exitCode);
 const expectedMissing=receipt.exitCode===1&&missing.length>0&&lines.length===missing.length;
 duObservation={receipt:'other-four-receipt.json',exitCode:receipt.exitCode,missingPaths:missing,status:du.ok&&lines.length===0?'DU_COMPLETE':complete&&expectedMissing?'DU_COMPLETE_WITH_MISSING_PATHS':'PROBE_INCOMPLETE',noFallback:true};
 await writeNew('other-four-result.json',duObservation);if(duObservation.status==='PROBE_INCOMPLETE')throw new Error('Other-root inventory refused/uncertain');
 result={status:'READ_ONLY_READINESS_SNAPSHOTS_COMPLETE',observations,processNames,duObservation};
}catch(e){result={status:'READ_ONLY_READINESS_STOPPED',error:errorOf(e),observations,processNames:processNames??null,duObservation:duObservation??null};}
Object.assign(result,{completedAtUtc:at(),metadata,JetBrainsArchiveDecision:'PENDING_ROOT_REVIEW_NO_EXECUTION',psNativeQueries:0,retainedPsSnapshotReused:true,qualification:'No-match is a momentary observation and does not prove inactivity/future quiescence or authorize archive/removal. Source is retained; no archive script ran. lstat alone does not eliminate ancestor/pathname races. Read-only metadata deadline cannot cancel underlying lstat; no filesystem mutation was started.',sourceMutations:0,archiveCalls:0,dataCopies:0,deletions:0,processStops:0,builds:0,operatorState:'IDLE_FOR_ROOT_AUDIT'});
await writeNew('readiness-result.json',result);await new Promise(done=>process.stdout.write(JSON.stringify({status:result.status,observations:observations.length,possibleJetBrainsIdeExecutableNames:processNames?.possibleJetBrainsIdeExecutableNames??null,duObservation:duObservation??null})+'\n',done));process.exitCode=result.status==='READ_ONLY_READINESS_SNAPSHOTS_COMPLETE'?0:3;
