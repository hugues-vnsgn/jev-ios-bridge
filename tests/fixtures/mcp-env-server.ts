/** An MCP server whose fake device has one text field: typing into it shows the typed text on screen, so a
 *  typed value reaches every surface a run writes. Reads `fromEnv` values from its own environment. */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { Element, Snapshot } from '../../src/contracts/index.js';
import { BridgeService } from '../../src/service.js';
import { createMcpServer } from '../../src/mcp/index.js';

const element = (ref: string, role: string, label: string, actions: string[] = []): Element => ({ ref, role, label,
  identifier: ref, actions, frame: { x: 0, y: 0, width: 100, height: 30 }, state: { visible: true, enabled: true } });
const screen = (elements: Element[]): Snapshot => ({ deviceId: 'fixture', sequence: 1, capturedAt: Date.now(),
  expiresAt: Date.now() + 60_000, truncated: false, elements });

const service = new BridgeService({ baseDir: process.argv[2]!,
  createDriver: () => {
    let typed: string | undefined;
    const current = () => screen(typed === undefined ? [element('password-field', 'text-field', 'Password', ['typeText'])]
      : [element('marker', 'text', 'SCREEN_EVIDENCE_MARKER'), element('greeting', 'text', `Welcome ${typed}`)]);
    return { async prepare() {}, async observe() { return current(); },
      async act(action, _snapshot, context) {
        if (action.kind === 'type') typed = context.values[action.valueKey];
        return { screen: current(), shownValue: typed ?? '' };
      }, async close() {} };
  },
  createJudge: () => ({ async judge(assertions) {
    return { probabilities: Object.fromEntries(assertions.map(assertion => [assertion.id, 1])),
      inputTokens: 20, latencyMs: 1, model: 'jev-1.13.0' };
  } }),
});
serveStdio(() => createMcpServer(service));
process.stdin.once('end', () => { void service.close(); });
process.once('SIGTERM', () => { void service.close().then(() => process.exit(0)); });
