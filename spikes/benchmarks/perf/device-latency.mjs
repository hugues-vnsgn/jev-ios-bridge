// Per-command latency: `npx --yes mobilebuildmcp@2.7.1` vs the resolved local CLI.
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const UDID = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const CLI = process.env.MBM_CLI ?? (process.env.HOME + '/.npm/_npx/b998b4270960e258/node_modules/mobilebuildmcp/build/cli.js');
const REPO = process.env.REPO ?? process.cwd();
const N = Number(process.env.N ?? 10);
const env = { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
const variants = {
  npx: args => ['npx', ['--yes', 'mobilebuildmcp@2.7.1', ...args]],
  direct: args => [process.execPath, [CLI, ...args]],
};
const run = (variant, args) => new Promise((res) => {
  const [cmd, argv] = variants[variant](args);
  const t = performance.now();
  execFile(cmd, argv, { cwd: REPO, env, maxBuffer: 16 << 20 }, (err, stdout) =>
    res({ ms: performance.now() - t, ok: !err, stdout }));
});
const results = [];
const record = (op, variant, r) => { results.push({ op, variant, ms: +r.ms.toFixed(1), ok: r.ok }); if (!r.ok) console.error('FAIL', op, variant, r.stdout.slice(0, 300)); };
const ui = (...a) => ['ui-automation', ...a, '--simulator-id', UDID, '--output', 'json'];

await run('direct', ['simulator', 'launch-app', '--simulator-id', UDID, '--bundle-id', 'dev.jevbridge.diagnostic', '--output', 'json']);
const ops = {
  version: () => ['--version'],
  snapshotCompact: () => ui('snapshot-ui'),
  snapshotFull: () => ui('snapshot-ui', '--verbose'),
  screenshot: () => ui('screenshot', '--return-format', 'path'),
};
for (let i = 0; i < N; i++) {
  for (const [op, args] of Object.entries(ops)) {
    for (const v of i % 2 ? ['npx', 'direct'] : ['direct', 'npx']) record(op, v, await run(v, args()));
  }
  // tap: fresh compact snapshot (untimed, direct) to get a live ref, then timed tap
  for (const v of i % 2 ? ['npx', 'direct'] : ['direct', 'npx']) {
    await run('direct', ['simulator', 'launch-app', '--simulator-id', UDID, '--bundle-id', 'dev.jevbridge.diagnostic', '--output', 'json']);
    await new Promise(r => setTimeout(r, 1000));
    const snap = await run('direct', ui('snapshot-ui'));
    const rows = JSON.parse(snap.stdout).data.capture.targets ?? [];
    const row = rows.find(r => r.endsWith('|choose.apple')) ?? rows.find(r => r.includes('choose.'));
    if (!row) { console.error('no tap target'); continue; }
    record('tap', v, await run(v, ui('tap', '--element-ref', row.split('|')[0])));
  }
  process.stderr.write(`round ${i + 1}/${N}\n`);
}
await run('direct', ['simulator', 'stop', '--simulator-id', UDID, '--bundle-id', 'dev.jevbridge.diagnostic', '--output', 'json']);
writeFileSync(process.env.OUT ?? '/tmp/jev-perf/results.json', JSON.stringify({ at: new Date().toISOString(), N, node: process.version, results }, null, 1));
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const op of [...Object.keys(ops), 'tap']) {
  const m = v => results.filter(r => r.op === op && r.variant === v && r.ok).map(r => r.ms);
  const a = m('npx'), b = m('direct');
  console.log(`${op.padEnd(16)} npx med ${med(a)?.toFixed(0)} (min ${Math.min(...a).toFixed(0)}, n=${a.length})  direct med ${med(b)?.toFixed(0)} (min ${Math.min(...b).toFixed(0)}, n=${b.length})  saved ${(med(a) - med(b)).toFixed(0)} ms`);
}
