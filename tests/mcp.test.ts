import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { openMcpSession } from './fixtures/mcp-session.js';

for (const platform of ['ios', 'android'] as const) {
  test(`MCP start_scenario ignores the other-platform default for ${platform}`, { timeout: 10000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'jev-mcp-default-platform-'));
    await mkdir(join(root, '.jev'));
    const source = JSON.stringify({ version: 1, defaultProfile: 'other', profiles: { other: platform === 'android'
      ? { platform: 'ios', deviceCategory: 'ios-simulator', device: 'ABCDEF00-0000-4000-8000-000000000001' }
      : { platform: 'android', deviceCategory: 'android-emulator', device: 'Other_AVD' },
    } });
    await writeFile(join(root, '.jev/profiles.json'), source);
    const session = await openMcpSession('default-platform', { env: { JEV_PROJECT_DIR: root } });
    const scenario = { version: 1, platform, app: platform === 'android'
      ? { package: 'com.example.app' } : { bundleId: 'com.example.app' }, values: {},
      steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'SCREEN_EVIDENCE_MARKER' }] },
        assertions: [{ id: 'shown', claim: 'Visible' }] }] };
    try {
      const refused = await session.callTool('start_scenario', { scenario, profile: 'other' });
      assert.equal(refused.isError, true);
      assert.equal(refused.content[0].text, 'PROFILE_CONFLICT');
      const started = await session.callTool('start_scenario', { scenario });
      assert.notEqual(started.isError, true, JSON.stringify(started));
      const { runId } = JSON.parse(started.content[0].text);
      const report = await session.callTool('get_report', { runId, waitMs: 2000 });
      assert.match(report.content[0].text, /Status: finished/);
      assert.match(report.content[0].text, /PASSED/);
      const logPath = report.content[0].text.match(/Full local evidence: (.+\/run\.jsonl)/)?.[1];
      assert.equal(typeof logPath, 'string');
      const events = (await readFile(logPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(Object.hasOwn(events.find(event => event.type === 'started').data, 'profile'), false);
      assert.equal(await readFile(join(root, '.jev/profiles.json'), 'utf8'), source);
    } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test('MCP exposes profiles and refuses wider budgets before creating a run', { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-mcp-profile-'));
  await mkdir(join(root, '.jev'));
  await writeFile(join(root, '.jev/profiles.json'), JSON.stringify({ version: 1, profiles: {
    pixel: { platform: 'android', deviceCategory: 'android-emulator', device: 'Pixel_API_35', budgets: { operationMs: 1000 } },
  } }));
  const session = await openMcpSession('profiles', { entryPoint: 'cli', env: { JEV_PROJECT_DIR: root,
    JEV_RUNS_DIR: join(root, 'runs'), JEV_EXPERIMENTAL_OBSERVED: '0' } });
  try {
    const tool = (await session.listTools()).find(tool => tool.name === 'start_scenario');
    assert.deepEqual(tool.inputSchema.properties.profile, { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,62}$' });
    assert.deepEqual(tool.inputSchema.required, ['scenario']);
    assert.deepEqual(tool.inputSchema.properties.limits, { type: 'object', additionalProperties: false, properties: {
      maxSteps: { type: 'integer', minimum: 1, maximum: 100 },
      wallTimeMs: { type: 'integer', minimum: 1, maximum: 3600000 },
      startupMs: { type: 'integer', minimum: 1000, maximum: 600000 },
      operationMs: { type: 'integer', minimum: 1000, maximum: 600000 },
      cleanupMs: { type: 'integer', minimum: 1000, maximum: 120000 },
    } });
    const scenario = { version: 1, platform: 'android', app: { package: 'com.example.app' },
      values: {}, steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
        assertions: [{ id: 'shown', claim: 'Visible' }] }] };
    for (const [profile, limits, code] of [['pixel', { operationMs: 2000 }, 'PROFILE_CONFLICT'], ['missing', {}, 'PROFILE_NOT_FOUND']] as const) {
      const reply = await session.callTool('start_scenario', { scenario, profile, limits });
      assert.equal(reply.isError, true);
      assert.equal(reply.content[0].text, code);
    }
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(root), ['.jev']);
  } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});

