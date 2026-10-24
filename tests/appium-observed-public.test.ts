/**
 * H02.01 on the Appium composition: the seven observed public operations, through CLI and MCP owner processes that
 * run Appium drivers over a world host, stay key-free and network-free, and every reply keeps the frozen v1 shape.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { z } from 'zod/v4';
import { actionRequest, hostFixture } from './fixtures/observed-host/harness.js';
import { errorCode, snapshot, type PublicReply } from './fixtures/public-contention.js';

const golden = JSON.parse(await readFile(new URL('./golden/observed-replies-v1.json', import.meta.url), 'utf8')) as { cases: { name: string; reply: Record<string, unknown>; exit: number }[] };
const allocationNames: Record<string, string> = { prepared: 'prepared', action_completed: 'action_completed', refused: 'allocation_refused', uncertain: 'uncertain', retired_unused: 'retired_unused' };
/** The frozen v1 case a reply belongs to: an action by its outcome, an allocation by its outcome (or its state while open),
 *  a busy refusal by its state. */
function goldenCase(reply: PublicReply) {
  const raw = reply as Record<string, unknown>;
  const name = raw.kind === 'observed-action' ? raw.outcome ?? 'unresolved'
    : raw.kind === 'observed-operation-error' ? `${String(raw.state)}_busy`
      : raw.outcome === null ? raw.authority === 'committed' ? String(raw.state) : 'unconfirmed_allocation' : allocationNames[String(raw.outcome)];
  const found = golden.cases.find(row => row.name === name);
  assert.ok(found, `golden case for ${JSON.stringify(name)}`);
  return found;
}
/** The reply carries the golden fields, plus at most an additive vendorSource. */
function assertGoldenShape(reply: PublicReply, exit?: number | null) {
  const row = goldenCase(reply);
  assert.deepEqual(Object.keys(reply).filter(key => key !== 'vendorSource').sort(), Object.keys(row.reply).sort(), row.name);
  if (exit !== undefined) assert.equal(exit, row.exit, row.name);
}
const tools = z.object({ tools: z.array(z.object({ name: z.string() })) });

for (const transport of ['cli', 'mcp'] as const) for (const [mode, outcome, exit, touches] of [
  ['observed', 'outcome_observed', 0, 1], ['already', 'already_satisfied', 0, 0], ['refused', 'refused', 3, 0],
  ['inconclusive', 'inconclusive', 2, 1], ['unresolved', null, 2, 1],
] as const) test(`H02.01 ${transport} seven public operations and ${mode} envelope on Appium are key/network free with v1 reply shapes`, { timeout: 120000 }, async t => {
  const f = await hostFixture(t, 'appium'); const ready = await f.prepare(); const request = actionRequest(ready.allocationId);
  const server = transport === 'mcp' ? await f.mcp({ mode }) : undefined;
  if (server) assert.equal(tools.parse((await server.rpc('tools/list').result).result).tools.filter(tool => tool.name.includes('observed')).length, 7);
  if (server) await server.call('start_observed_action', request);
  const result = server ? await server.call('get_observed_action', { actionId: 'one', waitMs: 10000 }) : await f.cli('observed-action', await f.requestFile(request), { mode });
  assert.deepEqual([snapshot(result.reply).outcome, snapshot(result.reply).authority], [outcome, outcome === null ? 'unconfirmed' : 'committed']);
  if ('code' in result) assert.equal(result.code, exit); else assert.equal(result.isError, undefined);
  assertGoldenShape(result.reply, 'code' in result ? result.code : undefined);
  assert.equal(f.calls().filter(op => op === 'touch').length, touches); const calls = f.calls();
  const disabled = await f.mcp({ enabled: '0' });
  assert.deepEqual(tools.parse((await disabled.rpc('tools/list').result).result).tools.filter(tool => tool.name.includes('observed')).map(tool => tool.name).sort(),
    ['cancel_observed_action', 'cancel_observed_allocation', 'get_observed_action', 'get_observed_allocation', 'retire_observed_allocation']);
  assert.equal(snapshot((await disabled.call('get_observed_action', { actionId: 'one' })).reply).outcome, outcome);
  for (const [command, tool, argument] of [['observed-report', 'get_observed_action', 'one'], ['observed-cancel', 'cancel_observed_action', 'one'], ['observed-allocation', 'get_observed_allocation', ready.allocationId],
    ['observed-retire', 'retire_observed_allocation', ready.allocationId], ['observed-allocation-cancel', 'cancel_observed_allocation', ready.allocationId]] as const) {
    const reply = transport === 'cli' ? await f.cli(command, argument, { enabled: '0' }) : await disabled.call(tool, command === 'observed-report' || command === 'observed-cancel' ? { actionId: argument } : { allocationId: argument });
    if (command === 'observed-report' || command === 'observed-cancel') assert.equal(snapshot(reply.reply).outcome, outcome);
    else assert.ok(errorCode(reply.reply) === 'ALLOCATION_BUSY' || ['retained', 'quarantined', 'executing'].includes(snapshot(reply.reply).state));
    assertGoldenShape(reply.reply, 'code' in reply ? reply.code : undefined);
  }
  assert.deepEqual(f.calls(), calls, 'disabled reads, cancels and retires make no device call');
  assert.equal((await readFile(join(f.root, 'milestones.jsonl'), 'utf8')).includes('forbidden:network'), false);
  const backend = (JSON.parse(await readFile(join(f.root, 'fixture.json'), 'utf8')) as { root: string }).root;
  const environments: string[][] = [];
  for (const owner of (await readdir(backend)).filter(name => name.startsWith('appium-'))) {
    for (const file of (await readdir(join(backend, owner))).filter(name => name.endsWith('.jsonl.env'))) environments.push(JSON.parse(await readFile(join(backend, owner, file), 'utf8')) as string[]);
  }
  assert.equal(environments.length, 2, 'one private Appium child prepared, one acted');
  assert.deepEqual(environments.filter(keys => keys.includes('TYPESAFE_API_KEY')), [], 'no private child sees a Jev key');
  await disabled.close(); if (server) await server.close();
});
