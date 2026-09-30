import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { parseScriptedScenario } from '../src/scripted/schema.js';
import { REASON_CODES, ROLES } from '../src/scripted/vocabulary.js';

const shippedRoots = ['README.md', 'CHANGELOG.md', 'LICENSE', 'docs/guide'];

function markdownFiles(path: string): string[] {
  if (statSync(path).isFile()) return path.endsWith('.md') ? [path] : [];
  return readdirSync(path).flatMap(name => markdownFiles(join(path, name)));
}

const shipped = ['README.md', 'CHANGELOG.md', ...markdownFiles('docs/guide')];

test('shipped docs link only to files inside the package, and every link resolves', () => {
  for (const file of shipped) {
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target!)) continue;
      const path = normalize(join(dirname(file), target!.split('#')[0]!));
      assert.ok(existsSync(path), `${file} links to missing ${target}`);
      assert.ok(shippedRoots.some(root => path === root || !relative(root, path).startsWith('..')),
        `${file} links outside the package: ${target} (use the GitHub URL at the release tag)`);
    }
  }
});

test('the reason-code reference lists exactly the bridge-owned codes', () => {
  const page = readFileSync('docs/guide/reference/reason-codes.md', 'utf8');
  const listed = [...page.matchAll(/^\| `([A-Z_]+)` \|/gm)].map(match => match[1]);
  assert.deepEqual([...listed].sort(), Object.keys(REASON_CODES).sort());
});

test('the script-format reference lists exactly the bridge-owned roles', () => {
  const page = readFileSync('docs/guide/reference/script-format.md', 'utf8');
  const line = page.split('\n').find(row => row.startsWith('| `role` |'))!;
  assert.deepEqual([...line.matchAll(/`([a-z-]+)`/g)].map(match => match[1]).filter(role => role !== 'role'), [...ROLES]);
});

test('the script-format reference documents platform and the Android app/device fields', () => {
  const page = readFileSync('docs/guide/reference/script-format.md', 'utf8');
  for (const field of ['platform', 'package', 'activity', 'intentExtras', 'serial', 'avd']) {
    assert.ok(page.includes(`\`${field}\``), `script-format.md does not document ${field}`);
  }
});

test('the script-format reference says the 2048-character typed-value limit counts UTF-16 code units', () => {
  const page = readFileSync('docs/guide/reference/script-format.md', 'utf8');
  assert.match(page, /2048 characters \(UTF-16 code units/);
});


const guidePage = (name: string) => readFileSync(join('docs/guide', name), 'utf8');

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens. */
function anchorsOf(markdown: string): Set<string> {
  return new Set([...markdown.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
    heading!.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replaceAll(' ', '-')));
}

test('every link into a shipped doc that names a heading finds that heading', () => {
  for (const file of shipped) {
    for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:)/.test(target!) || !target!.includes('#')) continue;
      const [path, anchor] = target!.split('#');
      const linked = path ? normalize(join(dirname(file), path)) : file;
      assert.ok(anchorsOf(readFileSync(linked, 'utf8')).has(anchor!), `${file} links to missing heading ${target}`);
    }
  }
});

