import path from 'node:path';
import { check, same } from './receipts.mjs';
const uuid = /^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/;
const eq = (a, b) => same(a, b);
const keys = value => Object.keys(value).sort();
export function policy(plan, call) {
  const counts = {}; let device = call.device ?? null; let allocation = null; let staged = null; let target = null;
  const row = plan.rows.find(r => r.id === call.row);
  check(row && ['prepare', 'action', 'prepare-action', 'silent'].includes(call.phase), 'INVALID_PHASE');
  let phase = call.phase === 'prepare-action' ? 'prepare' : call.phase;
  const actionLimit = { L01: 1, L02: 0, L03: 0, L04: 1, L05: 1 }[row.id];
  const use = (kind, max) => { counts[kind] = (counts[kind] ?? 0) + 1; check(counts[kind] <= max, 'COMMAND_BUDGET_' + kind); return kind; };
  function authorize(api, file, args, options) {
    check(phase !== 'silent', 'BACKEND_FORBIDDEN');
    check(Array.isArray(args) && args.every(x => typeof x === 'string') && options && options.shell !== true, 'INVALID_CHILD_ARGUMENTS');
    if (api === 'spawn') {
      check(phase === 'prepare' && eq(keys(options), ['env', 'shell', 'stdio']) && options.shell === false
        && eq(options.stdio, ['ignore', 'pipe', 'pipe']), 'UNEXPECTED_SPAWN_OPTIONS');
      check(eq(options.env, plan.sourceEnvironment), 'SOURCE_ENVIRONMENT_VARIANCE');
      if (file === '/usr/bin/xcrun' && args.length === 5 && args[0] === 'simctl' && args[1] === 'create') {
        const id = args[2].slice('jev-observed-'.length);
        check(args[2] === 'jev-observed-' + id && uuid.test(id) && !allocation
          && args[3] === row.prepare.source.deviceTypeId && args[4] === row.prepare.source.runtimeId, 'CREATE_BINDING');
        allocation = id; return use('create', 1);
      }
      const exact = plan.metadataCommands.some(c => c.file === file && eq(c.args, args));
      let stagedPlist = false;
      if (file === '/usr/bin/plutil' && args.length === 6 && eq(args.slice(0, 5), ['-convert', 'json', '-o', '-', '--'])) {
        const root = path.join(plan.runsDir, 'observed', row.prepare.actionId, 'allocation', 'staging');
        const rel = path.relative(root, args[5]);
        const parts = rel.split('/');
        stagedPlist = parts.length === 3 && /^artifact-[A-Za-z0-9]{6}$/.test(parts[0])
          && parts[1] === path.basename(row.prepare.app.artifactPath) && parts[2] === 'Info.plist';
        if (stagedPlist) { const app = path.dirname(args[5]); check(staged === null || staged === app, 'STAGED_PATH_CHANGED'); staged = app; }
      }
      check(exact || stagedPlist, 'UNLISTED_METADATA');
      return use('metadata', plan.limits.maxMetadataPerPreparation);
    }
    check(api === 'execFile' && file === plan.node && args[0] === plan.vendor
      && eq(keys(options), ['cwd', 'env', 'maxBuffer', 'signal'])
      && options.cwd === (phase === 'prepare' ? path.join(plan.runsDir, 'observed', row.prepare.actionId, 'allocation') : plan.cwd)
      && options.maxBuffer === 8388608 && options.signal instanceof AbortSignal, 'UNEXPECTED_EXECFILE_OPTIONS');
    const expected = { ...call.environment, MOBILEBUILDMCP_SENTRY_DISABLED: 'true' };
    check(eq(options.env, expected), 'DRIVER_ENVIRONMENT_VARIANCE');
    check(eq(args.slice(-2), ['--output', 'json']), 'MISSING_JSON_OUTPUT');
    const a = args.slice(1, -2);
    if (eq(a, ['simulator', 'list'])) { check(phase === 'prepare', 'ACTION_LIST_FORBIDDEN'); return use('list', plan.limits.maxListingsPerPreparation); }
    check(uuid.test(device ?? ''), 'DEVICE_NOT_BOUND');
    if (phase === 'prepare') {
      if (eq(a, ['simulator', 'boot', '--simulator-id', device])) return use('boot', 1);
      if (eq(a, ['simulator', 'install', '--simulator-id', device, '--app-path', staged]) && staged) return use('install', 1);
      if (eq(a, ['simulator', 'launch-app', '--simulator-id', device, '--bundle-id', row.prepare.app.bundleId])) return use('launch', 1);
    }
    const captureLimit = phase === 'prepare' ? 31 : 102;
    if (eq(a, ['ui-automation', 'snapshot-ui', '--simulator-id', device, '--verbose'])) return use(phase + ':snapshot', captureLimit);
    if (eq(a, ['ui-automation', 'screenshot', '--simulator-id', device, '--return-format', 'path'])) return use(phase + ':screenshot', captureLimit);
    if (phase === 'action' && a.length === 4 && eq(a.slice(0, 3), ['ui-automation', 'touch', '--json'])) {
      const payload = JSON.parse(a[3]);
      check(eq(keys(payload), ['delay', 'down', 'elementRef', 'simulatorId', 'up'])
        && payload.simulatorId === device && target && payload.elementRef === target.ref && Date.now() - target.at < 10000
        && payload.down === true && payload.up === true && payload.delay === 0.05, 'TOUCH_BINDING');
      return use('touch', actionLimit);
    }
    throw new Error('UNLISTED_VENDOR_COMMAND');
  }
  function received(kind, receipt) {
    if (receipt.actualCloseCode !== 0 || receipt.actualCloseSignal !== null || receipt.truncated || !receipt.rawReceiptDurablyRetained) return;
    if (kind === 'create') {
      const id = receipt.stdout.toString('utf8').trim(); check(uuid.test(id.toUpperCase()) && !device, 'CREATE_RECEIPT'); device = id.toUpperCase();
    }
    if (kind === 'action:snapshot') {
      const envelope = JSON.parse(receipt.stdout.toString('utf8'));
      check(envelope.schema === 'mobilebuildmcp.output.capture-result' && envelope.schemaVersion === '2'
        && envelope.didError !== true && Array.isArray(envelope.data?.capture?.elements), 'FULL_SNAPSHOT_REQUIRED');
      const matches = envelope.data.capture.elements.filter(e => Object.entries(row.action.action.selector).every(([k, v]) => e[k] === v)
        && e.state?.visible === true && e.state?.enabled === true && e.frame?.width > 0 && e.frame?.height > 0
        && e.actions?.includes('tap') && e.actions?.includes('touch'));
      target = matches.length === 1 ? { ref: matches[0].ref, at: Date.now() } : null;
    }
  }
  return { authorize, received, snapshot: () => ({ counts, device, allocation, staged, target }),
    action() { check(call.phase === 'prepare-action' && phase === 'prepare' && device, 'PHASE_TRANSITION'); phase = 'action'; } };
}
