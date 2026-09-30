import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseScriptedScenario } from '../src/scripted/schema.js';

/** Phase 8's Android scripts (release spec open point 17): they run on either emulator, so none names a device. */
const EVIDENCE_SCRIPTS = [
  'examples/diagnostic-app-android/scenario.json',
  'spikes/benchmarks/scenarios/android-twin-pass.json',
  'spikes/benchmarks/scenarios/android-twin-ambiguous.json',
  'spikes/benchmarks/scenarios/android-cmp-number-input.json',
  'spikes/benchmarks/scenarios/android-settings-search.json',
  'spikes/benchmarks/scenarios/android-settings-search-vi.json',
  'spikes/benchmarks/scenarios/android-settings-list-swipe.json',
];

for (const path of EVIDENCE_SCRIPTS) {
  test(`the evidence script ${path} parses as a version 1 Android script that names no device`, async () => {
    const script = parseScriptedScenario(JSON.parse(await readFile(join(process.cwd(), path), 'utf8')));
    assert.equal(script.platform, 'android');
    assert.equal(script.device, undefined);
  });
}