test('shipped docs link to this repo\'s other files at the v1.2.0 tag, and each linked path exists here', () => {
  for (const file of ['README.md', ...markdownFiles('docs/guide')]) {
    for (const [, tag, path] of readFileSync(file, 'utf8')
      .matchAll(/https:\/\/github\.com\/hugues-vnsgn\/jev-ios-bridge\/(?:blob|tree)\/([^/]+)\/([^)#\s]+)/g)) {
      assert.equal(tag, 'v1.2.0', `${file} links ${path} at ${tag}`);
      assert.ok(existsSync(path!), `${file} links ${path}, which isn't in this checkout`);
    }
  }
});

test('the guide index links every guide and reference page, and the Android setup page exists', () => {
  assert.ok(existsSync('docs/guide/12-android-setup.md'));
  const index = guidePage('README.md');
  const pages = [
    ...readdirSync('docs/guide').filter(name => /^\d\d-.+\.md$/.test(name)),
    ...readdirSync('docs/guide/reference').map(name => `reference/${name}`),
  ];
  for (const page of pages) assert.ok(index.includes(`](${page})`), `the guide index doesn't link ${page}`);
  assert.ok(guidePage('02-prepare-your-app.md').includes('](12-android-setup.md'), '02-prepare-your-app.md does not link the Android setup page');
});

test('the Android setup page covers tools, device naming, identifiers, control state, settings, other UI tools and screen lock', () => {
  const page = guidePage('12-android-setup.md');
  for (const point of ['`adb`', 'API 31', 'arm64', '`device.avd`', '`device.serial`', '`JEV_ANDROID_DEVICE`', 'Android device',
    'testTagsAsResourceId', 'androidMain', 'selected', 'checked', 'animation', 'pm grant', 'USB debugging (Security settings)',
    'mobile-mcp', 'Appium', '`uiautomator`', '`DEVICE_BUSY`', 'Screen lock', 'None', '`DEVICE_LOCKED`']) {
    assert.ok(page.includes(point), `12-android-setup.md does not cover ${point}`);
  }
});

test('the reason-code reference gives each code the vocabulary\'s own wording', () => {
  const page = guidePage('reference/reason-codes.md');
  for (const [, code, meaning] of page.matchAll(/^\| `([A-Z_]+)` \| (.+) \|$/gm)) {
    assert.equal(meaning, REASON_CODES[code as keyof typeof REASON_CODES], `${code}'s meaning differs from src/scripted/vocabulary.ts`);
  }
});

test('troubleshooting covers every Android reason code, crash lookups, and clearing leftovers by hand', () => {
  const reference = guidePage('reference/reason-codes.md');
  const android = reference.slice(reference.indexOf('## Device and app (Android)'));
  const codes = [...android.slice(0, android.indexOf('\n## ', 1)).matchAll(/^\| `([A-Z_]+)` \|/gm)].map(match => match[1]!);
  assert.ok(codes.length >= 9, `expected the Android codes, found ${codes.join(', ')}`);
  const page = guidePage('08-troubleshooting.md');
  for (const code of codes) assert.ok(page.includes(`\`${code}\``), `08-troubleshooting.md does not cover ${code}`);
  for (const text of ['logcat -b crash -d', 'dumpsys activity exit-info', 'Screen still changing', 'forward --remove',
    'CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex']) {
    assert.ok(page.includes(text), `08-troubleshooting.md does not cover ${text}`);
  }
});

test('the report.json reference lists every field of an iOS and an Android report', () => {
  const page = guidePage('reference/report-json.md');
  const listed = new Set(page.split('\n').filter(row => row.startsWith('| `'))
    .flatMap(row => [...row.split(' | ')[0]!.matchAll(/`([A-Za-z]+)`/g)].map(match => match[1]!)));
  const ios = JSON.parse(readFileSync('tests/golden/report-json.json', 'utf8')) as Record<string, object>;
  const android = JSON.parse(readFileSync('tests/golden/report-json-android.json', 'utf8')) as object;
  for (const field of new Set([...Object.values(ios), android].flatMap(report => Object.keys(report)))) {
    assert.ok(listed.has(field), `report-json.md does not list ${field}`);
  }
});

test('the running page documents capture with every option in the CLI\'s usage line', () => {
  const usage = readFileSync('src/cli.ts', 'utf8').split('\n').find(line => line.includes('jev-ios-bridge capture '))!;
  const options = [...usage.matchAll(/--[a-z-]+/g)].map(match => match[0]);
  assert.deepEqual(options, ['--serial', '--avd', '--jev']);
  const page = guidePage('06-running.md');
  for (const text of ['`capture`', ...options.map(option => `\`${option}`), '`JEV_ANDROID_DEVICE`', '"selectable": false']) {
    assert.ok(page.includes(text), `06-running.md does not document ${text}`);
  }
});

test('the script-format reference says a non-ASCII typed value passes through the device clipboard', () => {
  const page = guidePage('reference/script-format.md');
  assert.match(page, /clipboard/);
  assert.match(page, /real secret/);
});

test('every whole script shown in the guide parses', () => {
  let scripts = 0;
  for (const file of markdownFiles('docs/guide')) {
    for (const [, block] of readFileSync(file, 'utf8').matchAll(/```json\n(\{\n\s*"version": 1,[\s\S]*?)\n```/g)) {
      assert.doesNotThrow(() => parseScriptedScenario(JSON.parse(block!)), `${file} shows a script that doesn't parse`);
      scripts++;
    }
  }
  assert.ok(scripts >= 3, `expected the guide's example scripts, found ${scripts}`);
});

test('the limits page says an upper-case copy goes unmasked in the log pane and run.jsonl, and no page says a log file is masked', () => {
  const line = guidePage('10-limits.md').split('\n').find(row => row.includes('upper-case copy'))!;
  assert.match(line, /log pane/);
  assert.match(line, /`run\.jsonl`/);
  assert.doesNotMatch(line, /log file/);
  for (const file of [...shipped, 'docs/releases/v1.2.0.md']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /log files? (?:is |are )?masked/i, file);
  }
});

test('data handling names exactly the intent-extra keys whose values are masked', () => {
  const keys = /\^\(([^)]+)\)\$\/i\.test\(key\)/.exec(readFileSync('src/log/index.ts', 'utf8'))![1]!.split('|');
  const line = guidePage('09-data-handling.md').split('\n').find(row => row.startsWith('- **Intent extras**'))!;
  for (const key of keys) assert.ok(line.includes(`\`${key}\``), `09-data-handling.md does not name ${key}`);
  assert.match(line, /case/);
  assert.match(line, /`authToken`/);
  assert.doesNotMatch(line, /named like/);
});

