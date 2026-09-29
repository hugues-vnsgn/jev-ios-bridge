// Prototype of the Android driver's app-exit watcher: fold `logcat -b events` am_* lines for one package and
// the launched pid into a synchronous state, the way appRunning() would read it.
// Run: node exit-watch.mjs <package> <pid> <events or all.log>
import { readFileSync } from 'node:fs';
export function watcher(pkg, pid) {
  const state = { running: true, cause: undefined, at: undefined };
  const fields = (raw, tag) => raw.match(new RegExp(`\\b${tag}\\s*: \\[(.*)\\]$`))?.[1].split(',');
  return {
    state,
    feed(raw, at) {
      if (!state.running && state.cause !== 'anr') return;
      let f;
      if ((f = fields(raw, 'am_crash')) && f[2] === pkg && (f[0] === String(pid) || f[4] === 'Native crash'))
        Object.assign(state, { running: false, cause: f[4] === 'Native crash' ? 'native-crash' : 'crash', at });
      else if ((f = fields(raw, 'am_anr')) && f[1] === String(pid)) Object.assign(state, { cause: 'anr', at });
      else if ((f = fields(raw, 'am_kill')) && f[1] === String(pid))
        Object.assign(state, { running: false, cause: /^stop /.test(f[4]) ? 'force-stopped' : 'killed', at });
      else if ((f = fields(raw, 'am_proc_died')) && f[1] === String(pid))
        Object.assign(state, { running: false, cause: state.cause ?? 'exited', at });
    },
  };
}
if (process.argv[1]?.endsWith('exit-watch.mjs')) {
  const [pkg, pid, file] = process.argv.slice(2);
  const w = watcher(pkg, Number(pid));
  for (const line of readFileSync(file, 'utf8').split('\n')) w.feed(line.replace(/^\d{13} /, ''), Number(line.slice(0, 13)));
  console.log(JSON.stringify(w.state));
}
