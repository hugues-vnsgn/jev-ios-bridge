import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('the plugin copy of /test-ios keeps its MobileBuildMCP and guide rewrites', () => {
  const skill = rewriteSkill('test-ios', readFileSync('skills/test-ios/SKILL.md', 'utf8'));
  assert.ok(skill.includes('node "${CLAUDE_PLUGIN_ROOT}/node_modules/mobilebuildmcp/build/cli.js"'));
  assert.ok(skill.includes('${CLAUDE_PLUGIN_ROOT}/docs/guide/'));
  assert.ok(!skill.includes('npx mobilebuildmcp'));
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
