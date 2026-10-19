import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const fixture = fileURLToPath(new URL('./fixtures/appium-lost-create-public-core.mjs', import.meta.url));
const reply = z.object({ isError: z.boolean(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).passthrough();
const replyOutcome = z.object({ kind: z.literal('reply'), reply });
const refusalOutcome = z.object({ kind: z.literal('refused'), error: z.string() });
const settledOutcome = z.discriminatedUnion('kind', [replyOutcome, refusalOutcome]);
const firstOutcome = z.discriminatedUnion('kind', [replyOutcome, refusalOutcome, z.object({ kind: z.literal('barrier') })]);
const command = z.object({ id: z.string(), tool: z.string(), arguments: z.record(z.string(), z.unknown()), disposition: z.string() });
const state = z.object({ closed: z.boolean(), outcome: z.string().nullable(), commands: z.array(command), quarantined: z.boolean(), leaseReleased: z.boolean(), fence: z.unknown().optional() });
const counts = z.object({ providerCalls: z.number(), mutationCalls: z.number(), commands: z.number() });
const inventory = z.object({ structuredContent: z.object({ sessions: z.array(z.unknown()), creationAuthorizedCount: z.number(), nativeFenceEstablished: z.boolean(), extensionVersion: z.literal(1) }) });
const publicResult = z.object({
  kind: z.literal('public-core-integration'), first: firstOutcome, settled: settledOutcome,
  providerCalls: z.number(), mutationCalls: z.number(), nativeCommands: z.number(), nativeObservations: z.number(), forbiddenImports: z.number(), driverReferences: z.number(), publicSessions: z.number(), barrierCount: z.number(), waitCalls: z.number(),
  receipts: z.record(z.string(), z.unknown()), inventoryBefore: inventory, inventoryAfter: inventory,
  countsBeforeBlocked: counts, countsAfterBlocked: counts, blockedCreate: reply, blockedMutation: reply,
  final: state, createRequest: z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) }),
  faultBarrierExists: z.boolean(), pluginOrder: z.array(z.string()),
});
const unitResult = z.object({ kind: z.literal('fake-core-unit'), first: firstOutcome, settled: settledOutcome, events: z.array(z.string()), nativeObservations: z.number(), barrierCount: z.number(), waitCalls: z.number(), receipts: z.record(z.string(), z.unknown()), final: state });

