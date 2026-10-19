// Disposable Phase 1 process journal. Never an admission or lease authority.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, openSync, closeSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function journal(directory, operation, value = {}) {
  const root = realpathSync(directory);
  const file = join(root, 'stop-journal.sqlite');
  if (operation === 'initialize') {
    if (!['ios', 'android'].includes(value.platform) || !value.runId || !value.device) throw new Error('INVALID_IDENTITY');
    const fd = openSync(file, 'wx', 0o600); closeSync(fd);
  } else if (!existsSync(file)) throw new Error('STATE_UNAVAILABLE');
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error('STATE_UNAVAILABLE');
  const db = new DatabaseSync(file, { timeout: 5000 });
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
    if (operation === 'initialize') {
      db.exec('CREATE TABLE run (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)');
      const state = { version: 1, ...value, closed: false, outcome: null, commands: [], quarantined: true, leaseReleased: false };
      db.prepare('INSERT INTO run VALUES (1, ?)').run(JSON.stringify(state));
      db.exec('COMMIT'); return state;
    }
    const state = JSON.parse(db.prepare('SELECT state FROM run WHERE id=1').get().state);
    let result;
    if (operation === 'authorize') {
      if (state.closed) result = { accepted: false, reason: 'DISPATCH_CLOSED' };
      else if (state.commands.some(x => x.id === value.id)) result = { accepted: false, reason: 'COMMAND_ALREADY_ISSUED' };
      else if (state.commands.some(x => x.disposition === 'outstanding')) result = { accepted: false, reason: 'COMMAND_OUTSTANDING' };
      else {
        if (!value.id || !value.tool) throw new Error('INVALID_COMMAND');
        state.commands.push({ ...value, disposition: 'outstanding' });
        result = { accepted: true };
      }
    } else if (operation === 'complete') {
      const command = state.commands.find(x => x.id === value.id);
      if (!command) throw new Error('UNKNOWN_COMMAND');
      if (state.closed) result = { accepted: false, reason: 'DISPATCH_CLOSED' };
      else { command.disposition = 'terminal'; result = { accepted: true }; }
    } else if (operation === 'close' || operation === 'recover') {
      state.closed = true;
      state.outcome = 'inconclusive';
      for (const command of state.commands) if (command.disposition === 'outstanding') command.disposition = 'uncertain';
      result = state;
    } else if (operation === 'record-automation-fence') {
      if (!state.closed || value.device !== state.device || !/^[0-9a-f]{64}$/.test(value.receiptSha256 ?? '') || value.hostGroupStopped !== true || value.completeCoverage !== true || value.recordedChildrenStopped !== true || value.ownedAutomationInert !== true || value.automationPortsClosed !== true) result = { accepted: false, reason: 'FENCE_UNPROVEN' };
      else { state.fence = value; for (const command of state.commands) if (command.disposition === 'uncertain') command.disposition = 'fenced'; result = { accepted: true }; }
    } else if (operation === 'record-fence') {
      if (!state.closed || value.device !== state.device || !/^[0-9a-f]{64}$/.test(value.receiptSha256 ?? '') ||
          value.hostGroupStopped !== true || value.deviceOffline !== true || value.ownedPortsClosed !== true) {
        result = { accepted: false, reason: 'FENCE_UNPROVEN' };
      } else {
        state.fence = value;
        for (const command of state.commands) if (command.disposition === 'uncertain') command.disposition = 'fenced';
        result = { accepted: true };
      }
    } else if (operation === 'inspect') result = state;
    else throw new Error('INVALID_OPERATION');
    db.prepare('UPDATE run SET state=? WHERE id=1').run(JSON.stringify(state));
    db.exec('COMMIT'); return result;
  } finally { db.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(journal(process.argv[2], process.argv[3], JSON.parse(process.argv[4] ?? '{}')))); }
  catch (error) { console.error(String(error)); process.exitCode = 1; }
}
