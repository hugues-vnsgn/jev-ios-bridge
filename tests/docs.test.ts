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

test('the script-format reference says a non-English typed value passes through the device clipboard', () => {
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
