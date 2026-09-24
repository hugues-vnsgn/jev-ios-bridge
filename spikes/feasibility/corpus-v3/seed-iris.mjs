#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const profile = process.argv[2];
if (!['summit', 'harbor'].includes(profile)) throw new Error('Usage: seed-iris.mjs summit|harbor (with blank New Contact form open)');
const simulatorId = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const cwd = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const env = { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
delete env.TYPESAFE_API_KEY;

function call(...args) {
  const raw = execFileSync('npx', ['-y', 'mobilebuildmcp@2.7.1', ...args,
    '--simulator-id', simulatorId, '--output', 'json'], { cwd, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const result = JSON.parse(raw);
  if (result.didError) throw new Error(`MobileBuildMCP ${args[0]} ${args[1]} failed: ${result.error ?? 'unknown'}`);
  return result;
}
function targets() { return call('ui-automation', 'snapshot-ui').data.capture.targets.map(row => row.split('|')); }
function findRef(action, name) {
  const row = targets().find(parts => parts[1] === action && [parts[3], parts[4], parts[5]].includes(name));
  if (!row) throw new Error(`Target unavailable: ${action} ${name}`);
  return row[0];
}
function typeField(name, value) {
  call('ui-automation', 'type-text', '--element-ref', findRef('typeText', name), '--text', value, '--replace-existing');
}
function tap(name) { call('ui-automation', 'tap', '--element-ref', findRef('tap', name)); }

typeField('First name', 'Iris');
typeField('Last name', 'Moss');
typeField('Company', profile === 'summit' ? 'Summit' : 'Harbor');
if (profile === 'summit') {
  tap('add email');
  typeField('Email', 'iris.old@example.test');
  for (let index = 1; index <= 6; index++) {
    tap('add phone');
    typeField('Phone', `55501020${String(index).padStart(2, '0')}`);
  }
}
tap('Done');
process.stdout.write(JSON.stringify({ profile, createdName: 'Iris Moss', company: profile === 'summit' ? 'Summit' : 'Harbor',
  uniqueOldEmail: profile === 'summit', syntheticPhoneRows: profile === 'summit' ? 6 : 0 }) + '\n');
