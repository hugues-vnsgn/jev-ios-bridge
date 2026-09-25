import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../../dist/device/index.js';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../..');
const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const [operation, ...args] = process.argv.slice(2);
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');

function call(...command) {
  const output = execFileSync('npx', ['-y', 'mobilebuildmcp@2.7.1', ...command,
    '--simulator-id', udid, '--output', 'json'], {
    cwd: root, env: { ...process.env, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' },
    encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  });
  const result = JSON.parse(output);
  if (result.didError || result.data?.summary?.status === 'FAILED') {
    throw new Error(JSON.stringify({ error: result.error, summary: result.data?.summary }));
  }
  return { result, output };
}

function snapshot() {
  const { result, output } = call('ui-automation', 'snapshot-ui', '--verbose');
  return { capture: result.data.capture, output, result };
}

function rows(capture) {
  return capture.elements.filter(item => item.state?.visible &&
    (item.label || item.value || item.identifier || item.actions?.includes('tap') ||
      item.actions?.includes('typeText') || item.actions?.includes('swipeWithin')))
    .map(item => ({ ref: item.ref, role: item.role, label: item.label,
      value: item.value, identifier: item.identifier,
      actions: item.actions.filter(action => ['tap', 'typeText', 'swipeWithin'].includes(action)),
      selected: item.state?.selected, frame: item.frame }));
}

function match(capture, query, action) {
  const candidates = rows(capture).filter(item => item.actions.includes(action) &&
    [item.ref, item.label, item.value, item.identifier].some(value => value?.includes(query)));
  if (candidates.length !== 1) throw new Error(`${candidates.length} ${action} matches for ${JSON.stringify(query)}: ${JSON.stringify(candidates)}`);
  return candidates[0];
}

function pastHashes() {
  const result = new Set();
  for (const name of ['corpus', 'corpus-v2', 'corpus-v3']) {
    const source = join(root, 'spikes/feasibility', name, 'raw');
    for (const file of readdirSync(source).filter(file => file.endsWith('.full.json'))) {
      result.add(JSON.parse(readFileSync(join(source, file), 'utf8')).data.capture.screenHash);
    }
  }
  const raw = join(dir, 'raw');
  for (const file of readdirSync(raw).filter(file => file.endsWith('.full.json'))) {
    result.add(JSON.parse(readFileSync(join(raw, file), 'utf8')).data.capture.screenHash);
  }
  return result;
}

mkdirSync(join(dir, 'raw'), { recursive: true });
switch (operation) {
  case 'inspect': {
    const { capture } = snapshot();
    process.stdout.write(JSON.stringify({ hash: capture.screenHash, count: capture.elements.length,
      rows: rows(capture) }, null, 2) + '\n');
    break;
  }
  case 'tap': {
    const { capture } = snapshot();
    const target = match(capture, args[0], 'tap');
    const result = call('ui-automation', 'tap', '--element-ref', target.ref);
    process.stdout.write(JSON.stringify({ tapped: target, result: result.result.data?.summary }) + '\n');
    break;
  }
  case 'type': {
    const { capture } = snapshot();
    const target = match(capture, args[0], 'typeText');
    const result = call('ui-automation', 'type-text', '--element-ref', target.ref,
      '--text', args[1], '--replace-existing');
    process.stdout.write(JSON.stringify({ typedInto: target, result: result.result.data?.summary }) + '\n');
    break;
  }
  case 'swipe': {
    const { capture } = snapshot();
    const target = match(capture, args[0], 'swipeWithin');
    const result = call('ui-automation', 'swipe', '--within-element-ref', target.ref,
      '--direction', args[1], '--distance', args[2] ?? '0.7');
    process.stdout.write(JSON.stringify({ swiped: target, result: result.result.data?.summary }) + '\n');
    break;
  }
  case 'seed-phone': {
    const before = snapshot();
    const buttons = rows(before.capture).filter(item => item.label === 'add phone' && item.actions.includes('tap'));
    if (buttons.length === 0) throw new Error('No visible add phone button');
    const button = buttons.sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)))[0];
    call('ui-automation', 'tap', '--element-ref', button.ref);
    const after = snapshot();
    const field = rows(after.capture).find(item => item.role === 'text-field' && item.value === 'Phone' && item.actions.includes('typeText'));
    if (!field) throw new Error('No visible newly inserted Phone field');
    call('ui-automation', 'type-text', '--element-ref', field.ref, '--text', args[0], '--replace-existing');
    process.stdout.write(JSON.stringify({ addedPhone: args[0], buttonRef: button.ref, fieldRef: field.ref }) + '\n');
    break;
  }
  case 'launch': case 'stop': {
    const command = operation === 'launch' ? 'launch-app' : 'stop';
    const result = call('simulator', command, '--bundle-id', args[0]);
    process.stdout.write(JSON.stringify({ operation, app: args[0], result: result.result.data?.summary }) + '\n');
    break;
  }
  case 'capture': {
    const id = args[0];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('invalid case ID');
    let observed = snapshot();
    if (pastHashes().has(observed.capture.screenHash)) {
      throw new Error(`screen hash ${observed.capture.screenHash} already used in earlier corpora or this corpus`);
    }
    const screenshot = call('simulator', 'screenshot', '--return-format', 'path');
    const fullPath = join(dir, 'raw', `${id}.full.json`);
    const screenshotPath = join(dir, 'raw', `${id}.jpg`);
    writeFileSync(fullPath, observed.output);
    copyFileSync(screenshot.result.data.artifacts.screenshotPath, screenshotPath);
    const normalized = parseSnapshot(observed.result.data, udid, `raw/${id}.jpg`);
    writeFileSync(join(dir, 'raw', `${id}.snapshot.json`), JSON.stringify(normalized, null, 2) + '\n');
    const meta = { id, screenHash: observed.capture.screenHash, count: observed.capture.elements.length,
      fullPath: `raw/${id}.full.json`, screenshotPath: `raw/${id}.jpg`,
      sha256: { full: digest(fullPath), screenshot: digest(screenshotPath) } };
    writeFileSync(join(dir, 'raw', `${id}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
    process.stdout.write(JSON.stringify(meta) + '\n');
    break;
  }
  default: throw new Error('usage: node device.mjs inspect|tap QUERY|type QUERY VALUE|swipe QUERY DIRECTION|launch BUNDLE|stop BUNDLE|capture ID');
}
