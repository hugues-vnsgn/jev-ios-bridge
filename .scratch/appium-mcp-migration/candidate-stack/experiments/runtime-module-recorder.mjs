// Record every vendor module actually loaded, including session-time imports.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export function recordRuntimeModules(candidate) {
  const lock = JSON.parse(readFileSync(join(candidate, 'package-lock.json'), 'utf8'));
  const files = new Map();
  registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith('file:')) return result;
    const path = fileURLToPath(url);
    if (!path.startsWith(candidate + '/node_modules/')) return result;
    let parent = dirname(path), pkg;
    while (parent.startsWith(candidate + '/node_modules/')) {
      try { pkg = JSON.parse(readFileSync(join(parent, 'package.json'), 'utf8')); if (pkg.name) break; } catch {}
      parent = dirname(parent);
    }
    if (!pkg?.name) throw new Error('LOADED_PACKAGE_UNATTRIBUTABLE');
    const packagePath = relative(candidate, parent), expected = lock.packages[packagePath];
    if (!expected || expected.version !== pkg.version) throw new Error('LOADED_PACKAGE_VERSION_MISMATCH');
    files.set(relative(candidate, path), { path: relative(candidate, path), packagePath, name: pkg.name, version: pkg.version,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), archive: expected });
    return result;
  } });
  return () => ({ version: 1, allLoadedVendorFiles: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), lockfileSha256: createHash('sha256').update(readFileSync(join(candidate, 'package-lock.json'))).digest('hex') });
}
