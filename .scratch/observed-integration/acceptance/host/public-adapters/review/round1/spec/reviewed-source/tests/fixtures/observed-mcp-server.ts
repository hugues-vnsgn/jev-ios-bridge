import assert from 'node:assert/strict';
import { BridgeService } from '../../src/service.js';
import { runCli } from '../../src/cli.js';
import { fixtureObserved } from './observed-cli-server.js';
const root = process.argv[2]!;
const observed = fixtureObserved(root, process.env.JEV_EXPERIMENTAL_OBSERVED === '1', process.env.OBSERVED_FIXTURE_MODE);
const legacy = new BridgeService({ baseDir: root, createDriver: () => assert.fail('No scenario driver'), createJudge: () => assert.fail('No SDK construction') });
await runCli(['mcp'], { observed, legacy, projectDir: root });
