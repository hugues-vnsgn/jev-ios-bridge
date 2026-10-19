import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports, registerHooks } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [directory, mode = 'error'] = process.argv.slice(2);
let nativeCommands = 0, nativeObservations = 0, forbiddenImports = 0;
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[name] = () => { nativeCommands++; throw new Error(`NATIVE_PROCESS_FORBIDDEN:${name}`); };
}
syncBuiltinESMExports();
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (/\/(?:live-protocol-server|stack-probe|native-process-receipts|native-runtime-observer)\.(?:mjs|py)(?:$|\?)/.test(resolved.url)) {
      forbiddenImports++;
      throw new Error('NATIVE_HARNESS_IMPORT_FORBIDDEN');
    }
    return resolved;
  },
});
assert.equal(process.env.TYPESAFE_API_KEY, undefined);
const base = new URL('../../.scratch/appium-mcp-migration/candidate-stack/', import.meta.url);
const candidateImport = name => import(import.meta.resolve(name, new URL('package.json', base).href));
const { createLiveProtocolLedger, closedDispatchGate } = await import(new URL('experiments/live-protocol-ledger.mjs', base));
const { protocolExtension } = await import(new URL('experiments/protocol-extension.mjs', base));
const { journal } = await import(new URL('experiments/stop-journal.mjs', base));
const fixture = JSON.parse(readFileSync(new URL('fixtures/protocol.json', base), 'utf8'));
const createRequest = fixture.platforms.android.calls[0].request;
const profile = { platform: 'android', caps: JSON.parse(createRequest.arguments.capabilities), faultMode: 'lost-create' };
const accessJournal = (operation, value) => journal(directory, operation, value);
accessJournal('initialize', { runId: 'lost-create-host-fixture', device: 'host-only-fixture', platform: 'android' });
const events = [];
const receipts = {};
let barrierCount = 0, waitCalls = 0;
const barrier = Promise.withResolvers();
const hold = Promise.withResolvers();
const owner = { pid: process.pid, incarnation: 'host-fixture', members: [] };
const io = {
  persist(filename, value) {
    writeFileSync(join(directory, filename), JSON.stringify(value), { mode: 0o600 });
    receipts[filename] = value;
    events.push(filename);
    if (filename === 'fault-barrier.json') { barrierCount++; barrier.resolve({ kind: 'barrier' }); }
  },
  captureOwner() { events.push('owner'); return owner; },
  loadedModules() { events.push('loaded'); return { fixture: true }; },
  observeCreatedSession(info) {
    nativeObservations++;
    events.push('observe');
    if (!mode.startsWith('unit-')) throw new Error('NATIVE_OBSERVATION_FORBIDDEN');
    return { sessionId: info.sessionId, ownership: info.ownership, fixture: true };
  },
  enableDebugLogging() {},
  waitForFault(faultMode) { assert.equal(faultMode, 'lost-create'); waitCalls++; events.push('hold'); return hold.promise; },
  now: () => 123,
  serverPid: process.pid,
};
const ledger = createLiveProtocolLedger({ profile, journal: (operation, value) => {
  events.push(operation);
  return accessJournal(operation, value);
}, io });
const watchdog = setTimeout(() => { process.stderr.write('Fixture watchdog expired\n'); process.exit(2); }, 25_000);
let output;
try {
  if (mode.startsWith('unit-')) {
    const reply = structuredClone(fixture.platforms.android.calls[0].reply);
    const session = reply.structuredContent.sessions[0];
    const foreign = { ...session, sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' };
    const sessions = mode === 'unit-zero' ? [] : mode === 'unit-multiple' ? [session, foreign] : mode === 'unit-mismatch' ? [foreign] : [session];
    const core = {
      listSessions: () => mode === 'unit-vanished-after-observe' && nativeObservations > 0 ? [] : sessions,
      getSessionInfo: id => mode === 'unit-missing-info' ? undefined : sessions.find(item => item.sessionId === id) ? { ...sessions.find(item => item.sessionId === id), driver: {} } : undefined,
    };
    ledger.register({}, core);
    const context = { toolName: createRequest.name, args: createRequest.arguments };
    await ledger.beforeCall(context);
    const pending = Promise.resolve().then(() => ledger.afterCall(context, reply)).then(value => ({ kind: 'reply', reply: value }), error => ({ kind: 'refused', error: String(error) }));
    let first;
    try { first = await Promise.race([pending, barrier.promise]); }
    finally { hold.resolve(); }
    const settled = await pending;
    output = { kind: 'fake-core-unit', mode, first, settled, events, nativeObservations, barrierCount, waitCalls, receipts, final: accessJournal('close') };
  } else {
    const [{ createAppiumMcpServer }, { Client }, { InMemoryTransport }, { z }] = await Promise.all([
      candidateImport('appium-mcp/core'), candidateImport('@modelcontextprotocol/sdk/client/index.js'),
      candidateImport('@modelcontextprotocol/sdk/inMemory.js'), candidateImport('zod'),
    ]);
    let core, providerCalls = 0, mutationCalls = 0;
    const provider = {
      name: 'controlled-host-provider', version: '0.1.0',
      register(registry, publicCore) {
        core = publicCore;
        registry.addTool({
          name: createRequest.name, description: 'Controlled host creation regression provider',
          parameters: z.object({ action: z.enum(['create', 'delete']), platform: z.string().optional(), capabilities: z.string().optional(), sessionId: z.string().optional() }).strict(),
          execute: async () => {
            providerCalls++;
            return mode === 'malformed' ? structuredClone(fixture.platforms.android.calls[0].reply) : { isError: true, content: [{ type: 'text', text: 'CONTROLLED_PROVIDER_SETUP_FAILURE' }] };
          },
        });
        registry.addTool({ name: 'appium_gesture', description: 'Controlled host mutation tripwire', parameters: z.object({ action: z.string(), sessionId: z.string(), elementUUID: z.string() }).strict(), execute: async () => { mutationCalls++; throw new Error('POST_CLOSE_MUTATION_EXECUTED'); } });
      },
    };
    const plugins = [closedDispatchGate(accessJournal), protocolExtension({ fixture: true }, profile), ledger, provider];
    const server = await createAppiumMcpServer({ plugins, policy: { allowTools: [/^(appium_(session_management|gesture)|jev_phase1_(stack|inventory))$/] } });
    const client = new Client({ name: 'lost-create-regression', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    let session, pending;
    try {
      [session] = await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const tools = await client.listTools();
      assert.equal(tools.tools.filter(tool => tool.name === createRequest.name).length, 1);
      assert.equal(tools.tools.find(tool => tool.name === createRequest.name).description, 'Controlled host creation regression provider');
      pending = client.callTool(createRequest).then(reply => ({ kind: 'reply', reply }), error => ({ kind: 'refused', error: String(error) }));
      const first = await Promise.race([pending, barrier.promise]);
      accessJournal('close');
      hold.resolve();
      const settled = await pending;
      const inventoryBefore = await client.callTool({ name: 'jev_phase1_inventory', arguments: {} });
      const countsBeforeBlocked = { providerCalls, mutationCalls, commands: accessJournal('inspect').commands.length };
      const blockedCreate = await client.callTool(createRequest);
      const blockedMutation = await client.callTool({ name: 'appium_gesture', arguments: { action: 'tap', sessionId: 'd2df8099-06b0-4fe3-b223-ec301c82c340', elementUUID: 'ffffffff-ffff-ffff-ffff-ffffffffffff' } });
      const inventoryAfter = await client.callTool({ name: 'jev_phase1_inventory', arguments: {} });
      let driverReferences = core.listSessions().filter(item => core.getSessionInfo(item.sessionId)?.driver || core.getDriver(item.sessionId)).length;
      if (core.getSessionInfo() || core.getSessionId() || core.getDriver()) driverReferences++;
      output = {
        kind: 'public-core-integration', mode, first, settled, providerCalls, mutationCalls,
        nativeCommands, nativeObservations, forbiddenImports, driverReferences,
        publicSessions: core.listSessions().length, barrierCount, waitCalls, receipts,
        inventoryBefore, inventoryAfter, countsBeforeBlocked,
        countsAfterBlocked: { providerCalls, mutationCalls, commands: accessJournal('inspect').commands.length },
        blockedCreate, blockedMutation, final: accessJournal('inspect'), createRequest,
        faultBarrierExists: existsSync(join(directory, 'fault-barrier.json')),
        pluginOrder: plugins.map(plugin => plugin.name),
      };
    } finally {
      accessJournal('close');
      hold.resolve();
      if (pending) await pending;
      await client.close();
      if (session) await session.close();
      await server.stop();
    }
  }
} finally {
  hold.resolve();
  accessJournal('close');
  clearTimeout(watchdog);
}
process.stdout.write(JSON.stringify(output) + '\n');
