import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { parseEnv } from 'node:util';
import { syncBuiltinESMExports } from 'node:module';
import { check, json, makeGate, readPrivate, same, sha } from './receipts.mjs';

const call = readPrivate(process.env.JEV_LIVE_PROCESS_FILE ?? '');
const plan = readPrivate(call.dispatch);
check(sha(fs.readFileSync(call.dispatch)) === call.dispatchSha256 && call.row === 'L04' && call.phase === 'silent'
  && call.legacy === true && plan.legacyException?.status === 'REVIEWED_APPROVED'
  && same(process.argv.slice(2), call.publicArguments) && call.publicArguments[0] === 'run'
  && same(call.publicArguments.slice(2), ['--json', '--no-log-pane', '--no-device-window'])
  && !('TYPESAFE_API_KEY' in process.env) && !('NODE_OPTIONS' in process.env), 'LEGACY_SCOPE_REFUSED');
const gate = makeGate(plan.evidenceDir); gate.check();
let outboundAttempts = 0; let listenerAttempts = 0; let deniedListenerAttempts = 0; let credentialLoaded = false;
function deny() { outboundAttempts++; gate.fail('LEGACY_OUTBOUND_DENIED'); throw new Error('LEGACY_OUTBOUND_DENIED'); }
globalThis.fetch = deny;
http.request = deny; http.get = deny; https.request = deny; https.get = deny;
net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny; tls.connect = deny;
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  listenerAttempts++;
  if (listenerAttempts !== 1 || args.length !== 3 || args[0] !== 0 || args[1] !== '127.0.0.1' || typeof args[2] !== 'function') {
    deniedListenerAttempts++; gate.fail('LEGACY_LISTENER_DENIED'); throw new Error('LEGACY_LISTENER_DENIED');
  }
  return Reflect.apply(originalListen, this, args);
};
syncBuiltinESMExports();
process.once('exit', code => {
  delete process.env.TYPESAFE_API_KEY;
  try { json(path.join(call.receipts, 'legacy-guard-exit.json'), { code, credentialLoaded, outboundAttempts,
    listenerAttempts, deniedListenerAttempts, authenticatedApiCoverage: false }); }
  catch { gate.fail('LEGACY_GUARD_RETENTION'); }
});

const environmentFile = '/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env';
check(plan.legacyException.environmentFile === environmentFile, 'LEGACY_ENV_PATH');
// No content hash, environment dump, key copy, subprocess argument or evidence copy.
// Only the named value enters this process. The original file stays in place.
let cursor = '/';
for (const part of path.dirname(environmentFile).split('/').filter(Boolean)) {
  cursor = path.join(cursor, part); const s = fs.lstatSync(cursor);
  check(s.isDirectory() && !s.isSymbolicLink(), 'LEGACY_ENV_ANCESTOR');
}
const fd = fs.openSync(environmentFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
try {
  const before = fs.fstatSync(fd, { bigint: true });
  check(before.isFile() && before.uid === BigInt(process.getuid()) && (before.mode & 0o777n) === 0o600n
    && before.nlink === 1n && before.size <= 65536n, 'LEGACY_ENV_METADATA');
  const parsed = parseEnv(fs.readFileSync(fd, 'utf8')); const after = fs.fstatSync(fd, { bigint: true });
  const current = fs.lstatSync(environmentFile, { bigint: true });
  for (const key of ['dev', 'ino', 'uid', 'gid', 'mode', 'size', 'nlink', 'mtimeNs', 'ctimeNs']) {
    check(before[key] === after[key] && after[key] === current[key], 'LEGACY_ENV_CHANGED');
  }
  check(typeof parsed.TYPESAFE_API_KEY === 'string' && parsed.TYPESAFE_API_KEY.trim().length > 0, 'LEGACY_CREDENTIAL_MISSING');
  process.env.TYPESAFE_API_KEY = parsed.TYPESAFE_API_KEY; credentialLoaded = true;
} catch {
  gate.fail('LEGACY_CREDENTIAL_LOAD_FAILED'); throw new Error('LEGACY_CREDENTIAL_LOAD_FAILED');
} finally { fs.closeSync(fd); }
