#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { BridgeService } from './service.js';
import { captureCommand } from './capture.js';
import { createMcpServer } from './mcp/index.js';
import { DeviceCliError, DeviceReasonError, deviceWindowOpener, selectAndroidDeviceName, selectDeviceId } from './device/index.js';
import { createDriverFactory } from './device/factory.js';
import { createAssertionJudge } from './scripted/jev.js';
import { createDrivenJudge } from './driven/decide.js';
import { renderPause } from './driven/handback.js';
import { renderScriptedReport } from './scripted/report.js';
import { parseScriptedScenarioSource, resolveScriptValues, ScriptValueError } from './scripted/schema.js';
import { DrivenProjectError, experimentalDrivenOn } from './driven/project.js';
import type { LogSources, Verdict } from './contracts/index.js';
import { BRIDGE_VERSION } from './version.js';
import { attachLogPane } from './logpane/attach.js';
import { readRunEvents } from './log/index.js';
import { EXIT } from './exit-codes.js';

const USAGE = `jev-ios-bridge ${BRIDGE_VERSION}
Usage:
  jev-ios-bridge run <script.json> [--json] [--no-log-pane] [--no-device-window] [--max-steps N] [--timeout-ms N]
  jev-ios-bridge report <run-id> [--json]
  jev-ios-bridge logs <run-id>
  jev-ios-bridge capture [--serial S | --avd A] [--jev]
  jev-ios-bridge mcp
  jev-ios-bridge --version | --help
Set TYPESAFE_API_KEY and, for an iOS script, a dedicated simulator (JEV_DEVICE_UDID, the script's
device.udid, or .mobilebuildmcp/config.yaml); for an Android script, a device (JEV_ANDROID_DEVICE,
or the script's device.serial or device.avd). JEV_RUNS_DIR selects the evidence directory (default ./.jev-runs).
JEV_PROJECT_DIR, when set, stands in for the working directory (a plugin sets it to your project).
A run opens a live log pane of the app's own output in a new terminal window; turn it off with
--no-log-pane or JEV_LOG_PANE=off, or choose the terminal app with JEV_LOG_PANE_APP.
An iOS run brings its simulator's window to the front; turn that off with --no-device-window or
JEV_DEVICE_WINDOW=off.
capture prints the current Android screen as a run sees it, one JSON line per element, or with --jev
as Jev's text. It never launches or restarts the app, and needs no TYPESAFE_API_KEY. It picks the device
by --serial, then --avd, then JEV_ANDROID_DEVICE, and exits 0 when it printed, 3 when it couldn't.
A run of a script with "do" steps (driven mode, experimental: JEV_EXPERIMENTAL_DRIVEN=1) can pause for
Claude. run prints the pause and keeps waiting, but can't answer it: resolve_step is an MCP tool, so the
pause times out unless the script runs through the MCP server.
Exit codes: 0 passed, 1 failed, 2 inconclusive, 3 could not start.`;

/** A problem found before any run started. The message is safe to print. */
class StartError extends Error {}

/** No device was configured, or the one named doesn't have the shape the platform needs: either way, the
 *  pre-run device check's own message (not the generic fallback) is safe to print. */
function isDeviceSelectionError(error: unknown): error is DeviceCliError | DeviceReasonError {
  return (error instanceof DeviceCliError || error instanceof DeviceReasonError) &&
    ['NO_DEVICE', 'INVALID_DEVICE'].includes(error.code);
}

const exitFor = (verdict: Verdict) => EXIT[verdict];

function limitValue(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new StartError(`--${name} must be a whole number`);
  return value;
}

/** The user's project. A Claude Code plugin starts the server in the plugin's folder, so it passes the project in. */
const projectDir = resolve(process.env.JEV_PROJECT_DIR?.trim() || process.cwd());
const runsDir = () => process.env.JEV_RUNS_DIR ?? join(projectDir, '.jev-runs');

