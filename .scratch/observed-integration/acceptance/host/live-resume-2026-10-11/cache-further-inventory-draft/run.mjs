// Disabled unless the sole operator supplies the exact reviewed enable argument.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordCommand, writeNew } from './commands.mjs';

if (process.argv.length !== 3 || process.argv[2] !== '--read-only-once-after-root-review'
    || process.getuid() !== 501 || process.getgid() !== 20) throw new Error('Unapproved command/account');
const directory = dirname(fileURLToPath(import.meta.url));
const konan = '/Users/hugues_mini/.konan';
const otherRoots = [
  '/Users/hugues_mini/.gradle/caches/build-cache-1',
  '/Users/hugues_mini/.gradle/caches/9.6.1',
  '/Users/hugues_mini/Library/Caches/org.swift.swiftpm',
  '/Users/hugues_mini/.npm/_cacache',
  '/Users/hugues_mini/.cache/uv',
  '/Users/hugues_mini/.cache/bazel-repo-contents-cache',
  '/Users/hugues_mini/.cache/bazel-repo-cache',
  '/Users/hugues_mini/.cache/huggingface',
];
const at = () => new Date().toISOString();
const metadata = [];
const facts = s => Object.fromEntries(['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink'].map(k => [k, String(s[k])])
  .concat([['mtime_ns', String(s.mtimeNs)], ['ctime_ns', String(s.ctimeNs)],
    ['type', s.isDirectory() ? 'directory' : s.isFile() ? 'file' : s.isSymbolicLink() ? 'symlink' : 'special']]));
const check = (ok, message) => { if (!ok) throw new Error(message); };
async function stat(path) {
  const event = { path, startedAtUtc: at() }; metadata.push(event);
  try { const s = await fs.lstat(path, { bigint: true }); event.settledAtUtc = at(); event.facts = facts(s); return s; }
  catch (e) { event.settledAtUtc = at(); event.error = { name: e.name, message: e.message, code: e.code ?? null }; throw e; }
}
async function checkedDirectory(path, privateMode = false) {
  let cursor = '/';
  for (const part of path.split('/').filter(Boolean)) {
    cursor = join(cursor, part); const s = await stat(cursor);
    check(s.isDirectory() && !s.isSymbolicLink(), 'Symlink/nondirectory ancestor: ' + cursor);
  }
  const s = await stat(path);
  check(s.uid === 501n && (!privateMode || (s.mode & 0o7777n) === 0o700n), 'Unexpected directory owner/mode');
  return facts(s);
}
await checkedDirectory(directory, true);
for (const file of ['run.mjs', 'commands.mjs']) {
  const s = await stat(join(directory, file));
  check(s.isFile() && !s.isSymbolicLink() && s.uid === 501n && (s.mode & 0o7777n) === 0o600n, 'Nonprivate script');
}
await writeNew('inventory-claimed.json', { claimedAtUtc: at(), nativeCommandBudget: 4,
  scope: { shallowRoot: konan, maxImmediateChildren: 512, otherRoots },
  enableArgument: '--read-only-once-after-root-review', sourceMutations: 0 });

