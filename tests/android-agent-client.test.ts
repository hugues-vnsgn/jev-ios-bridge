import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { OutcomeUnknownError } from '../src/device/android/ledger.js';
import { AGENT_REQUEST_TIMEOUT_MS, DeviceAgentError, deviceAgentClient, type DeviceAgentClient } from '../src/device/android/agent-client.js';
import { DeviceReasonError } from '../src/device/index.js';

interface Received { method: string | undefined; url: string | undefined; headers: IncomingHttpHeaders; body: string }

/** A stand-in for the agent behind `adb forward`: records every request and connection, and answers with `respond`. */
async function withAgent(respond: (request: { id: unknown; method: string; params: unknown }, res: ServerResponse, req: IncomingMessage) => void,
  body: (client: DeviceAgentClient, agent: { received: Received[]; connections: () => number; port: number }) => Promise<void>,
  options: { timeoutMs?: number } = {}): Promise<void> {
  const received: Received[] = [];
  let connections = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      received.push({ method: req.method, url: req.url, headers: req.headers, body: text });
      respond(JSON.parse(text) as { id: unknown; method: string; params: unknown }, res, req);
    });
  });
  server.on('connection', () => { connections++; });
  await new Promise<void>(resolveListening => { server.listen(0, '127.0.0.1', resolveListening); });
  const port = (server.address() as AddressInfo).port;
  try {
    await body(deviceAgentClient({ port, ...options }), { received, connections: () => connections, port });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolveClosed => { server.close(() => { resolveClosed(); }); });
  }
}

function answer(result: unknown) {
  return (request: { id: unknown }, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  };
}

const live = () => new AbortController().signal;
const sleep = (milliseconds: number) => new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));

test('each request is one HTTP/1.1 POST to / on its own connection, with Content-Length, Connection: close and a fresh id', async () => {
  await withAgent(answer({}), async (client, agent) => {
    await client.tap({ x: 540, y: 1200 }, live());
    await client.tap({ x: 10, y: 20 }, live());
    assert.equal(agent.connections(), 2);
    const [first, second] = agent.received;
    assert.equal(first!.method, 'POST');
    assert.equal(first!.url, '/');
    assert.equal(first!.body, '{"jsonrpc":"2.0","id":1,"method":"device.io.tap","params":{"x":540,"y":1200}}');
    assert.equal(first!.headers['content-type'], 'application/json');
    assert.equal(first!.headers['content-length'], String(Buffer.byteLength(first!.body)));
    assert.equal(first!.headers.connection, 'close');
    assert.equal(first!.headers.host, `127.0.0.1:${String(agent.port)}`);
    assert.equal(second!.body, '{"jsonrpc":"2.0","id":2,"method":"device.io.tap","params":{"x":10,"y":20}}');
  });
});

test('each typed method sends the agent method and parameter shape the tracer confirmed', async () => {
  await withAgent((request, res) => {
    const results: Record<string, unknown> = {
      'device.version': { dexSha256: 'abc' },
      'device.dump.ui': { hierarchy: [] },
      'device.screenshot': { data: '' },
    };
    answer(results[request.method] ?? {})(request, res);
  }, async (client, agent) => {
    await client.version(live());
    await client.dumpUi(2000, live());
    await client.swipe({ x1: 540, y1: 1800, x2: 540, y2: 400, duration: 1000 }, live());
    await client.keys([{ keycode: 'KEYCODE_A', modifiers: ['KEYCODE_CTRL_LEFT'] }], live());
    await client.keys([{ keycode: 'KEYCODE_DEL' }], live());
    await client.text('-12.50', live());
    await client.button('KEYCODE_PASTE', live());
    await client.clipboardSet('Tiếng Việt', live());
    await client.clipboardClear(live());
    await client.screenshot(800, live());
    assert.deepEqual(agent.received.map(item => JSON.parse(item.body) as unknown), [
      { jsonrpc: '2.0', id: 1, method: 'device.version', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'device.dump.ui', params: { waitUntilIdle: 2000 } },
      { jsonrpc: '2.0', id: 3, method: 'device.io.swipe', params: { x1: 540, y1: 1800, x2: 540, y2: 400, duration: 1000 } },
      { jsonrpc: '2.0', id: 4, method: 'device.io.keys', params: { keys: [{ keycode: 'KEYCODE_A', modifiers: ['KEYCODE_CTRL_LEFT'] }] } },
      { jsonrpc: '2.0', id: 5, method: 'device.io.keys', params: { keys: [{ keycode: 'KEYCODE_DEL' }] } },
      { jsonrpc: '2.0', id: 6, method: 'device.io.text', params: { text: '-12.50' } },
      { jsonrpc: '2.0', id: 7, method: 'device.io.button', params: { button: 'KEYCODE_PASTE' } },
      { jsonrpc: '2.0', id: 8, method: 'device.clipboard.set', params: { text: 'Tiếng Việt' } },
      { jsonrpc: '2.0', id: 9, method: 'device.clipboard.clear', params: {} },
      { jsonrpc: '2.0', id: 10, method: 'device.screenshot', params: { format: 'jpeg', maxSize: 800 } },
    ]);
    assert.equal(agent.received[7]!.headers['content-length'], String(Buffer.byteLength(agent.received[7]!.body)));
  });
});