test('data handling and the release notes say which device reads the bridge makes', () => {
  for (const file of ['docs/guide/09-data-handling.md', 'docs/releases/v1.2.0.md']) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /`adb devices -l`/, file);
    assert.match(text, /`ro\.boot\.qemu\.avd_name`/, file);
    assert.doesNotMatch(text, /no look at other connected devices|doesn't read other connected devices/, file);
  }
});

test('the architecture page names only source paths that exist', () => {
  for (const [, path] of readFileSync('docs/architecture.md', 'utf8').matchAll(/^\| `(src\/[^`]+)`/gm)) {
    assert.ok(existsSync(path!) || existsSync(`${path}.ts`), `docs/architecture.md names missing ${path}`);
  }
  assert.match(readFileSync('docs/architecture.md', 'utf8'), /^\| `src\/capture\.ts` \|/m);
});

test('the quickstart\'s Android section puts adb and emulator on the PATH', () => {
  const android = guidePage('01-quickstart.md').split('## Android')[1]!;
  assert.ok(android.includes('$HOME/Library/Android/sdk/platform-tools'));
  assert.ok(android.includes('$HOME/Library/Android/sdk/emulator'));
});

test('the identifiers page says an empty field shows its hint only without a content description', () => {
  assert.match(guidePage('03-identifiers.md'), /hint as `placeholder` only when it has no content description/);
});

test('the guide says device lease, not device lock, outside the frozen reason-code wording', () => {
  for (const file of markdownFiles('docs/guide').filter(name => !name.endsWith('reason-codes.md'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /device lock\b/i, file);
  }
  assert.ok(guidePage('08-troubleshooting.md').includes('](06-running.md#cancelling-and-the-device-lease)'));
});

test('the limits page\'s Android speed table names each evidence script once', () => {
  const page = guidePage('10-limits.md');
  const table = page.slice(page.indexOf('| Script | Android 16'));
  const rows = [...table.slice(0, table.indexOf('\n\n')).matchAll(/^ *\| ([a-z][a-z-]*) \|/gm)].map(match => match[1]!);
  const scripts = ['twin-fail', ...readdirSync('spikes/benchmarks/scenarios')
    .filter(name => /^android-.+\.json$/.test(name)).map(name => name.slice('android-'.length, -'.json'.length))];
  assert.deepEqual([...rows].sort(), scripts.sort());
});

test('the clipboard is described as the path for non-ASCII text, not non-English text', () => {
  for (const file of [...shipped, 'docs/releases/v1.2.0.md']) {
    for (const line of readFileSync(file, 'utf8').split('\n').filter(row => /clipboard/.test(row))) {
      assert.doesNotMatch(line, /non-English/i, `${file}: ${line}`);
    }
  }
});

test('a guide page first calls a foreign agent another tool\'s UI-automation agent', () => {
  for (const file of markdownFiles('docs/guide')) {
    const text = readFileSync(file, 'utf8');
    const first = text.search(/another tool's (?:UI-automation |automation )?agent|foreign agent/i);
    if (first === -1) continue;
    assert.ok(text.slice(first).startsWith('another tool\'s UI-automation agent (a foreign agent)')
      || text.slice(first).startsWith('Another tool\'s UI-automation agent (a foreign agent)'), `${file} first names a foreign agent otherwise`);
    assert.doesNotMatch(text.slice(first + 1), /another tool's (?:UI-automation |automation )?agent(?! \(a foreign agent\))/i, file);
  }
});

test('the prepare page gives the Android device its own section', () => {
  const page = guidePage('02-prepare-your-app.md');
  const start = page.indexOf('## A simulator of its own');
  assert.notEqual(start, -1);
  const end = page.indexOf('\n## ', start + 1);
  assert.doesNotMatch(page.slice(start, end === -1 ? undefined : end), /Android/);
  assert.match(page, /^## An Android device of its own$/m);
});

test('the release notes and the package description keep phones, marked untested', () => {
  const intro = readFileSync('docs/releases/v1.2.0.md', 'utf8').split('\n').find(line => line.startsWith('jev-ios-bridge now checks Android'))!;
  assert.match(intro, /emulator or phone \(phones untested\)/);
  const { description } = JSON.parse(readFileSync('package.json', 'utf8')) as { description: string };
  assert.match(description, /emulator or phone \(phones untested\)/);
});