async function shallow() {
  const before = await checkedDirectory(konan);
  const held = await fs.open(konan, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const entries = [];
  try {
    check(JSON.stringify(facts(await held.stat({ bigint: true }))) === JSON.stringify(before), 'Root changed before enumeration');
    const dir = await fs.opendir(konan);
    for await (const entry of dir) {
      check(entries.length < 512, 'Immediate-child bound exceeded');
      const path = join(konan, entry.name);
      entries.push({ name: entry.name, ...facts(await stat(path)) });
    }
    const after = facts(await stat(konan));
    check(JSON.stringify(before) === JSON.stringify(after)
      && JSON.stringify(facts(await held.stat({ bigint: true }))) === JSON.stringify(before), 'Root changed during enumeration');
    return { root: konan, before, after, children: entries.sort((a, b) => a.name.localeCompare(b.name)),
      qualification: 'Immediate names and lstat metadata only; leaf symlinks are recorded, never followed. No contents read.' };
  } finally { await held.close(); }
}
function lsofClass(o) {
  const r = o.receipt;
  if (r.error || r.stopped || r.signal !== null || !r.captureComplete || o.stderr.length || ![0, 1].includes(r.exitCode)) return 'PROBE_INCOMPLETE';
  if (!o.stdout.length) return r.exitCode === 1 ? 'NO_MATCH_OBSERVED' : 'PROBE_INCOMPLETE';
  const text = o.stdout.toString('utf8');
  if (text.includes('\ufffd') || !text.endsWith('\0\n') || r.exitCode !== 0) return 'PROBE_INCOMPLETE';
  let process = false, file = false, files = 0;
  for (let field of text.split('\0')) {
    if (field.startsWith('\n')) field = field.slice(1);
    if (!field) continue;
    const tag = field[0], value = field.slice(1);
    if (tag === 'p' && /^\d+$/.test(value)) { process = true; file = false; }
    else if (tag === 'c' && process && value) {}
    else if (tag === 'f' && process && value) { file = true; files++; }
    else if (tag === 'n' && file && value) {}
    else return 'PROBE_INCOMPLETE';
  }
  return files ? 'OPEN_FILES_OBSERVED' : 'PROBE_INCOMPLETE';
}
let result;
const observations = [];
try {
  await writeNew('konan-shallow.json', await shallow());
  const first = await recordCommand('konan-du', ['/usr/bin/du', '-k', '-d', '1', '-P', '-x', konan], { timeoutMs: 180000, cap: 131072 });
  observations.push({ name: 'konan-du', ok: first.ok && first.stderr.length === 0 });
  check(first.ok && first.stderr.length === 0, 'Konan du refused/incomplete; raw receipt retained');
  const ps = await recordCommand('process-names', ['/bin/ps', '-axo', 'uid=,comm='], { timeoutMs: 30000, cap: 1048576 });
  check(ps.ok && ps.stderr.length === 0, 'Process snapshot refused/incomplete');
  const lines = ps.stdout.toString('utf8').split('\n').filter(line => line.trim());
  check(lines.length > 0 && !ps.stdout.toString('utf8').includes('\ufffd'), 'Empty/invalid process snapshot');
  const entries = lines.map(line => { const m = /^\s*([+-]?\d+)\s+(.+?)\s*$/.exec(line); check(m, 'Unparsed process row'); return { uid: m[1], executableName: m[2] }; });
  await writeNew('process-names-result.json', { entries, argumentsRequested: false,
    qualification: 'Executable names only; Java presence alone does not establish a selected cache is active.' });
  const before = await checkedDirectory(konan);
  const activity = await recordCommand('konan-open-files', ['/usr/sbin/lsof', '-nP', '-F0pcfn', '+D', konan], { timeoutMs: 180000, cap: 2097152 });
  const after = await checkedDirectory(konan);
  const classification = JSON.stringify(before) === JSON.stringify(after) ? lsofClass(activity) : 'PROBE_INCOMPLETE';
  observations.push({ name: 'konan-open-files', classification, before, after });
  await writeNew('konan-open-files-result.json', observations.at(-1));
  check(classification !== 'PROBE_INCOMPLETE', 'Konan activity refused/incomplete');
  for (const path of otherRoots) await checkedDirectory(path);
  const du = await recordCommand('other-eight-du', ['/usr/bin/du', '-sk', '-P', '-x', ...otherRoots], { timeoutMs: 180000, cap: 131072 });
  observations.push({ name: 'other-eight-du', ok: du.ok && du.stderr.length === 0 });
  check(du.ok && du.stderr.length === 0, 'Other-root du refused/incomplete; raw receipt retained');
  result = { status: 'READ_ONLY_FURTHER_INVENTORY_COMPLETE', observations };
} catch (e) {
  result = { status: 'READ_ONLY_FURTHER_INVENTORY_STOPPED', error: { name: e.name, message: e.message, code: e.code ?? null }, observations };
}
Object.assign(result, { completedAtUtc: at(), metadata, sourceMutations: 0, sourceContentsRead: 0,
  archives: 0, removals: 0, builds: 0, lsofOtherRoots: 0, operatorState: 'IDLE_FOR_ROOT_AUDIT',
  qualification: 'Names/allocated blocks and momentary open-file observations do not prove regeneration safety or reclaimable capacity. No retirement is authorized. Nofollow ancestor checks and held-root comparisons do not provide atomic traversal against concurrent namespace changes; filesystem calls are awaited without claiming cancellability. Direct child close only; descendants unobserved.' });
await writeNew('inventory-result.json', result);
await new Promise(done => process.stdout.write(JSON.stringify({ status: result.status, observations: observations.length }) + '\n', done));
process.exitCode = result.status === 'READ_ONLY_FURTHER_INVENTORY_COMPLETE' ? 0 : 3;
