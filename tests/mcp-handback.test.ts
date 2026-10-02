/**
 * resolve_step over MCP (Issue 08): published only with driven mode on; a paused run's get_report returns at once
 * with the package; an invalid answer is refused with its reason; a valid one lets the run finish.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openMcpSession } from './fixtures/mcp-session.js';

const checkpoint = { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
  assertions: [{ id: 'shown', claim: 'Home is shown.' }] };
const scenario = { version: 2, app: { bundleId: 'com.example.app' }, values: {}, steps: [
  { id: 'signIn', kind: 'do', intent: 'Sign in', doneWhen: 'Home shows', effect: 'none', localOnly: true }, checkpoint] };

test('resolve_step is published with a strict answer schema, and the hand-back limit with it', { timeout: 15_000 }, async () => {
  const session = await openMcpSession('driven-tools', { fixture: 'tests/fixtures/mcp-driven-server.ts' });
  try {
    const tools = await session.listTools();
    assert.deepEqual(tools.map((tool: { name: string }) => tool.name).sort(),
      ['cancel_run', 'get_report', 'resolve_step', 'start_scenario']);
    const resolve = tools.find((tool: { name: string }) => tool.name === 'resolve_step');
    assert.deepEqual(resolve.inputSchema.required.sort(), ['answer', 'pauseId', 'runId']);
    const kinds = (resolve.inputSchema.properties.answer.oneOf ?? resolve.inputSchema.properties.answer.anyOf)
      .map((option: { properties: { kind: { const: string } } }) => option.properties.kind.const).sort();
    assert.deepEqual(kinds, ['back', 'done', 'revise', 'scroll', 'stop', 'tap', 'tapAt', 'type']);
    assert.match(resolve.description, /pixels of the screenshot file/);
    assert.match(resolve.description, /UNSUPPORTED_ACTION/);
    const start = tools.find((tool: { name: string }) => tool.name === 'start_scenario');
    assert.ok(start.inputSchema.properties.limits.properties.handbackTimeoutMs);
    const report = tools.find((tool: { name: string }) => tool.name === 'get_report');
    assert.match(report.description, /needs_claude/);
  } finally { await session.close(); }
});

test('a paused run over MCP: get_report returns at once, a bad answer is refused, a good one finishes the run', { timeout: 20_000 }, async () => {
  const session = await openMcpSession('driven-run', { fixture: 'tests/fixtures/mcp-driven-server.ts' });
  try {
    const started = await session.callTool('start_scenario', { scenario });
    const { runId } = JSON.parse(started.content[0].text) as { runId: string };
    const before = performance.now();
    const paused = await session.callTool('get_report', { runId, waitMs: 45_000 });
    assert.ok(performance.now() - before < 5_000, 'the pause ends the wait at once');
    const text = paused.content[0].text as string;
    assert.match(text, /^Status: needs_claude/);
    assert.match(text, /Reason: LOCAL_ONLY_STEP/);
    assert.match(text, / {2}b1: button "Sign in"/);
    const pauseId = /Pause: (\S+)/.exec(text)![1]!;

    const refused = await session.callTool('resolve_step', { runId, pauseId, answer: { kind: 'tap', ref: 'nope' } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /"nope" is not on the paused screen/);
    const malformed = await session.callTool('resolve_step', { runId, pauseId, answer: { kind: 'tap', ref: 'b1', x: 1 } });
    assert.equal(malformed.isError, true);
    assert.match((await session.callTool('get_report', { runId })).content[0].text, /^Status: needs_claude/);

    const tapped = await session.callTool('resolve_step', { runId, pauseId, answer: { kind: 'tap', ref: 'b1' } });
    assert.equal(tapped.isError, undefined);
    assert.match(tapped.content[0].text, /Answer tap accepted/);
    const second = (await session.callTool('get_report', { runId, waitMs: 45_000 })).content[0].text as string;
    const secondId = /Pause: (\S+)/.exec(second)![1]!;
    assert.notEqual(secondId, pauseId);
    await session.callTool('resolve_step', { runId, pauseId: secondId, answer: { kind: 'done' } });
    const finished = (await session.callTool('get_report', { runId, waitMs: 45_000 })).content[0].text as string;
    assert.match(finished, /^Status: finished/);
    assert.match(finished, /passed/i);
  } finally { await session.close(); }
});

test('the real MCP server publishes resolve_step only with JEV_EXPERIMENTAL_DRIVEN=1', { timeout: 15_000 }, async () => {
  for (const [value, expected] of [['1', true], ['0', false]] as const) {
    const session = await openMcpSession(`driven-switch-${value}`, { entryPoint: 'cli', env: { JEV_EXPERIMENTAL_DRIVEN: value } });
    try {
      const names = (await session.listTools()).map((tool: { name: string }) => tool.name);
      assert.equal(names.includes('resolve_step'), expected);
    } finally { await session.close(); }
  }
});