function run({ t, mode }: { t: TestContext; mode: string }): unknown {
  const directory = mkdtempSync(join(tmpdir(), 'appium-lost-create-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, 'home');
  const temporary = join(directory, 'tmp');
  mkdirSync(home); mkdirSync(temporary);
  const result = spawnSync(process.execPath, ['--experimental-import-meta-resolve', fixture, directory, mode], {
    encoding: 'utf8', timeout: 30_000,
    env: { HOME: home, TMPDIR: temporary, PATH: dirname(process.execPath), TZ: 'UTC', LANG: 'C', NODE_NO_WARNINGS: '1', APPIUM_MCP_ON_CLIENT_DISCONNECT: 'skip' },
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '');
}

function assertClosed(result: z.infer<typeof publicResult>) {
  assert.equal(result.providerCalls, 1);
  assert.equal(result.mutationCalls, 0);
  assert.equal(result.nativeCommands, 0);
  assert.equal(result.nativeObservations, 0);
  assert.equal(result.forbiddenImports, 0);
  assert.equal(result.publicSessions, 0);
  assert.equal(result.driverReferences, 0);
  assert.equal(result.barrierCount, 0);
  assert.equal(result.waitCalls, 0);
  assert.equal(result.faultBarrierExists, false);
  assert.deepEqual(result.countsBeforeBlocked, { providerCalls: 1, mutationCalls: 0, commands: 1 });
  assert.deepEqual(result.countsAfterBlocked, result.countsBeforeBlocked);
  for (const receipt of [result.inventoryBefore, result.inventoryAfter]) assert.deepEqual(receipt.structuredContent, { sessions: [], creationAuthorizedCount: 1, nativeFenceEstablished: false, extensionVersion: 1 });
  for (const blocked of [result.blockedCreate, result.blockedMutation]) {
    assert.equal(blocked.isError, true);
    assert.deepEqual(blocked.content, [{ type: 'text', text: 'DISPATCH_CLOSED' }]);
  }
  assert.equal(result.final.closed, true);
  assert.equal(result.final.outcome, 'inconclusive');
  assert.equal(result.final.quarantined, true);
  assert.equal(result.final.leaseReleased, false);
  assert.equal(result.final.fence, undefined);
  assert.deepEqual(result.pluginOrder, ['jev-closed-dispatch-gate', 'jev-phase1-protocol', 'jev-live-protocol-ledger', 'controlled-host-provider']);
}

test('public core returns a failed creation without a lost-create barrier and blocks later dispatch', { timeout: 35_000 }, t => {
  const result = publicResult.parse(run({ t, mode: 'error' }));
  assert.equal(result.first.kind, 'reply', 'a provider error must return before any fault barrier');
  assert.equal(result.settled.kind, 'reply');
  assert.deepEqual(result.settled.reply, { isError: true, content: [{ type: 'text', text: 'VENDOR_ERROR' }] });
  assertClosed(result);
  assert.deepEqual(result.final.commands, [{ id: 'command-1', tool: result.createRequest.name, arguments: result.createRequest.arguments, disposition: 'terminal' }]);
  assert.deepEqual(result.receipts['native-return.json'], { id: 'command-1', tool: 'appium_session_management', nativeReturned: true, isError: true, time: 123 });
  assert.equal(result.receipts['native-runtime.json'], undefined);
});

test('public core refuses nominal creation success without an owned session before ledger completion', { timeout: 35_000 }, t => {
  const result = publicResult.parse(run({ t, mode: 'malformed' }));
  assert.equal(result.first.kind, 'reply');
  assert.equal(result.settled.kind, 'reply');
  assert.equal(result.settled.reply.isError, true);
  assert.match(result.settled.reply.content.map(block => block.text ?? '').join('\n'), /INVALID_CREATION_RESULT/);
  assertClosed(result);
  assert.equal(result.receipts['native-return.json'], undefined);
  assert.equal(result.final.commands[0]?.disposition, 'uncertain');
});

test('fake-core unit: one validated owned creation publishes the barrier after completion and inventory', t => {
  const result = unitResult.parse(run({ t, mode: 'unit-success' }));
  assert.equal(result.first.kind, 'barrier');
  assert.equal(result.settled.kind, 'reply');
  assert.equal(result.barrierCount, 1);
  assert.equal(result.waitCalls, 1);
  assert.equal(result.nativeObservations, 1);
  assert.deepEqual(result.events.slice(result.events.indexOf('native-return.json')), ['native-return.json', 'complete', 'observe', 'native-runtime.json', 'loaded', 'actual-loaded.json', 'owner', 'inventory.json', 'fault-barrier.json', 'hold']);
  assert.equal(result.final.commands[0]?.disposition, 'terminal');
  assert.equal(result.final.leaseReleased, false);
});

test('fake-core unit: zero, multiple, mismatched or missing owned session metadata cannot qualify creation loss', t => {
  for (const mode of ['unit-zero', 'unit-multiple', 'unit-mismatch', 'unit-missing-info']) {
    const result = unitResult.parse(run({ t, mode }));
    assert.equal(result.first.kind, 'refused', mode);
    assert.equal(result.settled.kind, 'refused', mode);
    assert.match(result.settled.error, /INVALID_CREATION_RESULT/, mode);
    assert.equal(result.barrierCount, 0, mode);
    assert.equal(result.waitCalls, 0, mode);
    assert.equal(result.nativeObservations, 0, mode);
    assert.equal(result.final.leaseReleased, false);
  }
});

test('fake-core unit: creation loss requires the owned session to remain in the persisted final inventory', t => {
  const result = unitResult.parse(run({ t, mode: 'unit-vanished-after-observe' }));
  assert.equal(result.first.kind, 'refused');
  assert.equal(result.settled.kind, 'refused');
  assert.match(result.settled.error, /INVALID_CREATION_RESULT/);
  assert.equal(result.nativeObservations, 1);
  assert.deepEqual(z.object({ sessions: z.array(z.unknown()) }).parse(result.receipts['inventory.json']).sessions, []);
  assert.equal(result.barrierCount, 0);
  assert.equal(result.waitCalls, 0);
  assert.equal(result.final.commands[0]?.disposition, 'terminal');
  assert.equal(result.final.quarantined, true);
  assert.equal(result.final.leaseReleased, false);
});
