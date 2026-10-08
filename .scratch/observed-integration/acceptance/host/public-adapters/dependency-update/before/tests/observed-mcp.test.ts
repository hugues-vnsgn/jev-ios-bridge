import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setupPublicFixture, fixtureObserved, fixtureCalls, actionRequest } from './fixtures/observed-cli-server.js';
const retainedTools = ['cancel_observed_action', 'cancel_observed_allocation', 'get_observed_action', 'get_observed_allocation', 'retire_observed_allocation'];
async function session(t: TestContext, mode = 'observed', enabled = '1', actual = false) {
  const root = await mkdtemp(join(tmpdir(), 'jev-public-mcp-')); const fixture = await setupPublicFixture(root);
  const env = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: enabled, OBSERVED_FIXTURE_MODE: mode }; delete (env as NodeJS.ProcessEnv).TYPESAFE_API_KEY;
  const child = spawn(process.execPath, ['--import', 'tsx', actual ? 'src/cli.ts' : 'tests/fixtures/observed-mcp-server.ts', actual ? 'mcp' : root], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<number, {done:(value:any)=>void;fail:(error:Error)=>void}>(); let next = 1; let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const reply = JSON.parse(line); pending.get(reply.id)?.done(reply); pending.delete(reply.id); });
  child.on('exit', () => { for (const waiter of pending.values()) waiter.fail(new Error('Fixture exited: ' + stderr)); pending.clear(); });
  const request = (method: string, params: object = {}) => {
    const id = next++; const result = new Promise<any>((done, fail) => { pending.set(id, {done,fail}); child.stdin.write(JSON.stringify({ jsonrpc:'2.0',id,method,params }) + '\n'); });
    return {id,result};
  };
  t.after(async () => {
    child.stdin.end(); const stopped = child.exitCode === null ? new Promise<void>(done => child.once('exit', () => done())) : Promise.resolve();
    const timer = setTimeout(() => child.kill('SIGTERM'), 6500); await stopped; clearTimeout(timer); lines.close();
    await fixture.cleanup(); await rm(root,{recursive:true,force:true});
  });
  assert.equal((await request('initialize', {protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'observed',version:'1'}}).result).result.serverInfo.name,'jev-ios-bridge');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}) + '\n');
  return {root,...fixture, publicRoot:root, child, rpc:request, allocationRequest:fixture.request,
    async tools() { const response=await request('tools/list').result; assert.ok(response.result,JSON.stringify(response));return response.result.tools as any[]; },
    async call(name:string,args:object) { const response=await request('tools/call',{name,arguments:args}).result; assert.ok(response.result,JSON.stringify(response));return response.result; } };
}
function snapshot(reply:any) {
  assert.equal(reply.content.length,2); assert.equal(reply.content[0].type,'text'); assert.equal(reply.content[1].type,'text');
  assert.equal(reply.structuredContent,undefined); return JSON.parse(reply.content[1].text);
}
for (const enabled of ['0','true','1']) test(`actual key-free CLI MCP startup publishes exact observed gate ${enabled}`,{timeout:10000},async t=>{
  const s=await session(t,'observed',enabled,true); const tools=await s.tools();
  const observed=tools.map(value=>value.name).filter(name=>name.includes('observed')).sort();
  assert.deepEqual(observed, [...retainedTools,...(enabled==='1'?['prepare_observed_allocation','start_observed_action']:[])].sort());
  for(const name of ['get_observed_action','get_observed_allocation']) assert.equal(tools.find(value=>value.name===name).annotations.readOnlyHint,true);
  assert.deepEqual(fixtureCalls(s.publicRoot),[]);
});
test('strict MCP input errors use two safe text blocks and do not open authority',{timeout:10000},async t=>{
  const s=await session(t); const cases:[string,object,string,string][]=[
    ['start_observed_action',{},'UNSUPPORTED_VERSION','action'],
    ['start_observed_action',{...actionRequest('ABCDEF00-0000-4000-8000-000000000099'),deviceId:'secret-vendor'},'INVALID_REQUEST','action'],
    ['prepare_observed_allocation',{version:2},'UNSUPPORTED_VERSION','preparation'],
    ['prepare_observed_allocation',{version:1,admissionRoot:'/secret'},'INVALID_REQUEST','preparation'],
    ['get_observed_action',{actionId:'one',waitMs:45001},'INVALID_REQUEST','action'],
    ['get_observed_allocation',{allocationId:'bad'},'INVALID_REQUEST','preparation'],
    ['cancel_observed_action',{actionId:'one',unknown:'secret'},'INVALID_REQUEST','action'],
    ['retire_observed_allocation',{allocationId:'ABCDEF00-0000-4000-8000-000000000099',unknown:'secret'},'INVALID_REQUEST','preparation'],
    ['start_observed_action',{...actionRequest('ABCDEF00-0000-4000-8000-000000000099'),junk:'secret'.repeat(12000)},'INVALID_REQUEST','action'],
  ];
  for(const [tool,input,code,kind] of cases){const reply=await s.call(tool,input);const value=snapshot(reply);assert.equal(reply.isError,true);assert.equal(value.kind,'observed-operation-error');assert.equal(value.code,code);assert.equal(value.acceptanceKind,kind);assert.ok(!JSON.stringify(reply).includes('secret'));}
  assert.deepEqual(fixtureCalls(s.publicRoot),[]);
});
for(const [mode,outcome,touches] of [['observed','outcome_observed',1],['already','already_satisfied',0],['refused','refused',0],['inconclusive','inconclusive',1],['unresolved',null,1]] as const){
  test(`MCP shared authority renders ${mode}, preserves evidence and exact-once retrieval`,{timeout:20000},async t=>{
    const s=await session(t,mode);const preparedReply=await s.call('prepare_observed_allocation',s.allocationRequest('one'));
    const allocation=snapshot(preparedReply);assert.equal(preparedReply.isError,undefined);assert.equal(allocation.outcome,'prepared');
    const calls=fixtureCalls(s.publicRoot).filter(value=>value!=='open');
    const request=actionRequest(allocation.allocationId);
    const started=snapshot(await s.call('start_observed_action',request));assert.equal(started.disposition,'started');
    const terminalReply=await s.call('get_observed_action',{actionId:'one',waitMs:5000}); const terminal=snapshot(terminalReply);
    assert.equal(terminalReply.isError,undefined);assert.equal(terminal.outcome,outcome);assert.equal(terminal.authority,mode==='unresolved'?'unconfirmed':'committed');
    assert.ok(terminalReply.content[0].text.includes(terminal.evidence.directory));
    const actionCalls=fixtureCalls(s.publicRoot).filter(value=>value!=='open').slice(calls.length);
    assert.equal(actionCalls.filter(value=>value==='touch').length,touches);
    assert.ok(actionCalls.every(value=>!['boot','install','launch-app','create','window'].includes(value)));
    const duplicate=snapshot(await s.call('start_observed_action',request));assert.equal(duplicate.disposition,'retrieved');assert.equal(duplicate.outcome,outcome);
    const conflictingReply=await s.call('start_observed_action',{...request,timeoutMs:6000});const conflict=snapshot(conflictingReply);
    assert.equal(conflictingReply.isError,true);assert.equal(conflict.code,'ACTION_ID_CONFLICT');
    assert.deepEqual(fixtureCalls(s.publicRoot).filter(value=>value!=='open').slice(calls.length),actionCalls);
  });
}

