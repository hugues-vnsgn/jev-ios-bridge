import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { check, json, privateDirectory, readPrivate, sha, same, canonical } from './receipts.mjs';

function heldRead(file, maximum) {
  privateDirectory(path.dirname(file));
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.uid === BigInt(process.getuid()) && (before.mode & 0o777n) === 0o600n
      && before.size <= BigInt(maximum) && before.nlink === 1n, 'READINESS_FILE_UNSAFE');
    const bytes = fs.readFileSync(fd); const after = fs.fstatSync(fd, { bigint: true });
    const current = fs.lstatSync(file, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      check(before[key] === after[key] && after[key] === current[key], 'READINESS_CHANGED');
    }
    return { bytes, sha256: sha(bytes), mtimeMs: Number(before.mtimeNs / 1000000n) };
  } finally { fs.closeSync(fd); }
}
export async function readinessBarrier({ plan, dispatch, row, rowDir, prepared, action, gate }) {
  check(row.artifactManifest && /^[a-f0-9]{64}$/.test(row.artifactManifest.sha256)
    && sha(fs.readFileSync(row.artifactManifest.path)) === row.artifactManifest.sha256, 'ARTIFACT_MANIFEST_BINDING');
  const root = path.join(plan.runsDir, 'observed', row.prepare.actionId, 'allocation');
  const expectedPaths = [path.join(root, 'readiness-1.json'), path.join(root, 'readiness-1.jpg')];
  check(same(prepared.readinessEvidence, expectedPaths), 'READINESS_PATH_BINDING');
  const files = expectedPaths.map((file, i) => ({ file, ...heldRead(file, i === 0 ? 8 * 1024 * 1024 : 10 * 1024 * 1024) }));
  const snapshot = JSON.parse(files[0].bytes.toString('utf8'));
  check(snapshot.deviceId === prepared.device.udid && snapshot.truncated === false && Array.isArray(snapshot.elements), 'READINESS_SNAPSHOT');
  // Initial exposure only. L03 deliberately needs Details absent later; neither that
  // requested precondition nor any future postcondition is required here.
  const initial = row.id === 'L05' ? ['weather.settingsButton', 'weather.locationButton'] : ['home.heading', 'open.details'];
  for (const identifier of initial) {
    const matches = snapshot.elements.filter(e => e.identifier === identifier && e.state?.visible === true
      && e.frame?.width > 0 && e.frame?.height > 0);
    check(matches.length === 1, 'INITIAL_SELECTOR_NOT_UNIQUE_' + identifier);
  }
  const now = Date.now(); const persistedAt = Math.min(...files.map(f => f.mtimeMs));
  check(persistedAt <= now + 1000, 'READINESS_FUTURE_CLOCK');
  // Persistence precedes park; this is a conservative cutoff, not inferred readyAt.
  const deadline = Math.min(now + 240000, persistedAt + 300000 - 15000);
  check(deadline > now, 'READINESS_TTL_MARGIN_EXHAUSTED');
  const binding = { version: 1, row: row.id, dispatchSha256: sha(fs.readFileSync(dispatch)),
    actionId: row.prepare.actionId, allocationId: prepared.allocationId, device: prepared.device.udid,
    preparationSha256: sha(canonical(row.prepare)), actionSha256: sha(canonical(action)),
    appProvenanceSha256: sha(canonical(row.prepare.app)), artifactManifest: row.artifactManifest, initialIdentifiers: initial,
    readinessFiles: files.map(f => ({ path: f.file, sha256: f.sha256 })), deadlineUtc: new Date(deadline).toISOString() };
  json(path.join(rowDir, 'readiness-checkpoint.json'), { status: 'WAITING_FOR_ROOT', ...binding });
  const acceptancePath = path.join(rowDir, 'root-readiness-acceptance.json');
  while (!fs.existsSync(acceptancePath)) {
    gate.check(); check(Date.now() < deadline, 'READINESS_APPROVAL_DEADLINE'); await delay(500);
  }
  const acceptance = readPrivate(acceptancePath);
  check(same(acceptance, { status: 'ROOT_ACCEPTED', ...binding }), 'READINESS_ACCEPTANCE_BINDING');
  check(Date.now() < deadline, 'READINESS_APPROVAL_LATE'); gate.check();
  for (let i = 0; i < files.length; i++) check(heldRead(files[i].file, i === 0 ? 8 * 1024 * 1024 : 10 * 1024 * 1024).sha256 === files[i].sha256, 'READINESS_HASH_CHANGED');
  for (const [file, expected] of Object.entries(plan.fileHashes)) check(sha(fs.readFileSync(file)) === expected, 'ACTION_PIN_VARIANCE');
  check(Date.now() < deadline, 'READINESS_PIN_CHECK_EXHAUSTED_MARGIN');
  json(path.join(rowDir, 'readiness-accepted.json'), { ...acceptance, acceptedAtUtc: new Date().toISOString() });
}
