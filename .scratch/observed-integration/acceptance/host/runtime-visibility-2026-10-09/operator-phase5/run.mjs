import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname,join,resolve,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
if(process.cwd()!==repo)throw new Error('Unexpected cwd');
const dir=dirname(fileURLToPath(import.meta.url));
const manifestPaths={host:'.scratch/observed-integration/acceptance/host/accepted-host-freeze.json',source:'.scratch/observed-integration/acceptance/host/post-handoff-source-correspondence.json',compiled:'.scratch/observed-integration/acceptance/host/installed-workflow/integration/fresh-proofs/integrated-installed-node24/preservation.json'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readManifest=async p=>JSON.parse(await fs.readFile(join(repo,p),'utf8'));
const hm=await readManifest(manifestPaths.host),sm=await readManifest(manifestPaths.source),cm=await readManifest(manifestPaths.compiled);
const compiled=Object.fromEntries(cm.files.filter(x=>x.path.startsWith('build-source/dist/') && x.path.endsWith('.js')).map(x=>[x.path.slice('build-source/'.length),x.sha256]));
const groups={acceptedHost15:hm.files,source437:sm.currentProductAndTestFilesMatchingGate,compiled68:compiled};
if(Object.keys(groups.acceptedHost15).length!==15 || Object.keys(groups.source437).length!==437 || Object.keys(groups.compiled68).length!==68)throw new Error('Unexpected frozen manifest counts');
const safePath=p=>{const full=resolve(repo,p);if(!full.startsWith(repo+'/') || /(^|\/)\.env(?:$|\.)/.test(p))throw new Error('Unsafe provenance path');return full;};
const writeNew=(name,data)=>fs.writeFile(join(dir,name),data,{flag:'wx',mode:0o600});
async function capture(){
  const out={capturedAtUtc:new Date().toISOString(),groups:{},manifests:{}};
  for(const [name,p] of Object.entries(manifestPaths))out.manifests[name]={path:p,sha256:hash(await fs.readFile(safePath(p)))};
  for(const [name,expected] of Object.entries(groups)){
    const files=[],mismatches=[];
    for(const [p,want] of Object.entries(expected)){const actual=hash(await fs.readFile(safePath(p)));files.push({path:p,expectedSha256:want,sha256:actual,matches:actual===want});if(actual!==want)mismatches.push(p);}
    out.groups[name]={count:files.length,mismatches,files};
  }
  out.allMatch=Object.values(out.groups).every(x=>x.mismatches.length===0);return out;
}
const originalCapture=capture;
capture=async function(){
 const out=await originalCapture();
 const priorManifest=JSON.parse(await fs.readFile(join(dir,'prior-evidence-reference.json'),'utf8'));
 out.priorEvidence={files:[],allMatch:true};
 for(const ref of priorManifest.files){const actual=hash(await fs.readFile(safePath(ref.path)));const matches=actual===ref.expectedSha256;out.priorEvidence.files.push({...ref,sha256:actual,matches});if(!matches)out.priorEvidence.allMatch=false;}
 out.allMatch=out.allMatch&&out.priorEvidence.allMatch;return out;
};
const before=await capture();await writeNew('source-hashes-before.json',JSON.stringify(before,null,2)+'\n');
if(!before.allMatch){console.log(JSON.stringify({status:'PROVENANCE_BLOCKED',groups:Object.fromEntries(Object.entries(before.groups).map(([k,v])=>[k,{count:v.count,mismatches:v.mismatches}]))}));process.exitCode=4;}else{
  const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C'};
  const argv=[process.execPath,join(dir,'probe.mjs')];const startedAt=new Date().toISOString();
  const child=spawnSync(argv[0],argv.slice(1),{cwd:repo,env,shell:false,encoding:'utf8',timeout:150000,maxBuffer:40*1024*1024});const completedAt=new Date().toISOString();
  const receipt={argv,cwd:repo,startedAt,completedAt,exitCode:child.status,signal:child.signal,stdout:child.stdout??'',stderr:child.stderr??'',environment:'Fixed PATH/LANG/LC_ALL only; no inherited credential or loader options.',...(child.error?{errorCode:child.error.code}:{} )};
  await writeNew('command.json',JSON.stringify(receipt,null,2)+'\n');await writeNew('stdout.txt',receipt.stdout);await writeNew('stderr.txt',receipt.stderr);
  let result;try{result=JSON.parse(receipt.stdout);await writeNew('result.json',JSON.stringify(result,null,2)+'\n');}catch{}
  const after=await capture();await writeNew('source-hashes-after.json',JSON.stringify(after,null,2)+'\n');
  console.log(JSON.stringify({status:result?'BOUNDED_PHASE5_BATCH_RECORDED':'PROBE_OUTPUT_UNAVAILABLE',argv:receipt.argv,cwd:repo,startedAt,completedAt,exitCode:receipt.exitCode,signal:receipt.signal,stderr:receipt.stderr,parserAvailability:result?.parserAvailability,mountResult:result?.mountResult,statResults:result?.statResults?.map(x=>({path:x.path,status:x.status,error:x.error,fields:x.fields,lstatCorrespondence:x.lstatCorrespondence})),xcodeResult:result?.xcodeResult?{status:result.xcodeResult.status,error:result.xcodeResult.error,inputSha256:result.xcodeResult.before?.sha256,stableAcrossConversion:result.xcodeResult.stableAcrossConversion,completeJSONBytes:result.xcodeResult.completeJSONBytes,completeJSONSha256:result.xcodeResult.completeJSONSha256,predicates:result.xcodeResult.predicates}:null,children:result?.children?.map(x=>({kind:x.kind,argv:x.argv,exitCode:x.exitCode,signal:x.signal,stdoutBytes:x.stdoutBytes,stderrBytes:x.stderrBytes,overflow:x.overflow,targetStable:x.targetStable})),sourceBeforeMatches:before.allMatch,sourceAfterMatches:after.allMatch,priorBeforeMatches:before.priorEvidence.allMatch,priorAfterMatches:after.priorEvidence.allMatch,checks:Object.fromEntries(Object.entries(after.groups).map(([k,v])=>[k,{count:v.count,mismatches:v.mismatches}]))},null,2));process.exitCode=receipt.exitCode??2;
}
