import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { StackIdentity } from '../../src/appium/stack.js';

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const RELEASE_RUNNER = 'wda/WebDriverAgentRunner-Runner.app/runner';
export const RELEASE_LOADED = 'node_modules/appium-mcp/index.js';

export function stackRelease() {
  const base = mkdtempSync(join(tmpdir(), 'jev-stack-release-'));
  const artifactRoot = join(base, 'artifacts'); const tree = join(base, 'tree');
  const dataRoot = join(base, 'Application Support', 'jev-ios-bridge');
  mkdirSync(artifactRoot); const files: Record<string, { kind: 'file'; sha256: string; mode: number }> = {};
  for (const [path, content] of [[RELEASE_LOADED, 'export const frozen = 1;\n'], [RELEASE_RUNNER, 'qualified runner\n']] as const) {
    mkdirSync(dirname(join(tree, path)), { recursive: true }); writeFileSync(join(tree, path), content);
    chmodSync(join(tree, path), 0o755);
    files[path] = { kind: 'file', sha256: digest(content), mode: 0o755 };
  }
  execFileSync('tar', ['-czf', join(artifactRoot, 'stack.tar.gz'), '-C', tree, 'node_modules']);
  execFileSync('tar', ['-czf', join(artifactRoot, 'wda.tar.gz'), '-C', tree, 'wda']);
  const manifest = { version: 1, lockSha256: digest('lock'), files, loaded: [RELEASE_LOADED], packages: [], androidApks: [],
    wda: { version: '16.14.2', path: 'wda/WebDriverAgentRunner-Runner.app', treeSha256: digest(Buffer.concat([
      Buffer.from('runner\0'), Buffer.from(digest('qualified runner\n'), 'hex'),
    ])) } };
  writeFileSync(join(artifactRoot, 'manifest.json'), JSON.stringify(manifest));
  const identity = { version: 1, stackSha256: digest(readFileSync(join(artifactRoot, 'stack.tar.gz'))),
    wdaSha256: digest(readFileSync(join(artifactRoot, 'wda.tar.gz'))), manifestSha256: digest(readFileSync(join(artifactRoot, 'manifest.json'))) } satisfies StackIdentity;
  return { base, artifactRoot, dataRoot, identity, host: { platform: 'darwin', arch: 'arm64', node: '24.0.0' } };
}