test('MCP refuses an invalid profile file with INVALID_PROFILE_FILE before creating a run', { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-mcp-invalid-profile-'));
  await mkdir(join(root, '.jev'));
  await writeFile(join(root, '.jev/profiles.json'), '{');
  const session = await openMcpSession('invalid-profile', { entryPoint: 'cli', env: {
    JEV_PROJECT_DIR: root, JEV_RUNS_DIR: join(root, 'runs'), TYPESAFE_API_KEY: '', JEV_EXPERIMENTAL_OBSERVED: '0',
  } });
  try {
    const scenario = { version: 1, app: { bundleId: 'com.example.app' }, values: {},
      steps: [{ id: 'check', kind: 'checkpoint', guard: { present: [{ label: 'Marker' }] },
        assertions: [{ id: 'shown', claim: 'Visible' }] }] };
    const reply = await session.callTool('start_scenario', { scenario, profile: 'missing' });
    assert.equal(reply.isError, true);
    assert.deepEqual(reply.content, [{ type: 'text', text: 'INVALID_PROFILE_FILE' }]);
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(root), ['.jev']);
    assert.equal(await readFile(join(root, '.jev/profiles.json'), 'utf8'), '{');
  } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});

test('stdio server negotiates and exposes start/report/cancel without a key', { timeout: 10_000 }, async () => {
  const env = { ...process.env, JEV_EXPERIMENTAL_OBSERVED: '0' }; delete (env as NodeJS.ProcessEnv).TYPESAFE_API_KEY;
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
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    assert.equal(init.result.serverInfo.version, version);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await request(2, 'tools/list');
    assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name).sort(), ['cancel_observed_action', 'cancel_observed_allocation', 'cancel_run', 'get_observed_action', 'get_observed_allocation', 'get_report', 'retire_observed_allocation', 'start_scenario']);
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

test('start_scenario\'s description names both iOS and Android', { timeout: 10_000 }, async () => {
  const session = await openMcpSession('description', { entryPoint: 'cli' });
  try {
    const tools = await session.listTools();
    const startTool = tools.find((tool: { name: string }) => tool.name === 'start_scenario');
    assert.match(startTool.description, /an explicit iOS or Android action script/);
  } finally { await session.close(); }
});

test('the MCP server starts and lists its tools with both device settings empty', { timeout: 10_000 }, async () => {
  const session = await openMcpSession('empty-devices', { entryPoint: 'cli', env: { JEV_DEVICE_UDID: '', JEV_ANDROID_DEVICE: '', JEV_EXPERIMENTAL_OBSERVED: '0' } });
  try {
    const tools = await session.listTools();
    assert.deepEqual(tools.map((tool: { name: string }) => tool.name).sort(), ['cancel_observed_action', 'cancel_observed_allocation', 'cancel_run', 'get_observed_action', 'get_observed_allocation', 'get_report', 'retire_observed_allocation', 'start_scenario']);
  } finally { await session.close(); }
});

