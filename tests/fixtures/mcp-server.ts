import { setTimeout as delay } from 'node:timers/promises';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { BridgeService } from '../../src/service.js';
import { createMcpServer } from '../../src/mcp/index.js';

const service = new BridgeService({ baseDir: process.argv[2]!,
  logPane: { cliPath: '/fixture/dist/cli.js', openWindow: false },
  createDriver: () => ({
    async prepare() {},
    async observe() { return { deviceId: 'fixture', sequence: 1, capturedAt: Date.now(), expiresAt: Date.now()+60000,
      elements: [{ref:'text',role:'text',label:'SCREEN_EVIDENCE_MARKER',
        frame:{x:0,y:0,width:100,height:30},state:{visible:true,enabled:true},actions:[]}], truncated: false }; },
    async act() {}, async close() {},
  }),
  createJudge: () => ({ async judge(assertions, _observation, signal) {
    await delay(400, undefined, { signal });
    return { probabilities:Object.fromEntries(assertions.map(assertion=>[assertion.id,1])),
      inputTokens:20,latencyMs:400,model:'jev-1.13.0' };
  } }),
});
serveStdio(() => createMcpServer(service));
process.stdin.once('end',()=>{void service.close();});
process.once('SIGTERM',()=>{void service.close().then(()=>process.exit(0));});
