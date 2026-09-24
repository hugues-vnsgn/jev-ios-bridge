#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScriptedCorpus } from '../contracts.js';
import { preflightCorpus, verifyCorpusAssets } from '../harness.js';

const root = dirname(fileURLToPath(import.meta.url));
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function priorCaptureEvidence(): Promise<{ hashes: Set<string>; screenHashes: Set<string> }> {
  const hashes = new Set<string>();
  const screenHashes = new Set<string>();
  const prior = ['corpus', 'corpus-v2', 'corpus-v3'];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(?:jpg|jpeg|png|full\.json)$/i.test(entry.name)) {
        const bytes = await readFile(path);
        hashes.add(sha(bytes));
        if (entry.name.endsWith('.full.json')) {
          const raw = JSON.parse(bytes.toString('utf8')) as unknown;
          if (record(raw) && record(raw.data) && record(raw.data.capture) &&
              typeof raw.data.capture.screenHash === 'string') screenHashes.add(raw.data.capture.screenHash);
        }
      }
    }
  };
  for (const name of prior) await walk(join(root, '../../feasibility', name, 'raw'));
  return { hashes, screenHashes };
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error('assemble.ts takes no arguments; edit definitions.json first');
  const definitions = JSON.parse(await readFile(join(root, 'definitions.json'), 'utf8')) as unknown;
  if (!record(definitions) || !Array.isArray(definitions.cases)) throw new Error('definitions.json needs cases[]');
  const cases: unknown[] = [];
  const prior = await priorCaptureEvidence();
  const currentHashes = new Set<string>();
  for (const definition of definitions.cases) {
    if (!record(definition) || typeof definition.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(definition.id)) {
      throw new Error('Every definition needs a safe case ID');
    }
    const id = definition.id;
    const meta = JSON.parse(await readFile(join(root, 'raw', `${id}.meta.json`), 'utf8')) as unknown;
    const snapshot = JSON.parse(await readFile(join(root, 'raw', `${id}.snapshot.json`), 'utf8')) as unknown;
    if (!record(meta) || !record(meta.sha256) || !record(snapshot) || meta.id !== id ||
        meta.fullPath !== `raw/${id}.full.json` || meta.screenshotPath !== `raw/${id}.jpg` ||
        meta.screenHash !== snapshot.screenHash || meta.count !== (Array.isArray(snapshot.elements) ? snapshot.elements.length : undefined) ||
        snapshot.screenshotPath !== meta.screenshotPath ||
        typeof meta.sha256.full !== 'string' || typeof meta.sha256.screenshot !== 'string') {
      throw new Error(`Capture metadata disagrees with ${id}`);
    }
    if (prior.screenHashes.has(meta.screenHash as string)) throw new Error(`Prior screen state reused by ${id}`);
    for (const hash of [meta.sha256.full, meta.sha256.screenshot]) {
      if (prior.hashes.has(hash)) throw new Error(`Prior corpus asset reused by ${id}`);
      if (currentHashes.has(hash)) throw new Error(`Duplicate new asset for ${id}`);
      currentHashes.add(hash);
    }
    cases.push({ ...definition, snapshot,
      assets: { fullPath: meta.fullPath, screenshotPath: meta.screenshotPath,
        sha256: { full: meta.sha256.full, screenshot: meta.sha256.screenshot } } });
  }
  const corpus: ScriptedCorpus = preflightCorpus({ version: 1, cases });
  const corpusPath = join(root, 'corpus.json');
  await verifyCorpusAssets(corpus, corpusPath);
  await writeFile(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`Validated ${corpus.cases.length} new screens and wrote corpus.json. No Jev request made.\n`);
}

main().catch(error => {
  process.stderr.write(`Scripted corpus assembly failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
