import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { extractAssets, parseInventory, recoverInventory, serializeInventory, type Inventory } from './inventory.js';
import { attachCapture, generateManifest, jsonText, parseManifest, verifyManifest, type Refusal } from './manifest.js';
import { captureRefusals, replayCorpus, type JudgeClient } from './replay.js';
import { Refusal as KitRefusal } from '../live/records.js';
import { CaptureRefusal, takeCapture, type CaptureIdentity, type TakeCaptureInput } from './capture-screen.js';
import { KIT_DIR, KIT_FILES, REPO_ROOT } from './sources.js';
import { SCRIPTED_JEV_MODEL } from '../../../src/scripted/jev.js';

export interface CliDeps {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  out: (line: string) => void;
  createClient: () => unknown;
  /** Takes one capture from the assigned device; the live one, which opens the owner's store, unless a test injects its own. */
  takeCapture?: (input: TakeCaptureInput) => Promise<CaptureIdentity>;
}

/** The live judge the replay asks: the pinned model, with the key the environment already carries. */
export function createLiveJudgeClient(env: Readonly<Record<string, string | undefined>> = process.env): JudgeClient {
  const key = env.TYPESAFE_API_KEY?.trim();
  if (!key) throw new Error('TYPESAFE_API_KEY is not set');
  let client: TypeSafeClient;
  try { client = new TypeSafeClient({ apiKey: key, defaultModel: SCRIPTED_JEV_MODEL, logLevel: 'warn' }); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'The judge client could not be created'); }
  return { systemOne: (request, options) => client.systemOne(request, options) as Promise<unknown> };
}

const USAGE = [
  'usage: cli.ts [--dir <corpus folder>] <command>',
  '  recover [--check] [--extract <dir>]',
  '  manifest generate | manifest verify',
  '  capture attach --screen <id> --xml <file> --screenshot <file> --kind live|stand-in --app-build <s> --device <s>',
  '    --captured-at <s> --session-id <s>',
  '  capture take --screen <id> --platform ios|android --device <id> --assignment <file> --activation <file> --out <dir>',
  '    --app-build <s>',
  '  replay --live-jev',
].join('\n');

const CaptureArgs = z.object({
  screen: z.string().min(1), xml: z.string().min(1), screenshot: z.string().min(1), kind: z.enum(['live', 'stand-in']),
  'app-build': z.string().min(1), device: z.string().min(1), 'captured-at': z.string().min(1), 'session-id': z.string().min(1),
});

const CAPTURE_MS = 300_000;

const TakeArgs = z.object({
  screen: z.string().min(1), platform: z.enum(['ios', 'android']), device: z.string().min(1), assignment: z.string().min(1),
  activation: z.string().min(1), out: z.string().min(1), 'app-build': z.string().min(1),
});

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const readInventory = (dir: string): Inventory => parseInventory(readJson(join(dir, KIT_FILES.inventory)));

