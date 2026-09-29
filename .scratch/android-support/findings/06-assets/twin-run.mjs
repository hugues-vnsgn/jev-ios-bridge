// Drive the Android twin app's order flow like a bridge run, disrupting it mid-run, and record what each
// signal shows and when. Usage: node twin-run.mjs <label> <none|amcrash|segv|kill9|forcestop|home>
// Output: /tmp/jev-06/twin-<label>/ (uid.log, crash.log, events.log, pidof.log, steps.json, exit-info.txt)
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
const [label, disrupt] = process.argv.slice(2);
const OUT = `/tmp/jev-06/twin-${label}`; mkdirSync(OUT, { recursive: true });
const ADB = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const env = { ...process.env, ANDROID_ADB_SERVER_PORT: '5098' };
const PKG = 'dev.jevbridge.diagnostic';
const here = new URL('.', import.meta.url).pathname;
const adb = (...args) => execFileSync(ADB, ['-s', 'emulator-5554', ...args], { env, encoding: 'utf8' }).replace(/\r/g, '').trim();
const now = () => Date.now();
const steps = [];
const note = (what, extra = {}) => { const entry = { at: now(), what, ...extra }; steps.push(entry); console.log(JSON.stringify(entry)); };

function dump() {
  const out = execFileSync(`${here}mcli.sh`, ['dump', 'ui', '--device', 'Medium_Phone_API_36.1', '--format', 'raw'], { env, encoding: 'utf8' });
  const tree = JSON.parse(JSON.parse(out).data.rawData);
  const nodes = []; const walk = n => { nodes.push(n); (n.children ?? []).forEach(walk); }; tree.hierarchy.forEach(walk);
  return nodes;
}
function tapId(nodes, id) {
  const n = nodes.find(x => x['resource-id'] === id);
  if (!n) return false;
  adb('shell', 'input', 'tap', String(n.rect.x + (n.rect.width >> 1)), String(n.rect.y + (n.rect.height >> 1)));
  return true;
}
// Each stream and the pidof poller run in their own node process, so this script's blocking calls
// can't delay their arrival stamps.
function stream(name, args) {
  const child = spawn('node', [`${here}stamp.mjs`, `${OUT}/${name}`, ADB, '-s', 'emulator-5554', ...args], { env, stdio: 'ignore' });
  return () => child.kill('SIGTERM');
}

const uid = adb('shell', 'cmd', 'package', 'list', 'packages', '-U').split('\n')
  .map(l => l.match(/^package:(\S+) uid:(\d+)/)).find(m => m && m[1] === PKG)[2];
adb('shell', 'am', 'force-stop', PKG);
const start = adb('shell', 'date', '+%s.%3N');
const stops = [
  stream('uid.log', ['logcat', '-v', 'threadtime,year,uid', `--uid=${uid}`, '-T', start]),
  stream('crash.log', ['logcat', '-b', 'crash', '-v', 'threadtime,year,uid', '-T', start]),
  stream('events.log', ['logcat', '-b', 'events', '-v', 'threadtime,year', '-T', start,
    'am_proc_start:I', 'am_proc_died:I', 'am_crash:I', 'am_anr:I', 'am_kill:I', '*:S']),
];
const poller = spawn('node', [`${here}poll-pidof.mjs`, PKG, '60000'], { env, stdio: ['ignore', openSync(`${OUT}/pidof.log`, 'w'), 'ignore'] });
await new Promise(r => setTimeout(r, 1500)); // let the streams attach before launching

note('launch', { out: adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`).split('\n').filter(l => /Status|TotalTime/.test(l)) });
const pid = adb('shell', 'pidof', PKG); note('pid', { pid });
let nodes = dump(); note('dump', { n: nodes.length });
note('tap choose.apple', { ok: tapId(nodes, 'choose.apple') });
await new Promise(r => setTimeout(r, 500));
if (disrupt !== 'none') {
  const cmd = { amcrash: ['shell', 'am', 'crash', PKG], segv: ['shell', 'run-as', PKG, 'kill', '-SEGV', pid],
    kill9: ['shell', 'run-as', PKG, 'kill', '-9', pid], forcestop: ['shell', 'am', 'force-stop', PKG],
    home: ['shell', 'input', 'keyevent', 'KEYCODE_HOME'] }[disrupt];
  note(`disrupt ${disrupt}`, { out: adb(...cmd) });
}
for (const id of ['choose.bread', 'order.complete']) {
  try { nodes = dump(); const ok = tapId(nodes, id); note(`tap ${id}`, { ok, n: nodes.length,
    ids: ok ? undefined : nodes.map(n => n['resource-id'] || n.text).filter(Boolean).slice(0, 12) }); }
  catch (e) { note(`step ${id} threw`, { error: String(e.message).slice(0, 200) }); }
}
try { nodes = dump(); note('final', { total: nodes.find(n => n['resource-id'] === 'confirmation.total')?.text ?? null }); }
catch (e) { note('final threw', { error: String(e.message).slice(0, 200) }); }
note('pidof at end', { pid: (() => { try { return adb('shell', 'pidof', PKG); } catch { return '(none)'; } })() });
note('top activity', { top: adb('shell', 'dumpsys activity activities | grep -E "topResumedActivity|ResumedActivity:" | head -2') });
await new Promise(r => setTimeout(r, 2000));
poller.kill('SIGTERM'); stops.forEach(s => s());
writeFileSync(`${OUT}/exit-info.txt`, adb('shell', `dumpsys activity exit-info ${PKG} | head -12`));
writeFileSync(`${OUT}/steps.json`, JSON.stringify(steps, null, 1));
await new Promise(r => setTimeout(r, 300)); process.exit(0);