function boundaryRequest(bytes: number) {
  const request = actionRequest('ABCDEF00-0000-4000-8000-000000000099') as any;
  request.before.present = Array.from({length:12}, () => ({identifier:'x',label:'x',value:'x'}));
  request.after.present = Array.from({length:12}, () => ({identifier:'x',label:'x',value:'x'}));
  for(const selector of [...request.before.present,...request.after.present]) {
    for(const field of ['identifier','label','value']) {
      const remaining=bytes-Buffer.byteLength(JSON.stringify(request));if(!remaining)return request;
      const count=Math.min(499,Math.floor(remaining/3)); const rest=Math.min(remaining-count*3,499-count);
      selector[field]='x'+'界'.repeat(count)+'x'.repeat(rest);
    }
  }
  assert.equal(Buffer.byteLength(JSON.stringify(request)),bytes);return request;
}
test('MCP counts original UTF-8 request bytes before filling guard defaults',{timeout:10000},async t=>{
  const s=await session(t);
  const at=boundaryRequest(65536);assert.equal(Buffer.byteLength(JSON.stringify(at)),65536);
  assert.equal(at.before.absent,undefined);assert.equal(at.after.absent,undefined);
  const valid=snapshot(await s.call('start_observed_action',at));assert.equal(valid.code,'ALLOCATION_NOT_FOUND');
  const calls=fixtureCalls(s.publicRoot).filter(value=>value!=='open');
  const above=boundaryRequest(65537);assert.equal(Buffer.byteLength(JSON.stringify(above)),65537);
  const invalid=snapshot(await s.call('start_observed_action',above));assert.equal(invalid.code,'INVALID_REQUEST');
  assert.deepEqual(fixtureCalls(s.publicRoot).filter(value=>value!=='open'),calls);assert.deepEqual(calls,[]);
});

