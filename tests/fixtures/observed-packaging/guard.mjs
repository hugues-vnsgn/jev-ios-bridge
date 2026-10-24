// Installed smoke safety: record and reject account admission, SDK construction,
// and subprocess/device effects. No production module is replaced with a fake service.
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import * as fs from 'node:fs';
import childProcess from 'node:child_process';
const log = process.env.JEV_PACKAGING_GUARD_LOG;
globalThis.__jevPackagingForbidden = name => {
  fs.appendFileSync(log, JSON.stringify({ forbidden: name }) + '\n', { mode: 0o600 });
  throw new Error('Installed smoke attempted forbidden effect: ' + name);
};
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[name] = () => globalThis.__jevPackagingForbidden('child_process.' + name);
}
syncBuiltinESMExports();
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (result.format !== 'module' || !url.includes('/dist/')) return result;
    let source = result.source.toString();
    if (url.endsWith('/device/admission.js')) {
      const pattern = 'static open() {';
      if (!source.includes(pattern)) throw new Error('Admission safety guard no longer matches installed module');
      source = source.replace(pattern, pattern + ' globalThis.__jevPackagingForbidden("Admission.open");');
    }
    source = source.replaceAll('new TypeSafeClient(', 'new (class { constructor() { globalThis.__jevPackagingForbidden("TypeSafeClient"); } })(');
    if (url.endsWith('/device/index.js')) {
      const pattern = 'constructor(options';
      if (!source.includes(pattern)) throw new Error('Driver safety guard no longer matches installed module');
      // Driver construction also reaches subprocess guards; trap it at its first statement.
      source = source.replace(/constructor\(options[^)]*\) \{/, '$& globalThis.__jevPackagingForbidden("MobileBuildMcpDriver");');
    }
    if (url.endsWith('/dist/appium/driver.js')) {
      const pattern = /export class AppiumDriver \{[^]*?constructor\(options\) \{/;
      if (!pattern.test(source)) throw new Error('Appium driver safety guard no longer matches installed module');
      source = source.replace(pattern, '$& globalThis.__jevPackagingForbidden("AppiumDriver");');
    }
    if (url.endsWith('/dist/appium/stack.js')) {
      // shipped() extracts into the real account's Application Support; forTesting stays open for offlineStack.
      const pattern = 'static shipped() {';
      if (!source.includes(pattern)) throw new Error('Stack safety guard no longer matches installed module');
      source = source.replace(pattern, pattern + ' globalThis.__jevPackagingForbidden("FrozenStack.shipped");');
    }
    return { ...result, source };
  },
});
