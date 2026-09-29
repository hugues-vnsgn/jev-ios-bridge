// Poll `adb shell pidof <pkg>` every 100 ms; print each change with host ms and the call's duration.
import { execFileSync } from 'node:child_process';
const [pkg, forMs] = process.argv.slice(2);
const adb = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
let last; const end = Date.now() + Number(forMs); const costs = [];
while (Date.now() < end) {
  const began = Date.now();
  let out = '';
  try { out = execFileSync(adb, ['-s', 'emulator-5554', 'shell', 'pidof', pkg], { encoding: 'utf8' }).trim(); } catch { out = ''; }
  costs.push(Date.now() - began);
  if (out !== last) { console.log(`${began} pidof=${out || '(none)'}`); last = out; }
  const wait = 100 - (Date.now() - began); if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
}
costs.sort((a, b) => a - b);
console.log(`calls=${costs.length} median_ms=${costs[costs.length >> 1]} max_ms=${costs[costs.length - 1]}`);
