import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('stdio server negotiates and exposes start/report/cancel without a key', { timeout: 10_000 }, async () => {
  const env = { ...process.env }; delete env.TYPESAFE_API_KEY;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'mcp'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<number, (value: any) => void>();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const value = JSON.parse(line);
    pending.get(value.id)?.(value); pending.delete(value.id);
  });
  const request = (id: number, method: string, params: object = {}) => new Promise<any>(done => {
    pending.set(id, done);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    const init = await request(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'jev-ios-bridge');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await request(2, 'tools/list');
    assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name).sort(), ['cancel_run', 'get_report', 'start_scenario']);
    const startSchema = list.result.tools.find((tool: { name: string }) => tool.name === 'start_scenario').inputSchema;
    assert.ok(startSchema.properties.scenario);
    const report = await request(3, 'tools/call', { name: 'get_report', arguments: { runId: 'missing' } });
    assert.equal(report.result.isError, true);
    assert.equal(report.result.structuredContent, undefined);
  } finally {
    child.stdin.end();
    lines.close();
    if (child.exitCode === null) child.kill('SIGTERM');
  }
});

test('running MCP reports hide screen evidence and bounded waiting returns the final report', {timeout:5000}, async()=>{
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'jev-mcp-contract-'));
  const child=spawn(process.execPath,['--import','tsx','tests/fixtures/mcp-server.ts',root],{stdio:['pipe','pipe','pipe']});
  const pending=new Map<number,(value:any)=>void>();const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const value=JSON.parse(line);pending.get(value.id)?.(value);pending.delete(value.id);});
  const request=(id:number,method:string,params:object={})=>new Promise<any>(done=>{pending.set(id,done);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  try{
    await request(1,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'contract',version:'1'}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const legacy=await request(2,'tools/call',{name:'start_scenario',arguments:{scenario:{goal:'A marker is visible',app:{bundleId:'com.example.app'},assertions:[{id:'shown',claim:'Marker visible'}],values:{}}}});
    assert.equal(legacy.result.isError,true);
    const tooManySteps=await request(3,'tools/call',{name:'start_scenario',arguments:{scenario:{app:{bundleId:'com.example.app'},values:{},steps:[{id:'verify',kind:'checkpoint',guard:{present:[{role:'text',label:'SCREEN_EVIDENCE_MARKER'}]},assertions:[{id:'shown',claim:'Marker visible'}]}]},limits:{maxSteps:101}}});
    assert.equal(tooManySteps.result.isError,true);
    const start=await request(4,'tools/call',{name:'start_scenario',arguments:{scenario:{app:{bundleId:'com.example.app'},values:{},steps:[{id:'verify',kind:'checkpoint',guard:{present:[{role:'text',label:'SCREEN_EVIDENCE_MARKER'}]},assertions:[{id:'shown',claim:'Marker visible'}]}]}}});
    const {runId}=JSON.parse(start.result.content[0].text);
    const interim=await request(5,'tools/call',{name:'get_report',arguments:{runId}});
    assert.match(interim.result.content[0].text,/Status: running/);
    assert.doesNotMatch(interim.result.content[0].text,/SCREEN_EVIDENCE_MARKER|probabilities|observation/);
    const final=await request(6,'tools/call',{name:'get_report',arguments:{runId,waitMs:2000}});
    assert.match(final.result.content[0].text,/Status: finished/);
    assert.match(final.result.content[0].text,/SCREEN_EVIDENCE_MARKER/);
  }finally{child.stdin.end();lines.close();if(child.exitCode===null)child.kill('SIGTERM');await rm(root,{recursive:true,force:true});}
});