test('an Android script reaches the Android driver, whose refusal get_report shows: ANDROID_TOOLS_UNAVAILABLE without adb', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-mcp-android-refusal-'));
  const empty = join(root, 'empty');
  await mkdir(empty);
  const session = await openMcpSession('android-refusal', { entryPoint: 'cli', env: { TYPESAFE_API_KEY: 'contract-test-key',
    JEV_RUNS_DIR: join(root, 'runs'), ANDROID_HOME: empty, ANDROID_SDK_ROOT: empty, PATH: empty, HOME: empty } });
  try {
    const androidScenario = { version: 1, platform: 'android', app: { package: 'com.hugues.test_cmp' },
      device: { serial: 'emulator-5554' }, values: {},
      steps: [{ id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
        assertions: [{ id: 'shown', claim: 'Marker visible' }] }] };
    const start = await session.callTool('start_scenario', { scenario: androidScenario });
    assert.notEqual(start.isError, true);
    const { runId } = JSON.parse(start.content[0].text) as { runId: string };
    const report = await session.callTool('get_report', { runId, waitMs: 10_000 });
    assert.match(report.content[0].text, /^Status: finished/);
    assert.match(report.content[0].text, /ANDROID_TOOLS_UNAVAILABLE/);
  } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
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
    const tooManySteps=await request(3,'tools/call',{name:'start_scenario',arguments:{scenario:{version:1,app:{bundleId:'com.example.app'},values:{},steps:[{id:'verify',kind:'checkpoint',guard:{present:[{role:'text',label:'SCREEN_EVIDENCE_MARKER'}]},assertions:[{id:'shown',claim:'Marker visible'}]}]},limits:{maxSteps:101}}});
    assert.equal(tooManySteps.result.isError,true);
    const start=await request(4,'tools/call',{name:'start_scenario',arguments:{scenario:{version:1,app:{bundleId:'com.example.app'},values:{},steps:[{id:'verify',kind:'checkpoint',guard:{present:[{role:'text',label:'SCREEN_EVIDENCE_MARKER'}]},assertions:[{id:'shown',claim:'Marker visible'}]}]}}});
    const {runId}=JSON.parse(start.result.content[0].text);
    const interim=await request(5,'tools/call',{name:'get_report',arguments:{runId}});
    assert.match(interim.result.content[0].text,/Status: running/);
    assert.doesNotMatch(interim.result.content[0].text,/SCREEN_EVIDENCE_MARKER|probabilities|observation/);
    const final=await request(6,'tools/call',{name:'get_report',arguments:{runId,waitMs:2000}});
    assert.match(final.result.content[0].text,/Status: finished/);
    assert.match(final.result.content[0].text,/SCREEN_EVIDENCE_MARKER/);
  }finally{
    // Let the fixture server finish writing before deleting its folder.
    const exited=child.exitCode!==null?Promise.resolve():new Promise<void>(done=>child.once('exit',()=>done()));
    child.stdin.end();lines.close();
    const timer=setTimeout(()=>child.kill('SIGTERM'),5000);await exited;clearTimeout(timer);
    await rm(root,{recursive:true,force:true});
  }
});

test('start_scenario rejects an invalid iOS script with the same validation text as 1.1', { timeout: 10_000 }, async () => {
  const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Marker' }] },
    assertions: [{ id: 'shown', claim: 'Marker visible' }] };
  const tap = { id: 'open', kind: 'action', guard: { present: [{ role: 'text', label: 'Marker' }] },
    action: { kind: 'tap', selector: { role: 'text', label: 'Marker' } } };
  const script = { version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [checkpoint] };
  const prefix = 'Input validation error: Invalid arguments for tool start_scenario: ';
  // Each expected text is what the 1.1 server (commit 819ea10) returned for the same input.
  const cases: [string, object, string][] = [
    ['a non-ASCII typed value', { ...script, values: { q: 'Đà Nẵng' } },
      'scenario.values.q: Typed values must use printable US keyboard characters'],
    ['a missing bundle ID', { ...script, app: {} },
      'scenario.app.bundleId: Invalid input: expected string, received undefined'],
    ['a script ending at an action', { ...script, steps: [checkpoint, tap] },
      'scenario.steps: A script must end at an assertion checkpoint'],
    ['duplicate step IDs', { ...script, steps: [checkpoint, checkpoint] },
      'scenario.steps.1.id: Step IDs must be unique'],
    ['an Android app.package on an iOS script', { ...script, app: { bundleId: 'com.example.app', package: 'com.example.android' } },
      'scenario.app: Unrecognized key: "package"'],
    ['a bad udid and a non-ASCII typed value', { ...script, device: { udid: 'not-a-udid' }, values: { q: 'Đà Nẵng' } },
      'scenario.device.udid: Invalid string: must match pattern ' +
      '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, ' +
      'scenario.values.q: Typed values must use printable US keyboard characters'],
  ];
  const session = await openMcpSession('ios-errors');
  try {
    for (const [name, scenario, expected] of cases) {
      assert.deepEqual(await session.callTool('start_scenario', { scenario }),
        { content: [{ type: 'text', text: prefix + expected }], isError: true }, name);
    }
  } finally { await session.close(); }
});
