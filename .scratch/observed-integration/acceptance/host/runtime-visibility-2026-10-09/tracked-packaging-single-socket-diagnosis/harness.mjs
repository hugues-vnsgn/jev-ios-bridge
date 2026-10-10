import { spawn as nativeSpawn } from 'node:child_process';
import { setTimeout as nativeSetTimeout } from 'node:timers';
import { readFileSync,writeFileSync,appendFileSync,mkdirSync } from 'node:fs';
import { join,dirname } from 'node:path';
import assert from 'node:assert/strict';
const evidence=process.env.JEV_PACKAGING_EVIDENCE_DIR;
const root=dirname(evidence);const snapshot=join(evidence,'clean');const commands=join(evidence,'commands.jsonl');let sequence=0;let phase='seed';
const expectedCleanLock=process.env.DIAGNOSTIC_EXPECTED_CLEAN_LOCK;delete process.env.DIAGNOSTIC_EXPECTED_CLEAN_LOCK;
const env={...process.env,PATH:dirname(process.execPath)+':'+process.env.PATH,npm_config_cache:join(evidence,'registry-cache'),npm_config_fetch_retries:'0',npm_config_fetch_timeout:'45000',npm_config_maxsockets:'1'};
const events=join(root,'events.jsonl');const event=v=>appendFileSync(events,JSON.stringify({atUtc:new Date().toISOString(),...v})+'\n');const scopes=[];
const setTimeout=(callback,delay)=>nativeSetTimeout(()=>{event({kind:'original-run-timer-fired',phase,delay});callback();},delay);
function scoped(command,args,label){return new Promise(resolve=>{const child=nativeSpawn(command,args,{env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',error=>event({kind:'scoped-spawn-error',label,error:String(error)}));const scopeTimer=nativeSetTimeout(()=>{event({kind:'scoped-five-second-deadline',label,pid:child.pid});child.kill('SIGKILL');},5000);child.once('close',(code,signal)=>{clearTimeout(scopeTimer);writeFileSync(join(root,label+'.stdout'),stdout);writeFileSync(join(root,label+'.stderr'),stderr);event({kind:'scoped-close',label,pid:child.pid,code,signal});resolve();});});}
function spawn(command,args,options){const current=phase;const child=nativeSpawn(command,args,options);event({kind:'npm-spawn',phase:current,pid:child.pid,command,args,cwd:options.cwd,environment:options.env});let check;
if(current==='plugin')check=nativeSetTimeout(()=>{event({kind:'plugin-thirty-second-snapshot',pid:child.pid});scopes.push(scoped('/bin/ps',['-p',String(child.pid),'-o','pid,ppid,pgid,stat,etime,comm'],'plugin-ps'));scopes.push(scoped('/usr/sbin/lsof',['-nP','-a','-p',String(child.pid),'-iTCP'],'plugin-sockets'));},30000);
const kill=child.kill.bind(child);child.kill=signal=>{event({kind:'npm-kill-invoked',phase:current,pid:child.pid,signal:signal??'SIGTERM'});return kill(signal);};child.once('close',(code,signal)=>{if(check)clearTimeout(check);event({kind:'npm-actual-close',phase:current,pid:child.pid,code,signal});});return child;}
function launch(command, args, options) {
  const previous = process.umask(0o022);
  try { return spawn(command, args, options); } finally { process.umask(previous); }
}
function record(command, args, cwd, result) {
  const id = String(++sequence).padStart(3, '0');
  const stdout = join(evidence, id + '.stdout'); const stderr = join(evidence, id + '.stderr');
  writeFileSync(stdout, result.stdout); writeFileSync(stderr, result.stderr);
  appendFileSync(commands, JSON.stringify({ id, command, args, cwd, node: process.version, exit: result.code,
    signal: result.signal, stdout, stderr }) + '\n');
}
async function run(command, args, cwd = snapshot, extra = {}) {
  const child = launch(command, args, { cwd, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
  const result = await new Promise((done, fail) => {
    child.once('error', fail); child.once('close', (code, signal) => done({ code, signal, stdout, stderr }));
  }); clearTimeout(timer); record(command, args, cwd, result); return result;
}
function ok(result) { assert.equal(result.code, 0, result.stderr + '\n' + result.stdout); assert.equal(result.signal, null); return result.stdout; }

let result={status:'FAIL',scope:'Two-command Node-parent/full-plugin-tree diagnosis only; no full37 acceptance retry'};
try{
 ok(await run('npm',['install','--ignore-scripts','--no-audit','--no-fund',join(evidence,'jev-ios-bridge-1.3.1.tgz')],join(evidence,'clean')));
 const actual=JSON.parse(readFileSync(join(evidence,'clean/package-lock.json'),'utf8'));
 const expected=JSON.parse(readFileSync(expectedCleanLock,'utf8'));
 const vector=x=>Object.fromEntries(Object.entries(x.packages).map(([p,v])=>[p,Object.fromEntries(['resolved','integrity','version'].filter(k=>k in v).map(k=>[k,v[k]]))]));assert.deepEqual(vector(actual),vector(expected));
 writeFileSync(join(root,'seed-lock-match.json'),JSON.stringify({dependencyURLIntegrityVersionVectorsMatch:true}));
 phase='plugin';ok(await run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],join(evidence,'plugin')));result.status='PASS';
}catch(error){result.error=String(error);process.exitCode=1;}finally{await Promise.all(scopes);writeFileSync(join(root,'node-result.json'),JSON.stringify(result,null,2)+'\n');}
