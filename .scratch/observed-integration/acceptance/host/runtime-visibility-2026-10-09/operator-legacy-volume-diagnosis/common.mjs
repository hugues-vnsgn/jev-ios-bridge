import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
export const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
export const ev='.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/';
export const dir=ev+'operator-legacy-volume-diagnosis';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export async function readRepo(path){
 const p=resolve(repo,path);if(!p.startsWith(repo+'/')||p===join(repo,'.env'))throw new Error('Outside repository evidence/Source scope');
 let current=repo;const parts=relative(repo,p).split('/');
 for(let i=0;i<parts.length;i++){current=join(current,parts[i]);const s=await fs.lstat(current);if(s.isSymbolicLink()||(i<parts.length-1&&!s.isDirectory()))throw new Error('Unexpected repository alias: '+path);}
 const before=await fs.lstat(p);if(!before.isFile()||before.nlink!==1)throw new Error('Not a single-link repository file: '+path);
 const handle=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 const stamp=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.size,s.mtimeMs,s.ctimeMs,s.nlink].join(':');
 try{if(stamp(before)!==stamp(await handle.stat()))throw new Error('Replaced repo input');const bytes=await handle.readFile();if(stamp(before)!==stamp(await handle.stat())||stamp(before)!==stamp(await fs.lstat(p)))throw new Error('Changed repo input');return bytes;}finally{await handle.close();}
}
export async function writeNew(name,value){
 const p=resolve(repo,dir,name);if(!p.startsWith(join(repo,dir)+'/'))throw new Error('Outside new private evidence');
 await fs.writeFile(p,Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
export async function references(){
 const candidatePath=ev+'cryptex-implementation-review/candidate-cli-context.json',candidateBytes=await readRepo(candidatePath);
 if(sha(candidateBytes)!=='0cc9d919d408805272d4e57b1efc62d41a46559ee9bc921f8e2b5325dd3ffa75')throw new Error('Candidate pin mismatch');
 const candidate=JSON.parse(candidateBytes),freezePath='.scratch/observed-integration/acceptance/host/accepted-host-freeze.json',freeze=JSON.parse(await readRepo(freezePath));
 if(candidate.candidate!=='720cb380d07102d72b20a6a4f5f7787a0ab88f2b'||Object.keys(candidate.source441).length!==441||Object.keys(candidate.compiled69).length!==69||Object.keys(freeze.files).length!==15)throw new Error('Source/dist/host vector mismatch');
 const compatibility=ev+'operator-repaired-compatibility/';
 const auditPath=ev+'root-repaired-compatibility-audit.json',auditBytes=await readRepo(auditPath);
 if(sha(auditBytes)!=='f8d36b0dca6c59023ed255d3905460308b452c3cec453745f73fb9a27350bcbd')throw new Error('Consumed Root audit changed');
 const audit=JSON.parse(auditBytes),priorCompatibility={};
 if(Object.keys(audit.files).length!==693||audit.lookupCalls!==1||audit.guardFailures!==0||audit.CryptexReached!==false||!audit.checks.every(c=>c.pass))throw new Error('Prior accepted scope mismatch');
 for(const [name,v]of Object.entries(audit.files))priorCompatibility[compatibility+name]=v.sha256;
 const priorRecords={};
 const paths=[candidatePath,freezePath,auditPath,ev+'operator-repaired-compatibility-binding.json',ev+'operator-repaired-compatibility-submit.json',ev+'operator-repaired-compatibility-submit.stderr.txt',ev+'operator-repaired-compatibility-submit.stdout.json',ev+'operator-legacy-volume-binding.json',ev+'operator-legacy-volume-submit.json',ev+'operator-legacy-volume-submit.stderr.txt',ev+'operator-legacy-volume-submit.stdout.json','.scratch/observed-action-rollout/repaired-compatibility-dispatch.txt','.scratch/observed-action-rollout/legacy-volume-diagnosis-dispatch.txt','.scratch/observed-action-rollout/legacy-volume-diagnosis.md','.scratch/observed-action-rollout/installed-compatibility-recheck.md'];
 for(const path of paths)priorRecords[path]=sha(await readRepo(path));
 const submit=JSON.parse(await readRepo(ev+'operator-repaired-compatibility-submit.json'));if(priorRecords[relative(repo,submit.message)]!==submit.messageSha256||priorRecords[ev+'operator-repaired-compatibility-submit.stdout.json']!==submit.stdoutSha256||priorRecords[ev+'operator-repaired-compatibility-submit.stderr.txt']!==submit.stderrSha256)throw new Error('Original dispatch submit binding mismatch');
 const legacySubmit=JSON.parse(await readRepo(ev+'operator-legacy-volume-submit.json'));
 if(priorRecords['.scratch/observed-action-rollout/legacy-volume-diagnosis-dispatch.txt']!==legacySubmit.promptSha256)throw new Error('Legacy dispatch submit hash mismatch');
 const binding=JSON.parse(await readRepo(ev+'operator-legacy-volume-binding.json'));
 if(binding.fullHead!=='91084c0c065373a978c8437f8f8362c4f5e4dbc9'||binding.productSource!=='3edf247ab44d3332bc4bab5f3a43104536d84ce9'||binding.actualCwdRequired!==repo||binding.soleOperatorModel!=='GPT-6.1-Sol xhigh')throw new Error('Legacy operator binding mismatch');
 const priorExplicit=JSON.parse(await readRepo(compatibility+'prior-evidence-reference.json')).priorEvidence;
 const newScripts={};for(const name of ['common.mjs','probe.mjs','run.mjs','context.json'])newScripts[dir+'/'+name]=sha(await readRepo(dir+'/'+name));
 const trace=JSON.parse(await readRepo(compatibility+'filesystem-trace.json')),listing=trace.find(t=>t.sequence===8988);
 if(!listing||listing.method!=='readdir'||listing.path!=='/Library/Developer/CoreSimulator/Volumes'||!listing.ok||JSON.stringify(listing.entries)!==JSON.stringify(['iOS_22G86','iOS_23E254a']))throw new Error('Exact genuine two-root binding mismatch');
 return {source441:candidate.source441,compiled69:candidate.compiled69,originalHost15:freeze.files,priorCompatibility693:priorCompatibility,rootRecords:priorRecords,priorExplicit121:priorExplicit,newScripts,scope:'Only explicit manifests and Root audit/dispatch/binding/submit files; no caches/fake-host traces/symlinks traversed.'};
}
export async function snapshot(refs){
 const groups={},mismatches=[];
 for(const [group,map] of Object.entries(refs)){if(group==='scope')continue;const files=[];
 for(const [path,expectedSha256]of Object.entries(map)){
  try{const bytes=await readRepo(path),actualSha256=sha(bytes),match=actualSha256===expectedSha256;files.push({path,bytes:bytes.length,expectedSha256,actualSha256,match});if(!match)mismatches.push({group,path,expectedSha256,actualSha256});}
  catch(e){files.push({path,expectedSha256,match:false,error:{name:e.name,message:e.message,code:e.code??null}});mismatches.push({group,path,error:e.message});}
 }
 groups[group]={count:files.length,allMatch:files.every(f=>f.match),files};
 }
 return {capturedAtUtc:new Date().toISOString(),allMatch:mismatches.length===0,mismatches,groups};
}
