import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseScriptedScenario } from '../src/scripted/schema.js';

const SCENARIOS = 'spikes/benchmarks/scenarios';

/** Phase 8's Android scripts (release spec open point 17): they run on either emulator, so none names a device. */
const EVIDENCE_SCRIPTS = [
  'examples/diagnostic-app-android/scenario.json',
  ...readdirSync(SCENARIOS).filter(name => /^android-.+\.json$/.test(name)).map(name => `${SCENARIOS}/${name}`),
];

test('phase 8 has seven Android evidence scripts', () => {
  assert.equal(EVIDENCE_SCRIPTS.length, 7, EVIDENCE_SCRIPTS.join(', '));
});

for (const path of EVIDENCE_SCRIPTS) {
  test(`the evidence script ${path} parses as a version 1 Android script that names no device`, async () => {
    const script = parseScriptedScenario(JSON.parse(await readFile(join(process.cwd(), path), 'utf8')));
    assert.equal(script.platform, 'android');
    assert.equal(script.device, undefined);
  });
}

test('no evidence script\'s preconditions name a path in the owner\'s home', async () => {
  for (const path of EVIDENCE_SCRIPTS) {
    const script = parseScriptedScenario(JSON.parse(await readFile(join(process.cwd(), path), 'utf8')));
    for (const precondition of script.preconditions ?? []) assert.doesNotMatch(precondition, /~\//, path);
  }
});

test('the cmp script names the owner\'s sample app by package and keeps its build command', async () => {
  const script = parseScriptedScenario(JSON.parse(await readFile(join(SCENARIOS, 'android-cmp-number-input.json'), 'utf8')));
  assert.ok(script.preconditions?.some(line => line.includes('the owner\'s Compose Multiplatform sample app (`cmp`, package `org.example.project`), built as it is')
    && line.includes('./gradlew :androidApp:assembleDebug')));
});
