import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteSkill } from '../scripts/build-plugin.mjs';

const androidSkill = readFileSync('skills/test-android/SKILL.md', 'utf8');
const npmCapture = 'npx jev-ios-bridge capture';
const npmGuide = 'node_modules/jev-ios-bridge/docs/guide/';

test('the plugin copy of /test-android runs capture and reads the guide from the plugin root', () => {
  const skill = rewriteSkill('test-android', androidSkill);
  assert.ok(skill.includes('node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" capture'));
  assert.ok(skill.includes('${CLAUDE_PLUGIN_ROOT}/docs/guide/'));
  assert.ok(!skill.includes(npmCapture));
  assert.ok(!skill.includes(npmGuide));
});

test('the plugin build refuses an Android skill that no longer mentions a path it rewrites', () => {
  for (const missing of [npmCapture, npmGuide]) {
    assert.throws(() => rewriteSkill('test-android', androidSkill.replaceAll(missing, '')),
      new Error(`skills/test-android/SKILL.md no longer mentions ${missing}; update build-plugin.mjs`));
  }
});

test('the plugin copy of /test-ios points its guide at the plugin and nothing at a bundled MobileBuildMCP', () => {
  const skill = rewriteSkill('test-ios', readFileSync('skills/test-ios/SKILL.md', 'utf8'));
  assert.ok(skill.includes('${CLAUDE_PLUGIN_ROOT}/docs/guide/'));
  assert.ok(!skill.includes('node_modules/jev-ios-bridge/docs/guide/'));
  assert.ok(!skill.includes('node_modules/mobilebuildmcp'));
});

function shippedText(): string[] {
  const files = ['README.md', 'skills/test-ios/SKILL.md', 'skills/test-android/SKILL.md'];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.md')) files.push(join(dir, entry.name));
    }
  };
  walk('docs/guide');
  return files;
}

test('no shipped skill, guide page or README tells anyone to install or run MobileBuildMCP or mobilecli', () => {
  for (const file of shippedText()) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/\bnpx\s+(?:-y\s+)?(?:mobilebuildmcp|mobilecli)\b|\b(?:mobilebuildmcp|mobilecli)@|ui-automation\s+snapshot-ui|installs with the bridge/i.test(text),
      `${file} still gives MobileBuildMCP or mobilecli install or usage advice`);
    for (const [, context] of text.matchAll(/(.{0,12})mobilebuildmcp/g)) {
      assert.ok(context!.endsWith('.'), `${file} names mobilebuildmcp outside the .mobilebuildmcp/config.yaml reader`);
    }
    for (const [match] of text.matchAll(/\.mobilebuildmcp[^\s`]*/g)) {
      assert.equal(match, '.mobilebuildmcp/config.yaml', `${file} names an unexpected MobileBuildMCP path`);
    }
  }
});

test('the plugin asks for an optional simulator and an optional Android device', () => {
  const manifest = JSON.parse(readFileSync('plugin/plugin.json', 'utf8'));
  const { simulator_udid: simulator, android_device: android, typesafe_api_key: key } = manifest.userConfig;
  assert.equal(key.required, true);
  assert.equal(simulator.required, false);
  assert.match(simulator.description, /iOS/);
  assert.equal(android.type, 'string');
  assert.equal(android.title, 'Android device');
  assert.equal(android.required, false);
  assert.match(android.description, /serial/);
  assert.match(android.description, /AVD/);
  const env = manifest.mcpServers['jev-ios-bridge'].env;
  assert.equal(env.JEV_DEVICE_UDID, '${user_config.simulator_udid}');
  assert.equal(env.JEV_ANDROID_DEVICE, '${user_config.android_device}');
  assert.equal(manifest.name, 'jev-ios-bridge');
  assert.match(manifest.description, /iOS/);
  assert.match(manifest.description, /Android/);
  assert.ok(manifest.keywords.includes('ios'));
  assert.ok(manifest.keywords.includes('android'));
});

test('package.json says iOS and Android, under the same name', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.name, 'jev-ios-bridge');
  assert.match(pkg.description, /iOS/);
  assert.match(pkg.description, /Android/);
  assert.ok(pkg.keywords.includes('ios'));
  assert.ok(pkg.keywords.includes('android'));
});

test('/test-android is named test-android, links only guide pages that exist, and never names mobilecli', () => {
  assert.match(androidSkill, /^---\nname: test-android\n/);
  assert.ok(!/mobilecli/i.test(androidSkill));
  const pages = [...androidSkill.matchAll(/`([^`\s]+\.md)`/g)].map(match => match[1]!);
  assert.ok(pages.length >= 5, `expected guide links, found ${pages.join(', ')}`);
  for (const page of pages) {
    assert.ok(existsSync(join('docs/guide', page)), `/test-android links missing guide page ${page}`);
  }
});