test('results come back typed: the agent\'s SHA-256, the dump\'s hierarchy, and the screenshot decoded from base64', async () => {
  const hierarchy = [{ className: 'android.widget.FrameLayout', scrollable: false, children: [] }];
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  await withAgent((request, res) => {
    const results: Record<string, unknown> = {
      'device.version': { dexSha256: '0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f', version: '1.0.14' },
      'device.dump.ui': { hierarchy },
      'device.screenshot': { format: 'jpeg', data: jpeg.toString('base64') },
    };
    answer(results[request.method])(request, res);
  }, async (client) => {
    assert.deepEqual(await client.version(live()), { dexSha256: '0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f' });
    assert.deepEqual(await client.dumpUi(2000, live()), hierarchy);
    assert.deepEqual(await client.screenshot(800, live()), jpeg);
  });
});

test('a JSON-RPC error becomes DEVICE_ERROR with vendorCode agent, keeping only its numeric code, never its message', async () => {
  await withAgent((request, res) => {
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id,
      error: { code: -32000, message: 'no element "Secret Balance 4,210.00"', data: { text: 'Secret Balance' } } }));
  }, async (client, agent) => {
    const error = await client.tap({ x: 1, y: 2 }, live()).then(() => undefined, (thrown: unknown) => thrown);
    assert.ok(error instanceof DeviceAgentError);
    assert.ok(error instanceof DeviceReasonError);
    assert.ok(!(error instanceof OutcomeUnknownError));
    assert.equal(error.code, 'DEVICE_ERROR');
    assert.equal(error.vendorCode, 'agent');
    assert.equal(error.rpcCode, -32000);
    for (const text of [error.message, String(error.stack), inspect(error, { depth: 5 }), JSON.stringify(error)]) {
      assert.equal(text.includes('Secret'), false, text);
    }
    assert.equal(agent.received.length, 1);
  });
});

test('a reply that isn\'t JSON-RPC for this request is DEVICE_ERROR with vendorCode agent and no code', async () => {
  for (const reply of ['not json', JSON.stringify({ jsonrpc: '2.0', id: 999, result: {} }), JSON.stringify({ jsonrpc: '2.0', id: 1 })]) {
    await withAgent((_request, res) => { res.end(reply); }, async (client) => {
      await assert.rejects(client.tap({ x: 1, y: 2 }, live()),
        (error: unknown) => error instanceof DeviceAgentError && error.rpcCode === undefined && !(error instanceof OutcomeUnknownError));
    });
  }
});

test('a result missing what the method returns is DEVICE_ERROR with vendorCode agent', async () => {
  await withAgent(answer({ tree: [] }), async (client) => {
    await assert.rejects(client.dumpUi(2000, live()), DeviceAgentError);
    await assert.rejects(client.version(live()), DeviceAgentError);
    await assert.rejects(client.screenshot(800, live()), DeviceAgentError);
  });
});

