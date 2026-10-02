// An MCP server with driven mode switched on, a fake two-screen device and a fake Jev: for resolve_step tests.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { Element, Snapshot } from '../../src/contracts/index.js';
import { BridgeService } from '../../src/service.js';
import { createMcpServer } from '../../src/mcp/index.js';
import { fakeDrivenJudge } from './driven-judge.js';

const el = (ref: string, role: string, label: string, actions: string[]): Element => ({ ref, role, label,
  frame: { x: 10, y: 10, width: 100, height: 40 }, state: { enabled: true, visible: true }, actions });
const screens: Record<string, Element[]> = {
  login: [el('t1', 'text', 'Welcome', []), el('b1', 'button', 'Sign in', ['tap'])],
  home: [el('t3', 'text', 'Home', [])],
};
let current = 'login';
let sequence = 0;
const shot = (): Snapshot => ({ deviceId: 'fixture', capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
  sequence: ++sequence, elements: screens[current]!, truncated: false, screenHash: current });

// Driven mode opted in (E13): a project folder inside the run folder, and the experimental switch.
const projectDir = join(process.argv[2]!, 'project');
mkdirSync(join(projectDir, '.jev'), { recursive: true });
writeFileSync(join(projectDir, '.jev', 'config.json'), JSON.stringify({ drivenMode: true }));

const service = new BridgeService({ baseDir: join(process.argv[2]!, 'runs'),
  env: { JEV_PROJECT_DIR: projectDir, JEV_EXPERIMENTAL_DRIVEN: '1' },
  createDriver: () => ({
    async prepare() {},
    async observe() { return shot(); },
    async act(action) { if (action.kind === 'tap' && action.targetRef === 'b1') current = 'home'; return shot(); },
    async close() {},
  }),
  createJudge: () => ({ async judge(assertions) {
    return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, 1])),
      inputTokens: 1, latencyMs: 1, model: 'jev-1.13.0' };
  } }),
  createDrivenJudge: () => fakeDrivenJudge([]),
});
serveStdio(() => createMcpServer(service, { driven: true }));
process.stdin.once('end', () => { void service.close(); });
process.once('SIGTERM', () => { void service.close().then(() => process.exit(0)); });
