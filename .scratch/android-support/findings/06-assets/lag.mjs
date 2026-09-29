// Lag of "tick N epochMs=X" lines: host arrival ms - (device ms + clock offset). Usage: node lag.mjs <offsetMs> files...
import { readFileSync } from 'node:fs';
const [offset, ...files] = process.argv.slice(2);
for (const file of files) {
  const lags = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^(\d+) .*"?tick \d+ epochMs=(\d+)/);
    if (m) lags.push(Number(m[1]) - (Number(m[2]) - Number(offset)));
  }
  lags.sort((a, b) => a - b);
  const q = p => lags[Math.min(lags.length - 1, Math.floor(p * lags.length))];
  console.log(`${file}: n=${lags.length} min=${lags[0]} median=${q(0.5)} p90=${q(0.9)} max=${lags[lags.length - 1]}`);
}
