import { readFile, readdir, writeFile } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import { join, resolve } from 'node:path';
const evidence = resolve('.scratch/observed-integration/acceptance/host/public-adapters/round2');
const root = join(evidence, 'final-coverage'); const merged = new Map();
const files = ['src/cli.ts', 'src/mcp/index.ts', 'src/mcp/observed.ts', 'src/observed/cli.ts'];
for (const name of await readdir(root)) {
  if (!name.endsWith('.json')) continue;
  const data = JSON.parse(await readFile(join(root, name), 'utf8'));
  for (const script of data.result) {
    const file = files.find(value => script.url === 'file://' + resolve(value)); if (!file) continue;
    const cache = data['source-map-cache']?.[script.url]; if (!cache?.data) continue;
    const map = new SourceMap(cache.data);
    const location = offset => {
      let line = 0; while (offset > cache.lineLengths[line] && line < cache.lineLengths.length - 1) { offset -= cache.lineLengths[line] + 1; line++; }
      const entry = map.findEntry(line, offset); return entry.originalLine === undefined ? null : entry.originalLine + 1;
    };
    for (const fn of script.functions) for (const range of fn.ranges) {
      const key = `${file}:${range.startOffset}:${range.endOffset}`;
      const row = merged.get(key) ?? { file, function: fn.functionName, originalLine: location(range.startOffset), count: 0, functionRange: range === fn.ranges[0] };
      row.count += range.count; merged.set(key, row);
    }
  }
}
const zero = [...merged.values()].filter(value => value.count === 0).sort((a, b) => a.file.localeCompare(b.file) || a.originalLine - b.originalLine);
await writeFile(join(evidence, 'coverage-uncovered-ranges.json'), JSON.stringify(zero, null, 2) + '\n');
console.log(JSON.stringify(zero, null, 2));
