import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { userInfo,tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
const repo='/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic';
const dir=join(repo,'.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-cache-readiness-2026-10-11');
if(process.cwd()!==repo||process.execPath!=='/opt/homebrew/Cellar/node/26.8.1/bin/node'||process.version!=='v26.8.1')throw new Error('Unpinned entry context');
for(const key of ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])if(Object.hasOwn(process.env,key))throw new Error('Unscrubbed entry environment');
process.umask(0o077);
export const sha=b=>createHash('sha256').update(b).digest('hex');
export async function writeNew(name,value){const path=resolve(dir,name);if(!path.startsWith(dir+'/'))throw new Error('Outside entry evidence');await fs.writeFile(path,Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
export async function recordCommand(name,argv,{timeoutMs=60000,cap=67108864}={}){
 const home=userInfo().homedir;if(home!=='/Users/hugues_mini')throw new Error('Unexpected production OS account');
 const env={HOME:home,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'C',LC_ALL:'C',DEVELOPER_DIR:'/Applications/Xcode.app/Contents/Developer',TMPDIR:tmpdir()};
 await writeNew(name+'-claimed.json',{claimedAtUtc:new Date().toISOString(),budget:1,argv});
 const receipt={argv,cwd:repo,spawnOptions:{cwd:repo,env,shell:false,stdio:['ignore','pipe','pipe']},startedAtUtc:new Date().toISOString(),timeoutMs,combinedOutputLimit:cap,events:[],killCalls:[],stdoutOriginalBytes:0,stderrOriginalBytes:0};
 const chunks={stdout:[],stderr:[]},hashes={stdout:createHash('sha256'),stderr:createHash('sha256')};let retained=0,overflow=false,stopped=false,timedOut=false,error=null,escalation,timer;
 const child=spawn(argv[0],argv.slice(1),receipt.spawnOptions);receipt.pid=child.pid??null;
 function stop(reason){if(stopped)return;stopped=true;timedOut=reason==='timeout';receipt.events.push({event:'stop-request',reason,atUtc:new Date().toISOString()});function kill(signal){const x={signal,atUtc:new Date().toISOString()};receipt.killCalls.push(x);try{x.returned=child.kill(signal);}catch(e){x.error={name:e.name,message:e.message};}}kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),250);}
 for(const channel of ['stdout','stderr'])child[channel].on('data',bytes=>{hashes[channel].update(bytes);receipt[channel+'OriginalBytes']+=bytes.length;const keep=Buffer.from(bytes.subarray(0,Math.max(0,cap-retained)));chunks[channel].push(keep);retained+=keep.length;if(receipt.stdoutOriginalBytes+receipt.stderrOriginalBytes>cap){overflow=true;stop('output-overflow');}});
 child.on('spawn',()=>receipt.events.push({event:'spawn',atUtc:new Date().toISOString()}));child.on('error',e=>{error={name:e.name,message:e.message,code:e.code??null};receipt.events.push({event:'error',error,atUtc:new Date().toISOString()});});child.on('exit',(code,signal)=>receipt.events.push({event:'exit',code,signal,atUtc:new Date().toISOString()}));
 timer=setTimeout(()=>stop('timeout'),timeoutMs);
 const close=await new Promise(done=>child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(escalation);receipt.closedAtUtc=new Date().toISOString();receipt.events.push({event:'close',code,signal,atUtc:receipt.closedAtUtc});done({code,signal});}));
 Object.assign(receipt,{exitCode:close.code,signal:close.signal,timedOut,overflow,stopped,error,retainedBytes:retained,captureComplete:retained===receipt.stdoutOriginalBytes+receipt.stderrOriginalBytes,descendantQualifier:'Only direct child close is observed; descendants are unobserved.'});
 for(const channel of ['stdout','stderr']){receipt[channel+'OriginalSha256']=hashes[channel].digest('hex');await writeNew(name+'.'+channel+'.bin',Buffer.concat(chunks[channel]));}
 await writeNew(name+'-receipt.json',receipt);
 const ok=close.code===0&&close.signal===null&&!stopped&&!error&&receipt.captureComplete;return {ok,receipt,stdout:Buffer.concat(chunks.stdout),stderr:Buffer.concat(chunks.stderr)};
}
