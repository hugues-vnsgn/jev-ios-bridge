// Measure the code loaded through public appium-mcp/core before any session.
import { registerHooks } from 'node:module';
import { readFileSync, realpathSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const root = fileURLToPath(new URL('../../', import.meta.url));
const candidate = join(root, 'candidate-stack');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = JSON.parse(readFileSync(join(root, 'evidence/phase1-freeze-20261018.json'), 'utf8'));
const selection = frozen.selection;
const wda = frozen.wda;
const names = new Set(selection.packages.map(p => p.name));
const files = new Map();
const hook = registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.startsWith('file:')) return result;
  const path = fileURLToPath(url);
  if (!path.startsWith(candidate + '/node_modules/')) return result;
  let parent = dirname(path), pkg, packagePath;
  while (parent.startsWith(candidate + '/node_modules/')) {
    try { pkg = JSON.parse(readFileSync(join(parent, 'package.json'), 'utf8')); if (pkg.name) { packagePath = parent; break; } parent = dirname(parent); } catch { parent = dirname(parent); }
  }
  if (pkg && names.has(pkg.name)) files.set(relative(candidate, path), { path: relative(candidate, path), packagePath: relative(candidate, packagePath), name: pkg.name, version: pkg.version, sha256: sha256(readFileSync(path)) });
  return result;
} });
const publicCore = await import('appium-mcp/core');
await import('@modelcontextprotocol/sdk/client/index.js');
const core = new publicCore.AppiumMcpCore();
if (core.listSessions().length !== 0) throw new Error('UNEXPECTED_SESSION');
hook.deregister();
const lockBytes = readFileSync(join(candidate, 'package-lock.json'));
if (sha256(lockBytes) !== selection.lockfileSha256) throw new Error('LOCK_MISMATCH');
const packages = selection.packages.map(expected => {
  const actual = JSON.parse(readFileSync(join(candidate, expected.path, 'package.json'), 'utf8'));
  if (actual.name !== expected.name || actual.version !== expected.version) throw new Error('PACKAGE_MISMATCH');
  return { ...expected, packageJsonSha256: sha256(readFileSync(join(candidate, expected.path, 'package.json'))) };
});
const selectedWda = join(root, 'runtime/wda-16.14.2/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app');
if (realpathSync(wda.runtimePath) !== realpathSync(selectedWda)) throw new Error('WDA_SELECTION_MISMATCH');
const actualFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) actualFiles.push({ path: relative(selectedWda, path), sha256: sha256(readFileSync(path)) });
    else throw new Error('WDA_NON_FILE');
  }
}
walk(selectedWda);
actualFiles.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
if (!isDeepStrictEqual(actualFiles, wda.files.map(x => ({ path: x.path, sha256: x.sha256 })).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))))) throw new Error('WDA_HASH_MISMATCH');
const measuredTree = sha256(Buffer.concat(actualFiles.map(x => Buffer.concat([Buffer.from(x.path + '\0'), Buffer.from(x.sha256, 'hex')]))));
if (measuredTree !== wda.treeSha256) throw new Error('WDA_TREE_MISMATCH');
const loaded = { method: 'node:module.registerHooks public core import, plus public MCP client import, before session creation', files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) };
export const stack = { extensionVersion: 1, wrapper: selection.wrapper, lockfileSha256: sha256(lockBytes), packages, loaded, wda: { packageVersion: wda.packageVersion, relativePath: relative(root, selectedWda), treeSha256: measuredTree, architectures: wda.architectures, signing: wda.signing }, nativeSessionsCreated: 0, nativeInputAttempts: 0 };
export { publicCore };
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(stack, null, 2));
