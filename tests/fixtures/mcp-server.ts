import { setTimeout as delay } from 'node:timers/promises';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeService } from '../../src/service.js';
import { createMcpServer } from '../../src/mcp/index.js';

const service = new BridgeService({ baseDir: process.argv[2]!,
  createDriver: () => ({
    async prepare() {},
    async observe() { return { deviceId: 'fixture', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now()+60000,
      elements: [{ref:'text',role:'text',label:'SCREEN_EVIDENCE_MARKER',actions:[]}], truncated: false }; },
    async act() {}, async close() {},
  }),
  createJudge: () => ({ async judge(scenario, _observation, signal) {
    await delay(400, undefined, { signal });
    return { choice:'stop-goal',confidence:1,probabilities:{'stop-goal':1},goalReached:1,
      assertions:Object.fromEntries(scenario.assertions.map(assertion=>[assertion.id,1])),inputTokens:20,latencyMs:400,model:'fixture' };
  } }),
});
serveStdio(() => createMcpServer(service));
process.stdin.once('end',()=>{void service.close();});
process.once('SIGTERM',()=>{void service.close().then(()=>process.exit(0));});
