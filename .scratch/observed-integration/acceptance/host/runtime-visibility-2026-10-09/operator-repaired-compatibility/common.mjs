import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, relative, dirname } from 'node:path';
export const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
export const ev='.scratch/observed-integration/acceptance/host/runtime-visibility-2026-10-09/';
export const dir=ev+'operator-repaired-compatibility';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export async function readRepo(path){
 const p=resolve(repo,path);if(!p.startsWith(repo+'/')||p===join(repo,'.env'))throw new Error('Outside metadata evidence/source scope');
 let current=repo;const parts=relative(repo,p).split('/');
 for(let i=0;i<parts.length;i++){current=join(current,parts[i]);const s=await fs.lstat(current);if(s.isSymbolicLink()||(i<parts.length-1&&!s.isDirectory()))throw new Error('Unexpected repository alias: '+path);}
 const before=await fs.lstat(p);if(!before.isFile()||before.nlink!==1)throw new Error('Not a single-link repository file: '+path);
 const handle=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);
 const stamp=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.size,s.mtimeMs,s.ctimeMs,s.nlink].join(':');
 try{if(stamp(before)!==stamp(await handle.stat()))throw new Error('Replaced repo input');const bytes=await handle.readFile();if(stamp(before)!==stamp(await handle.stat())||stamp(before)!==stamp(await fs.lstat(p)))throw new Error('Changed repo input');return bytes;}finally{await handle.close();}
}
export async function writeNew(name,value){
 const p=join(repo,dir,name);if(!p.startsWith(join(repo,dir)+'/'))throw new Error('Outside new evidence directory');
 const data=Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
 await fs.writeFile(p,data,{flag:'wx',mode:0o600});
}
export async function references(){
 const distributionPath=ev+'root-repaired-distribution-binding.json';
 const candidatePath=ev+'cryptex-implementation-review/candidate-cli-context.json';
 const distributionBytes=await readRepo(distributionPath),candidateBytes=await readRepo(candidatePath);
 if(sha(distributionBytes)!=='1f7fbe6719d11f6d35d8a2e4990c568a60522ccb3cb5cb7fdbf06fead14fa6f9'||sha(candidateBytes)!=='0cc9d919d408805272d4e57b1efc62d41a46559ee9bc921f8e2b5325dd3ffa75')throw new Error('Pinned binding hash mismatch');
 const binding=JSON.parse(distributionBytes),candidate=JSON.parse(candidateBytes);
 if(binding.integrationHead!=='3edf247ab44d3332bc4bab5f3a43104536d84ce9'||binding.candidate!=='720cb380d07102d72b20a6a4f5f7787a0ab88f2b'||candidate.candidate!==binding.candidate)throw new Error('Product binding mismatch');
 if(Object.keys(binding.source441).length!==441||Object.keys(binding.compiled69).length!==69)throw new Error('Binding vector length mismatch');
 for(const [p,h] of Object.entries(candidate.source441))if(binding.source441[p]!==h)throw new Error('Candidate Source correspondence mismatch');
 for(const [p,h] of Object.entries(candidate.compiled69))if(binding.compiled69[p]!==h)throw new Error('Candidate dist correspondence mismatch');
 const freezePath='.scratch/observed-integration/acceptance/host/accepted-host-freeze.json',freeze=JSON.parse(await readRepo(freezePath));
 if(Object.keys(freeze.files).length!==15)throw new Error('Original host vector count mismatch');
 const refs=new Map();
 function add(path,h){const p=relative(repo,resolve(repo,path));if(refs.has(p)&&refs.get(p)!==h)throw new Error('Conflicting reference: '+p);refs.set(p,h);}
 add(distributionPath,sha(distributionBytes));add(candidatePath,sha(candidateBytes));
 add(freezePath,sha(await readRepo(freezePath)));
 for(let n=1;n<=5;n++){
  const path=ev+'operator-phase'+n+'/artifact-hashes.json',bytes=await readRepo(path),manifest=JSON.parse(bytes);
  add(path,sha(bytes));for(const f of manifest.files)add(dirname(path)+'/'+f.path,f.sha256);
 }
 const old=JSON.parse(await readRepo(ev+'operator-phase5/prior-evidence-reference.json'));for(const f of old.files)add(f.path,f.expectedSha256);
 for(const path of ['.scratch/observed-action-rollout/installed-compatibility-recheck.md',ev+'repaired-host-report.md',ev+'operator-repaired-compatibility-binding.json',ev+'cryptex-policy-proposal.md',ev+'owner-cryptex-trust-decision.json',ev+'owner-trust-decision.json',ev+'root-phase5-retained-mount-derivation.json',...Array.from({length:5},(_,i)=>ev+'root-phase'+(i+1)+'-audit.json'),ev+'cryptex-implementation-review/spec/720cb380/report.md',ev+'cryptex-implementation-review/standards/720cb380/report.md'])add(path,sha(await readRepo(path)));
 const decision=JSON.parse(await readRepo(ev+'owner-cryptex-trust-decision.json'));if(refs.get(decision.proposalPath)!==decision.proposalSha256)throw new Error('Owner frozen policy hash mismatch');
 const operator=JSON.parse(await readRepo(ev+'operator-repaired-compatibility-binding.json'));if(operator.fullIntegratedHead!=='e971d3312b595a5d841b1d70288302c40f7a5b70'||operator.hostDistributionBindingSha256!==sha(distributionBytes))throw new Error('Full integration binding mismatch');
 for(const record of Object.values(binding.records)){
  if(record.receipt)add(record.receipt,record.sha256);
  if(record.summary)add(record.summary,record.sha256);
  if(record.startupSummary)add(record.startupSummary,record.startupSha256);
 }
 for(const name of ['probe.mjs','run.mjs','common.mjs','context.json'])add(dir+'/'+name,sha(await readRepo(dir+'/'+name)));
 return {source441:binding.source441,compiled69:binding.compiled69,originalHost15:freeze.files,priorEvidence:Object.fromEntries(refs),scope:'Explicit frozen manifests and consumed binding/approval/gate receipts only; fake host runtime fixture traces, caches and symlinks excluded and never traversed.'};
}
export async function snapshot(refs){
 const capturedAtUtc=new Date().toISOString(),groups={},mismatches=[];
 for(const [group,values] of Object.entries(refs)){
  if(group==='scope')continue;
  const records=[];
  for(const [path,expectedSha256] of Object.entries(values)){
   try{const bytes=await readRepo(path),actualSha256=sha(bytes);records.push({path,bytes:bytes.length,expectedSha256,actualSha256,match:actualSha256===expectedSha256});if(actualSha256!==expectedSha256)mismatches.push({group,path,expectedSha256,actualSha256});}
   catch(e){records.push({path,expectedSha256,match:false,error:{name:e.name,message:e.message,code:e.code??null}});mismatches.push({group,path,error:e.message});}
  }
  groups[group]={count:records.length,allMatch:records.every(x=>x.match),files:records};
 }
 return {capturedAtUtc,groups,allMatch:mismatches.length===0,mismatches};
}
