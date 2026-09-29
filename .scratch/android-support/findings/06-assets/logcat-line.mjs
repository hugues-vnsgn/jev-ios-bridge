// Prototype of a pane parser for `adb logcat -v threadtime,year,uid` lines (the shape format.ts's appLine/osLine have).
// Run: node logcat-line.mjs files...  (files may carry a leading host-ms stamp from stamp.mjs; it is stripped)
import { readFileSync } from 'node:fs';
const LINE = /^\d{4}-\d\d-\d\d (\d\d:\d\d:\d\d\.\d{3})\s+\S+\s+\d+\s+\d+ ([VDIWEFA]) (.*?)\s*: (.*)$/;
export function logcatLine(raw) {
  if (!raw.trim() || raw.startsWith('--------- beginning of')) return undefined;
  const m = raw.match(LINE);
  if (!m) return undefined;
  const [, time, level, tag, message] = m;
  // println and System.err are the app's console, as `[app]` is on iOS; every other tag is structured logging.
  const console_ = tag === 'System.out' || tag === 'System.err';
  return { source: console_ ? 'app' : 'os', time, text: console_ ? message : `[${tag}] ${message}`,
    level: 'EFA'.includes(level) ? 'error' : 'VD'.includes(level) ? 'dim' : 'normal' };
}
if (process.argv[1]?.endsWith('logcat-line.mjs')) {
  for (const file of process.argv.slice(2)) {
    let ok = 0, dropped = 0; const bad = [];
    for (const stamped of readFileSync(file, 'utf8').split('\n')) {
      const raw = stamped.replace(/^\d{13} /, '');
      if (!raw || raw.startsWith('EXIT ') || raw.startsWith('--------- beginning of')) { dropped++; continue; }
      logcatLine(raw) ? ok++ : bad.push(raw);
    }
    console.log(`${file}: parsed=${ok} dividers/exit=${dropped} unparsed=${bad.length}`, bad.slice(0, 2));
  }
}