function report(refusals: Refusal[], out: CliDeps['out']): number {
  for (const refusal of refusals) out(`refused ${refusal.code} at ${refusal.at}: ${refusal.detail}`);
  return refusals.length ? 1 : 0;
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    dir: { type: 'string' }, check: { type: 'boolean' }, extract: { type: 'string' },
    screen: { type: 'string' }, xml: { type: 'string' }, screenshot: { type: 'string' }, kind: { type: 'string' },
    'app-build': { type: 'string' }, device: { type: 'string' }, 'captured-at': { type: 'string' }, 'session-id': { type: 'string' },
    'live-jev': { type: 'boolean' }, platform: { type: 'string' }, assignment: { type: 'string' }, activation: { type: 'string' }, out: { type: 'string' },
  } });
  const dir = resolve(deps.cwd, values.dir ?? KIT_DIR);
  const manifestPath = join(dir, KIT_FILES.manifest);
  switch (positionals.join(' ')) {
    case 'recover': {
      const inventory = recoverInventory();
      const text = serializeInventory(inventory);
      const path = join(dir, KIT_FILES.inventory);
      if (values.check) {
        const same = existsSync(path) && readFileSync(path, 'utf8') === text;
        deps.out(same ? 'inventory.json matches a fresh recovery' : 'inventory.json differs from a fresh recovery');
        if (!same) return 1;
      } else {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, text);
        deps.out(`wrote ${path}`);
      }
      if (values.extract !== undefined) {
        const written = extractAssets(inventory, resolve(deps.cwd, values.extract));
        deps.out(`extracted ${written.length} assets, each matching its inventory hash`);
      }
      return 0;
    }
    case 'manifest generate': {
      const { manifest, sealedRequestIds } = generateManifest(readInventory(dir), REPO_ROOT);
      writeFileSync(manifestPath, jsonText(manifest));
      writeFileSync(join(dir, KIT_FILES.sealedRequestIds), jsonText(sealedRequestIds));
      deps.out(`wrote ${manifestPath} and ${KIT_FILES.sealedRequestIds}`);
      return 0;
    }
    case 'manifest verify': {
      const code = report(verifyManifest(readJson(manifestPath), { inventory: readInventory(dir), repoRoot: REPO_ROOT, manifestDir: dir }),
        deps.out);
      if (code === 0) deps.out('manifest verifies');
      return code;
    }
    case 'capture attach': {
      const args = CaptureArgs.safeParse(values);
      if (!args.success) {
        deps.out(USAGE);
        return 2;
      }
      const { screen, xml, screenshot, kind } = args.data;
      const manifest = attachCapture(parseManifest(readJson(manifestPath)), { screenId: screen, xmlPath: resolve(deps.cwd, xml),
        screenshotPath: resolve(deps.cwd, screenshot), kind, appBuild: args.data['app-build'], device: args.data.device,
        capturedAt: args.data['captured-at'], sessionId: args.data['session-id'] }, dir);
      writeFileSync(manifestPath, jsonText(manifest));
      deps.out(`captured ${screen} as ${kind}`);
      return 0;
    }
    case 'capture take': {
      const args = TakeArgs.safeParse(values);
      if (!args.success) {
        deps.out(USAGE);
        return 2;
      }
      const take = deps.takeCapture ?? ((input: TakeCaptureInput) => takeCapture(input, { cwd: deps.cwd, now: () => new Date(), signal: AbortSignal.timeout(CAPTURE_MS) }));
      try {
        const { 'app-build': appBuild, ...rest } = args.data;
        const identity = await take({ ...rest, appBuild, inventory: readInventory(dir) });
        deps.out(`captured ${identity.screenId} on ${identity.resolvedDevice} (${identity.os}) into ${resolve(deps.cwd, args.data.out)}`);
        if (identity.appId.observed !== identity.appId.expected) {
          deps.out(`note: the app in front is ${identity.appId.observed ?? 'not named in the page source'}; the corpus expects ${identity.appId.expected}`);
        }
        return 0;
      } catch (error) {
        if (error instanceof CaptureRefusal || error instanceof KitRefusal) deps.out(`refused ${error.code}: ${error.message}`);
        else deps.out(`failed ${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    }
    case 'replay': {
      if (!values['live-jev']) {
        deps.out(USAGE);
        return 2;
      }
      const manifest = parseManifest(readJson(manifestPath));
      const refusals = captureRefusals(manifest);
      if (refusals.length) {
        for (const refusal of refusals) deps.out(`refused ${refusal.code} at ${refusal.screenId}: ${refusal.detail}`);
        return 1;
      }
      if (!deps.env.TYPESAFE_API_KEY?.trim()) {
        deps.out('refused: TYPESAFE_API_KEY is not set');
        return 1;
      }
      const inventory = readInventory(dir);
      const verified = verifyManifest(manifest, { inventory, repoRoot: REPO_ROOT, manifestDir: dir });
      if (verified.length) {
        for (const refusal of verified) deps.out(`refused ${refusal.code} at ${refusal.at}: ${refusal.detail}`);
        return 1;
      }
      const client = deps.createClient() as JudgeClient;
      const outcome = await replayCorpus({ mode: 'live', manifest, manifestDir: dir, client,
        signal: new AbortController().signal, inventory, repoRoot: REPO_ROOT });
      if (outcome.status === 'refused') {
        for (const refusal of outcome.refusals) deps.out(`refused ${refusal.code}: ${refusal.detail}`);
        return 1;
      }
      deps.out(`replay ${outcome.status}: ${outcome.calls} judgments, ${outcome.alreadyRecorded.length} already recorded`);
      for (const reason of outcome.report.reasons) deps.out(reason);
      return outcome.report.platforms.ios.exit === 'pass' && outcome.report.platforms.android.exit === 'pass' ? 0 : 1;
    }
    default:
      deps.out(USAGE);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), { cwd: process.cwd(), env: process.env,
    out: line => process.stdout.write(`${line}\n`),
    createClient: () => createLiveJudgeClient(process.env) });
}
