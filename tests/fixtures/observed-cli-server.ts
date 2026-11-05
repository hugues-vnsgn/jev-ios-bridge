import * as fs from 'node:fs/promises';
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCli } from '../../src/cli.js';
import { isObservedCommand } from '../../src/observed/cli.js';
import { allocationFixture } from './observed-allocation-backend.js';
import { appiumObserved, mapPublicFixturePath } from './observed-host/appium-observed.js';

export { mapPublicFixturePath };
export const fixtureObserved = appiumObserved;

export async function setupPublicFixture(root: string, ownership?: { backendRoot: string }) {
  const fixture = await allocationFixture(ownership ? { ownedRoot: ownership.backendRoot } : {});
  const context = { root: fixture.root, home: fixture.home, store: fixture.store, runsDir: fixture.runsDir, app: fixture.app };
  await fs.writeFile(join(root, 'fixture.json'), JSON.stringify(context), { mode: 0o600 });
  return { ...context, request: fixture.request, cleanup: fixture.cleanup, configPath: fixture.configPath, configure: fixture.configure, inventory: fixture.inventory };
}
export const actionRequest = (allocationId: string, actionId = 'one') => ({ version: 1, actionId, allocationId, app: { bundleId: 'org.example.fixture' },
  action: { kind: 'tap', selector: { identifier: 'go' } }, before: { present: [{ identifier: 'go' }] }, after: { present: [{ identifier: 'done' }] }, timeoutMs: 5000 });
export function fixtureCalls(root: string): string[] {
  return existsSync(join(root, 'calls.jsonl')) ? readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as string) : [];
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, command, argument] = process.argv.slice(2);
  if (!root || !command || !isObservedCommand(command)) throw new Error('Invalid fixture invocation');
  const module = fixtureObserved(root, process.env.JEV_EXPERIMENTAL_OBSERVED === '1', process.env.OBSERVED_FIXTURE_MODE);
  if (command === 'observed-report') {
    const inspect = module.inspect.bind(module);
    module.inspect = (id, options) => {
      const result = inspect(id, options);
      if ((options?.waitMs ?? 0) > 0) {
        const marker = join(root, `read-wait-${process.pid}`);
        writeFileSync(marker + '.pending', 'ready', { mode: 0o600 });
        renameSync(marker + '.pending', marker);
      }
      return result;
    };
  }
  await runCli([command, ...(argument ? [argument] : []), '--json', ...(process.argv[5] !== undefined ? ['--wait-ms', process.argv[5]] : [])], { observed: module, projectDir: root });
}
