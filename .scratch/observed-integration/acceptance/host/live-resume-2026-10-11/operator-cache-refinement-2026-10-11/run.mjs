import * as fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {recordCommand,writeNew} from './commands.mjs';
const accepted='.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/cache-activity-draft/artifact-hashes.json';
if(process.argv.length!==3||process.argv[2]!=='--read-only-once-after-root-review'||process.getuid()!==501||process.getgid()!==20)throw new Error('Unexpected attribution command/account');
const bytes=await fs.readFile(accepted);
if(createHash('sha256').update(bytes).digest('hex')!=='f11f073444b452848c609a27f261db431d0e5b13bc884b18a82a06e9b5499d65')throw new Error('Activity seal changed');
const otherRoots=['/Users/hugues_mini/Library/Caches/JetBrains','/Users/hugues_mini/Library/Caches/org.swift.swiftpm','/Users/hugues_mini/.npm/_cacache','/Users/hugues_mini/.cache/uv','/Users/hugues_mini/.cache/bazel-repo-contents-cache','/Users/hugues_mini/.cache/bazel-repo-cache','/Users/hugues_mini/.cache/huggingface'];
const commands=[{name:'gradle-depth2',argv:['/usr/bin/du','-k','-d','2','-P','/Users/hugues_mini/.gradle/caches'],timeoutMs:180000,cap:262144},{name:'other-seven',argv:['/usr/bin/du','-sk','-P',...otherRoots],timeoutMs:180000,cap:65536}];
await writeNew('attribution-claimed.json',{claimedAtUtc:new Date().toISOString(),commands,commandBudget:2,wholeGradleCachesAndWrapperExcludedFromArchiveRemoval:true,noMatchDoesNotAuthorizeRemoval:true,sourceMutations:0});
const observations=[];let result;
try{for(const spec of commands){const o=await recordCommand(spec.name,spec.argv,{timeoutMs:spec.timeoutMs,cap:spec.cap});observations.push({name:spec.name,receipt:spec.name+'-receipt.json',ok:o.ok,exitCode:o.receipt.exitCode,closedAtUtc:o.receipt.closedAtUtc});if(!o.ok)throw new Error('Attribution command refusal/uncertainty: '+spec.name);}result={status:'READ_ONLY_ATTRIBUTION_COMPLETE',observations};}
catch(error){result={status:'READ_ONLY_ATTRIBUTION_REFUSAL',error:{name:error.name,message:error.message,code:error.code??null},observations};}
Object.assign(result,{completedAtUtc:new Date().toISOString(),qualification:'du -P allocated KiB totals are point-in-time metadata attribution, not unique/reclaimable byte guarantees or inactivity proof. Gradle whole roots remain excluded; no-match does not authorize relocation.',sourceMutations:0,dataCopies:0,deletions:0,processStops:0,builds:0,operatorState:'IDLE_FOR_ROOT_AUDIT'});
await writeNew('attribution-result.json',result);
await new Promise(done=>process.stdout.write(JSON.stringify(result)+'\n',done));
process.exitCode=result.status==='READ_ONLY_ATTRIBUTION_COMPLETE'?0:3;