async function readScript(path: string): Promise<unknown> {
  let text: string;
  try { text = await readFile(resolve(projectDir, path), 'utf8'); }
  catch { throw new StartError(`Cannot read script file ${path}`); }
  try { return JSON.parse(text); }
  catch { throw new StartError(`Script file ${path} is not valid JSON`); }
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, options: {
      help: { type: 'boolean' }, version: { type: 'boolean' }, json: { type: 'boolean' }, 'no-log-pane': { type: 'boolean' },
      'no-device-window': { type: 'boolean' },
      'max-steps': { type: 'string' }, 'timeout-ms': { type: 'string' },
      serial: { type: 'string' }, avd: { type: 'string' }, jev: { type: 'boolean' },
    } });
  } catch (error) { throw new StartError(`${(error as Error).message}\n${USAGE}`); }
  const [command, argument] = parsed.positionals;
  if (parsed.values.version) { console.log(BRIDGE_VERSION); return; }
  if (parsed.values.help || !command) { console.log(USAGE); return; }
  const expected = command === 'mcp' || command === 'capture' ? 1 : 2;
  if (!['run', 'report', 'logs', 'capture', 'mcp'].includes(command)) throw new StartError(`Unknown command: ${command}\n${USAGE}`);
  if (parsed.positionals.length !== expected) throw new StartError(`Wrong number of arguments for ${command}\n${USAGE}`);
  const limits = {
    ...(parsed.values['max-steps'] === undefined ? {} : { maxSteps: limitValue('max-steps', parsed.values['max-steps']) }),
    ...(parsed.values['timeout-ms'] === undefined ? {} : { wallTimeMs: limitValue('timeout-ms', parsed.values['timeout-ms']) }),
  };
  if (command !== 'run' && Object.keys(limits).length) throw new StartError('Run limits apply only to run');
  if (['mcp', 'logs', 'capture'].includes(command) && parsed.values.json) throw new StartError('--json applies only to run and report');
  if (command !== 'run' && parsed.values['no-log-pane']) throw new StartError('--no-log-pane applies only to run');
  if (command !== 'run' && parsed.values['no-device-window']) throw new StartError('--no-device-window applies only to run');
  const { serial, avd, jev } = parsed.values;
  if (command !== 'capture' && (serial !== undefined || avd !== undefined || jev)) throw new StartError('--serial, --avd and --jev apply only to capture');
  if (command === 'capture') {
    const interrupted = new AbortController();
    const captured = captureCommand({ serial, avd, jev }, { defaultDevice: process.env.JEV_ANDROID_DEVICE, signal: interrupted.signal,
      write: { stdout: text => { process.stdout.write(text); }, stderr: text => { process.stderr.write(text); } } });
    // As a run's handlers do: close the driver, then exit.
    const stop = (exitCode: number) => () => { interrupted.abort(); void captured.finally(() => process.exit(exitCode)); };
    process.once('SIGINT', stop(130));
    process.once('SIGTERM', stop(143));
    process.exitCode = await captured;
    return;
  }
  if (command === 'logs') {
    if (await attachLogPane(argument!)) return;
    let events;
    try { events = await readRunEvents(runsDir(), argument!); }
    catch { throw new StartError(`No live run ${argument}, and no recorded run with that ID in ${runsDir()}`); }
    const sources = events.find(event => event.type === 'prepared')?.data.logSources as LogSources | undefined;
    console.log(`Run ${argument} is not running, so there is no live log to follow.` +
      (sources ? `\nThe app's own log files (not masked): ${[sources.runtime, sources.os, sources.logcat].filter(Boolean).join(', ')}` : ''));
    return;
  }

  let script;
  if (command === 'run') {
    script = resolveScriptValues(parseScriptedScenarioSource(await readScript(argument!)), process.env);
    if (!process.env.TYPESAFE_API_KEY?.trim()) throw new StartError('TYPESAFE_API_KEY is not set; load your .env with node --env-file=/path/to/.env');
    if (script.platform === 'android') selectAndroidDeviceName(script.device, process.env.JEV_ANDROID_DEVICE);
    else await selectDeviceId(projectDir, script.device?.udid, process.env.JEV_DEVICE_UDID);
  }

  // Under MCP there is no flag: JEV_DEVICE_WINDOW=off in the server's environment turns the window off.
  const deviceWindow = deviceWindowOpener(parsed.values['no-device-window'] === true);
  const service = new BridgeService({
    baseDir: runsDir(),
    createDriver: createDriverFactory({ mobileBuildMcp: { cwd: projectDir,
      ...(process.env.JEV_DEVICE_UDID ? { defaultUdid: process.env.JEV_DEVICE_UDID } : {}),
      capture: 'full', screenshots: true,
      ...(deviceWindow ? { deviceWindow } : {}),
      // Measurement aid for release checks; costs one extra capture per observation.
      ...(process.env.JEV_VERIFY_SCREENSHOT_AGREEMENT === '1' ? { verifyScreenshotAgreement: true } : {}) },
      android: { defaultDevice: process.env.JEV_ANDROID_DEVICE } }),
    createJudge: () => createAssertionJudge(),
    createDrivenJudge: () => createDrivenJudge(),
    logPane: { cliPath: fileURLToPath(import.meta.url), openWindow: !parsed.values['no-log-pane'],
      // MCP's stdout carries the protocol, so pane notices go to stderr in both modes.
      onNotice: (_runId, text) => { console.error(text); } },
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await service.close();
  };
  process.once('SIGINT', () => { void close().then(() => process.exit(130)); });
  process.once('SIGTERM', () => { void close().then(() => process.exit(143)); });
  if (command === 'mcp') {
    // The experimental switch (E13) publishes resolve_step; the plugin sets it from its experimentalDriven setting.
    serveStdio(() => createMcpServer(service, { driven: experimentalDrivenOn(process.env) }), { onerror: () => { console.error('MCP transport error'); } });
    process.stdin.once('end', () => { void close(); });
    return;
  }
  const print = async (runId: string) => {
    const { state, report } = await service.status(runId);
    if (parsed.values.json) console.log(JSON.stringify(await service.reportJson(runId), null, 2));
    else console.log(`${command === 'report' ? `Status: ${state}\n` : ''}${renderScriptedReport(report)}\nFull local evidence: ${service.baseDir}/${runId}/run.jsonl`);
    process.exitCode = exitFor(report.verdict);
  };
  try {
    if (command === 'report') {
      try { await service.status(argument!); }
      catch { throw new StartError(`No readable run ${argument} in ${service.baseDir}`); }
      await print(argument!);
      return;
    }
    const { runId, watchUrl } = await service.start(script, limits);
    console.error(`Watch: ${watchUrl}`);
    let shownPause: string | undefined;
    while (!closing) {
      await new Promise(done => setTimeout(done, 500));
      const { state, pause } = await service.status(runId);
      if (pause) {
        if (pause.pauseId !== shownPause) {
          shownPause = pause.pauseId;
          console.error(`${renderPause(runId, pause)}\nThe CLI can't answer a pause (resolve_step is an MCP tool); ` +
            'this run waits until the pause expires. Run the script through the MCP server to answer it.');
        }
        continue;
      }
      if (state !== 'running') { await print(runId); break; }
    }
  } finally { await close(); }
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) console.error(`Script is invalid:\n${z.prettifyError(error)}`);
  else if (error instanceof StartError || error instanceof ScriptValueError || error instanceof DrivenProjectError ||
    isDeviceSelectionError(error)) {
    console.error(error.message);
  } else console.error('Bridge could not start. Check arguments, script, and environment.');
  process.exitCode = EXIT.couldNotStart;
});
