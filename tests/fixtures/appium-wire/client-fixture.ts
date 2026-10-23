import type { TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VerifiedStack } from '../../../src/appium/stack.js';
import type { OwnerIdentity } from '../../../src/device/admission.js';
import { PrivateAppiumClient, type AppiumComponentRecord } from '../../../src/appium/client.js';
import { createSessionProfile } from '../../../src/appium/session.js';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const owner: OwnerIdentity = { category: 'ios-simulator', device: 'ios-test', attempt: { kind: 'legacy', id: 'run-1' },
  token: 'owner-token', generation: 7, process: { pid: process.pid, incarnation: 'host-test' } };
const sdkRoot = resolve(dirname(fileURLToPath(import.meta.resolve('@modelcontextprotocol/sdk/client/index.js'))), '../../..');
const lock = JSON.parse(readFileSync('stack/package-lock.json', 'utf8'));
const freeze = JSON.parse(readFileSync('stack/freeze.json', 'utf8'));
const sdkFiles: VerifiedStack['manifest']['files'] = {};
function walk(directory: string): void {
  for (const entry of readdirSync(join(sdkRoot, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) sdkFiles['node_modules/@modelcontextprotocol/sdk/' + path] = {
      kind: 'file', sha256: sha(readFileSync(join(sdkRoot, path))), mode: 0o644,
    };
  }
}
walk('');
export function clientFixture(t: TestContext, platform: 'ios' | 'android' = 'ios') {
  const root = mkdtempSync(join(tmpdir(), 'jev-private-client-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const stack: VerifiedStack = { root, nodeModules: join(root, 'node_modules'), wdaRunner: '/verified/wda.app', warnings: [],
    identity: { version: 1, stackSha256: '1'.repeat(64), wdaSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64) },
    manifest: { version: 1, lockSha256: freeze.lockSha256, files: sdkFiles, loaded: Object.keys(sdkFiles),
      packages: [{ path: 'node_modules/@modelcontextprotocol/sdk', name: '@modelcontextprotocol/sdk',
        version: '1.32.1', integrity: lock.packages['node_modules/@modelcontextprotocol/sdk'].integrity,
        integritySource: 'node_modules/@modelcontextprotocol/sdk', resolved: null }], androidApks: freeze.androidApks,
      wda: { version: '16.14.2', path: 'wda/runner.app', treeSha256: '5d1fc1c99908e253303f6de35bf26ed4a74a75817f704e7a3646b72b5271ba04' } } };
  const records: AppiumComponentRecord[] = [];
  const trace = join(root, 'trace.jsonl'); const environment = join(root, 'environment.json');
  const recording = resolve(`tests/fixtures/appium-wire/${platform}/minimal.jsonl`);
  const profile = createSessionProfile(stack, platform === 'ios'
    ? { platform, device: 'ios-test', path: 'run', presentation: 'visible' }
    : { platform, device: 'android-test', path: 'capture', serverInstallation: { kind: 'install' } });
  async function open(fault = 'none', file = recording) {
    const client = await PrivateAppiumClient.open({ stack, owner, homeRoot: join(root, 'homes'), timeoutMs: 20000,
      child: { entrypoint: resolve('tests/fixtures/appium-wire/fake-mcp.ts'), args: [file, fault, trace, environment], nodeArgs: ['--import', import.meta.resolve('tsx')] },
      onComponent: record => { records.push(record); } });
    t.after(() => client.close()); return client;
  }
  const calls = () => existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  return { root, stack, profile, records, trace, environment, recording, open, calls };
}