test('a request that times out has an unknown outcome and is sent exactly once', async () => {
  await withAgent(() => { /* never answers */ }, async (client, agent) => {
    const started = performance.now();
    await assert.rejects(client.tap({ x: 1, y: 2 }, live()),
      (error: unknown) => error instanceof OutcomeUnknownError && error.vendorCode === 'agent');
    assert.ok(performance.now() - started >= 190);
    await sleep(300);
    assert.equal(agent.received.length, 1);
    assert.equal(agent.connections(), 1);
  }, { timeoutMs: 200 });
});

test('the time limit is 10 s, and the dump\'s is its idle wait plus that', async () => {
  assert.equal(AGENT_REQUEST_TIMEOUT_MS, 10_000);
  await withAgent((request, res) => { setTimeout(() => { answer({ hierarchy: [] })(request, res); }, 350); }, async (client) => {
    assert.deepEqual(await client.dumpUi(300, live()), []);
    await assert.rejects(client.tap({ x: 1, y: 2 }, live()), OutcomeUnknownError);
  }, { timeoutMs: 200 });
});

test('a connection dropped before the reply has an unknown outcome and is not re-sent', async () => {
  await withAgent((_request, _res, req) => { req.socket.destroy(); }, async (client, agent) => {
    await assert.rejects(client.text('hello', live()),
      (error: unknown) => error instanceof OutcomeUnknownError && error.vendorCode === 'agent');
    await sleep(50);
    assert.equal(agent.received.length, 1);
  });
});

test('a connection dropped partway through the reply has an unknown outcome', async () => {
  await withAgent((_request, res) => {
    res.writeHead(200, { 'Content-Length': '500' });
    res.write('{"jsonrpc":"2.0",');
    setTimeout(() => { res.socket?.destroy(); }, 20);
  }, async (client) => {
    await assert.rejects(client.text('hello', live()), OutcomeUnknownError);
  });
});

test('an aborted signal ends a request already sent at once, with an unknown outcome', async () => {
  await withAgent(() => { /* never answers */ }, async (client, agent) => {
    const controller = new AbortController();
    const pending = client.tap({ x: 1, y: 2 }, controller.signal);
    while (agent.received.length === 0) await sleep(5);
    const reason = new Error('cancelled');
    const started = performance.now();
    controller.abort(reason);
    const error = await pending.then(() => undefined, (thrown: unknown) => thrown);
    assert.ok(performance.now() - started < 100);
    assert.ok(error instanceof OutcomeUnknownError);
    assert.equal(error.cause, reason);
    assert.equal(agent.received.length, 1);
  });
});

test('a signal already aborted sends nothing and throws its reason', async () => {
  await withAgent(answer({}), async (client, agent) => {
    const reason = new Error('cancelled');
    await assert.rejects(client.tap({ x: 1, y: 2 }, AbortSignal.abort(reason)), (error: unknown) => error === reason);
    await sleep(20);
    assert.equal(agent.connections(), 0);
  });
});

test('an agent that can\'t be reached is a known DEVICE_ERROR with vendorCode agent: nothing was sent', async () => {
  const server = createServer();
  await new Promise<void>(resolveListening => { server.listen(0, '127.0.0.1', resolveListening); });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>(resolveClosed => { server.close(() => { resolveClosed(); }); });
  await assert.rejects(deviceAgentClient({ port }).version(live()),
    (error: unknown) => error instanceof DeviceAgentError && !(error instanceof OutcomeUnknownError));
});

test('the client refuses, before sending, a body of 1 MiB or more and coordinates that aren\'t whole numbers', async () => {
  await withAgent(answer({}), async (client, agent) => {
    await assert.rejects(client.text('x'.repeat(1024 * 1024), live()), RangeError);
    await assert.rejects(client.tap({ x: 10.5, y: 20 }, live()), TypeError);
    await assert.rejects(client.swipe({ x1: 1, y1: 2, x2: 3, y2: Number.NaN, duration: 1000 }, live()), TypeError);
    await sleep(20);
    assert.equal(agent.connections(), 0);
  });
});
