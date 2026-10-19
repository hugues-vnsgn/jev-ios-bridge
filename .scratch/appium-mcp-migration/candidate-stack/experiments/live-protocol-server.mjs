import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { installNativeProcessReceipts } from './native-process-receipts.mjs';
import { recordRuntimeModules } from './runtime-module-recorder.mjs';
import { journal } from './stop-journal.mjs';
import { createLiveProtocolLedger, closedDispatchGate } from './live-protocol-ledger.mjs';
const [directory] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(join(directory, 'profile.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../fixtures/protocol.json', import.meta.url), 'utf8'));
const ownerPath = process.env.JEV_STOP_GROUP_RECORD;
const observer = installNativeProcessReceipts(directory, ownerPath);
const loadedModules = recordRuntimeModules(join(import.meta.dirname, '..'));
const { protocolExtension } = await import('./protocol-extension.mjs');
const { logger } = await import('@appium/support');
const { stack, publicCore } = await import('./stack-probe.mjs');
assert.deepEqual(stack, fixture.stack);
const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
function persist(file, value) {
  writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const fd = openSync(file + '.tmp', 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(file + '.tmp', file);
  const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
function capture() {
  const members = readdirSync(join(directory, 'components')).map(name => JSON.parse(readFileSync(join(directory, 'components', name), 'utf8')))
    .filter(component => component.pgid === owner.pgid && component.ownerPid === owner.pid && component.ownerIncarnation === owner.incarnation)
    .map(component => ({ pid: component.pid, incarnation: component.incarnation }));
  owner.members = [...new Map([...owner.members, ...members].map(x => [x.pid + ':' + x.incarnation, x])).values()];
  persist(ownerPath, owner);
  return owner;
}
const extension = protocolExtension(stack, profile);
const accessJournal = (operation, value) => journal(directory, operation, value);
const ledger = createLiveProtocolLedger({ profile, journal: accessJournal, io: {
  persist: (name, value) => persist(join(directory, name), value),
  captureOwner: capture,
  loadedModules,
  observeCreatedSession(info) {
    const snapshot = JSON.parse(observer.execFileSync('python3', [join(import.meta.dirname, 'native-runtime-observer.py'), join(import.meta.dirname, '../../evidence/phase1-freeze-20261018.json'), profile.platform], { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }));
    snapshot.driverConstructor = info.driver.constructor.name; snapshot.sessionId = info.sessionId; snapshot.ownership = info.ownership;
    return snapshot;
  },
  enableDebugLogging() { logger.getLogger('appium-mcp').level = 'debug'; },
  waitForFault(mode) { return mode === 'late-action' ? new Promise(resolve => setTimeout(resolve, 3000)) : new Promise(() => {}); },
  now: Date.now,
  serverPid: process.pid,
} });
const closedGate = closedDispatchGate(accessJournal);
publicCore.configureStdioTransportLogging();
const server = await publicCore.createAppiumMcpServer({ plugins: [closedGate, extension, ledger], policy: { allowTools: [/^(appium_(session_management|get_page_source|find_elements|gesture|screenshot)|jev_phase1_(stack|inventory))$/] } });
await server.start({ transportType: 'stdio' });
