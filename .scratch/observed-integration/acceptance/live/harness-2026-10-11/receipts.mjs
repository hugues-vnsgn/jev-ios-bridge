import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
export const same = (a, b) => canonical(a) === canonical(b);
export function check(ok, message) { if (!ok) throw new Error(message); }
export function privateDirectory(value, create = false) {
  check(path.isAbsolute(value) && path.resolve(value) === value, 'NONCANONICAL_DIRECTORY');
  let cursor = '/';
  for (const part of value.split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (create && !fs.existsSync(cursor)) fs.mkdirSync(cursor, { mode: 0o700 });
    const s = fs.lstatSync(cursor);
    check(s.isDirectory() && !s.isSymbolicLink(), 'UNSAFE_DIRECTORY');
  }
  const s = fs.lstatSync(value);
  check(s.uid === process.getuid() && (s.mode & 0o777) === 0o700, 'NONPRIVATE_DIRECTORY');
}
export function writeExclusive(file, bytes) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const parent = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
export function json(file, value) { writeExclusive(file, JSON.stringify(value, null, 2) + '\n'); }
export function readPrivate(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    check(s.isFile() && s.uid === process.getuid() && (s.mode & 0o777) === 0o600 && s.size <= 4 * 1024 * 1024, 'UNSAFE_INPUT');
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
}
export function makeGate(directory) {
  const file = path.join(directory, 'STOP.json');
  let failed = false;
  return {
    check() { check(!failed && !fs.existsSync(file), 'RECORDER_GATE_CLOSED'); },
    fail(reason) {
      failed = true;
      try { json(file, { at: new Date().toISOString(), reason: String(reason), descendants: 'unobserved' }); }
      catch { /* The in-memory gate stays closed even if durable retention fails. */ }
    },
  };
}
// Observe real stream bytes. Original consumers receive unchanged data. Synchronous retention
// deliberately adds latency; actual close, never the callback, completes this receipt.
export function recordChild(child, directory, invocation, limits, gate, complete) {
  const begin = Date.now(); const streams = { stdout: [], stderr: [] }; let bytes = 0; let truncated = false;
  const events = []; let escalation;
  function fail(reason) {
    gate.fail(reason);
    try { child.kill('SIGTERM'); } catch {}
    if (!escalation) escalation = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, limits.killGraceMs);
  }
  const timer = setTimeout(() => fail('CHILD_DEADLINE'), limits.childMs);
  for (const name of ['stdout', 'stderr']) {
    check(child[name], 'MISSING_PIPE');
    const originalPush = child[name].push;
    child[name].push = function(chunk, encoding) {
      if (chunk !== null) {
        const b = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, encoding);
        bytes += b.length;
        if (bytes > limits.childBytes) { truncated = true; fail('CHILD_OUTPUT_LIMIT'); }
        else streams[name].push(b);
      }
      return Reflect.apply(originalPush, this, [chunk, encoding]);
    };
  }
  child.once('spawn', () => events.push({ event: 'spawn', at: new Date().toISOString(), pid: child.pid }));
  child.once('error', error => { events.push({ event: 'error', code: error.code ?? null, at: new Date().toISOString() }); gate.fail('CHILD_ERROR'); });
  child.once('exit', (code, signal) => events.push({ event: 'exit', code, signal, at: new Date().toISOString() }));
  child.once('close', (code, signal) => {
    clearTimeout(timer); clearTimeout(escalation);
    const stdout = Buffer.concat(streams.stdout); const stderr = Buffer.concat(streams.stderr);
    const receipt = { ...invocation, events, actualCloseCode: code, actualCloseSignal: signal,
      actualCloseAtUtc: new Date().toISOString(), elapsedMs: Date.now() - begin, truncated,
      stdoutSha256: sha(stdout), stderrSha256: sha(stderr), stdoutBytes: stdout.length, stderrBytes: stderr.length,
      descendants: 'unobserved' };
    try {
      writeExclusive(path.join(directory, 'stdout.bin'), stdout); writeExclusive(path.join(directory, 'stderr.bin'), stderr);
      json(path.join(directory, 'receipt.json'), receipt);
    } catch (error) { gate.fail(error.message); complete({ ...receipt, stdout, stderr, rawReceiptDurablyRetained: false }); return; }
    complete({ ...receipt, stdout, stderr, rawReceiptDurablyRetained: true });
  });
}
