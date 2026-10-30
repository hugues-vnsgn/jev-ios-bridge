import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { extractAssets, recoverInventory, serializeInventory } from './inventory.js';
import { KIT_DIR, KIT_FILES } from './sources.js';

export interface CliDeps {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  out: (line: string) => void;
  createClient: () => unknown;
}

const USAGE = 'usage: cli.ts [--dir <corpus folder>] recover [--check] [--extract <dir>]';

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    dir: { type: 'string' }, check: { type: 'boolean' }, extract: { type: 'string' },
  } });
  const dir = resolve(deps.cwd, values.dir ?? KIT_DIR);
  const command = positionals.join(' ');
  switch (command) {
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
    default:
      deps.out(USAGE);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), { cwd: process.cwd(), env: process.env,
    out: line => process.stdout.write(`${line}\n`),
    createClient: () => { throw new Error('no judge client in this build of the CLI'); } });
}