test('MCP transport cancellation stops only the wait; busy executing allocation directs action cancellation',{timeout:15000},async t=>{
  const s=await session(t,'pending');const allocation=snapshot(await s.call('prepare_observed_allocation',s.allocationRequest('one')));
  const action=snapshot(await s.call('start_observed_action',{...actionRequest(allocation.allocationId),timeoutMs:60000}));
  const initial=snapshot(await s.call('get_observed_action',{actionId:'one'}));assert.equal(initial.state,'running');assert.equal(initial.cancellationRequested,false);
  const waiting=s.rpc('tools/call',{name:'get_observed_action',arguments:{actionId:'one',waitMs:45000}});let received=false;
  void waiting.result.then(()=>{received=true;},()=>{});
  await new Promise(done=>setTimeout(done,100));
  s.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:waiting.id,reason:'stop waiting'}})+'\n');
  await new Promise(done=>setTimeout(done,100));
  const current=snapshot(await s.call('get_observed_action',{actionId:'one'}));assert.deepEqual(current,initial);assert.equal(current.cancellationRequested,false);
  // The pinned SDK deliberately suppresses replies for transport-cancelled requests.
  assert.equal(received,false);
  for(const tool of ['cancel_observed_allocation','retire_observed_allocation']) {
    const reply=await s.call(tool,{allocationId:allocation.allocationId});const busy=snapshot(reply);
    assert.equal(reply.isError,true);assert.equal(busy.code,'ALLOCATION_BUSY');assert.equal(busy.state,'executing');assert.equal(busy.actionId,action.actionId);
    assert.match(busy.message,/cancel_observed_action/);assert.match(busy.message,/observed-cancel/);
  }
  assert.equal(fixtureCalls(s.publicRoot).filter(value=>value==='touch').length,0);
  const cancelled=snapshot(await s.call('cancel_observed_action',{actionId:'one'}));assert.equal(cancelled.cancellationRequested,true);
  const finished=snapshot(await s.call('get_observed_action',{actionId:'one',waitMs:5000}));
  if(finished.authority==='committed'){assert.equal(finished.outcome,'inconclusive');assert.equal(finished.admission,'quarantined');}
  else {assert.equal(finished.outcome,null);assert.equal(finished.state,'unresolved');assert.ok(['active','quarantined','unknown'].includes(finished.admission));}
});
test('MCP disabled mode retains reads, cancellation and retirement under invalid configuration',{timeout:15000},async t=>{
  const s=await session(t,'observed','0');const local=fixtureObserved(s.publicRoot,true);
  const allocation=await local.prepareAllocation(s.allocationRequest('one'));await local.close();assert.ok(!('kind' in allocation));
  await import('node:fs/promises').then(fs=>fs.writeFile(s.configPath,'{bad',{mode:0o600}));
  assert.equal(snapshot(await s.call('get_observed_action',{actionId:'one'})).code,'ACTION_NOT_STARTED');
  assert.equal(snapshot(await s.call('cancel_observed_action',{actionId:'one'})).code,'ACTION_NOT_STARTED');
  assert.equal(snapshot(await s.call('get_observed_allocation',{allocationId:allocation.allocationId})).state,'ready');
  assert.equal(snapshot(await s.call('cancel_observed_allocation',{allocationId:allocation.allocationId})).outcome,'retired_unused');
  assert.equal(snapshot(await s.call('retire_observed_allocation',{allocationId:allocation.allocationId})).outcome,'retired_unused');
});

test('observed MCP v1 golden advertises exact strict schemas independently of legacy tools',{timeout:10000},async t=>{
  const s=await session(t);const tools=(await s.tools()).filter(value=>value.name.includes('observed')).sort((a,b)=>a.name.localeCompare(b.name));
  const golden=JSON.parse(await readFile(new URL('./golden/observed-mcp-v1.json',import.meta.url),'utf8'));
  assert.equal(golden.version,1);assert.deepEqual(tools,golden.tools);
  for(const tool of tools)assert.equal(tool.inputSchema.additionalProperties,false,tool.name);
  assert.deepEqual(tools.find(value=>value.name==='start_observed_action').inputSchema.required,['version','actionId','allocationId','app','action','before','after','timeoutMs']);
});
