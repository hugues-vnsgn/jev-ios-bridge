/** The plugin's experimental driven-mode setting (Issue 09, E13): off by default, passed to the MCP server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPERIMENTAL_DRIVEN_ENV, experimentalDrivenOn } from '../src/driven/project.js';

const manifest = JSON.parse(readFileSync('plugin/plugin.json', 'utf8'));

test('the plugin has an optional experimentalDriven setting, a boolean that is off by default', () => {
  const setting = manifest.userConfig.experimentalDriven;
  assert.equal(setting.type, 'boolean');
  assert.equal(setting.default, false);
  assert.equal(setting.required, false);
  assert.match(setting.description, /\.jev\/config\.json/);
  assert.match(setting.description, /drivenMode/);
  assert.match(setting.description, /TypeSafe/);
});

test('the setting reaches the MCP server as JEV_EXPERIMENTAL_DRIVEN, read as on only when true', () => {
  const env = manifest.mcpServers['jev-ios-bridge'].env;
  assert.equal(env[EXPERIMENTAL_DRIVEN_ENV], '${user_config.experimentalDriven}');
  // Claude Code substitutes the boolean as text; either spelling of on works, anything else is off.
  assert.equal(experimentalDrivenOn({ [EXPERIMENTAL_DRIVEN_ENV]: 'true' }), true);
  assert.equal(experimentalDrivenOn({ [EXPERIMENTAL_DRIVEN_ENV]: 'false' }), false);
  assert.equal(experimentalDrivenOn({ [EXPERIMENTAL_DRIVEN_ENV]: '' }), false);
});

test('the existing settings and server environment are kept', () => {
  assert.deepEqual(Object.keys(manifest.userConfig),
    ['typesafe_api_key', 'simulator_udid', 'android_device', 'experimentalDriven']);
  assert.deepEqual(Object.keys(manifest.mcpServers['jev-ios-bridge'].env),
    ['TYPESAFE_API_KEY', 'JEV_DEVICE_UDID', 'JEV_ANDROID_DEVICE', 'JEV_PROJECT_DIR', 'JEV_EXPERIMENTAL_DRIVEN']);
});
