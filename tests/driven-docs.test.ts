/**
 * The driven-steps docs (Issue 10) stay in step with the code: every hand-back reason and answer kind is listed,
 * report-json.md lists every field of a driven report, and the skills teach the hand-back loop.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HANDBACK_ANSWER_KINDS, PAUSE_REASON_TEXT } from '../src/driven/vocabulary.js';

const read = (path: string) => readFileSync(path, 'utf8');

test('the driven-steps page lists every hand-back reason and every answer kind', () => {
  const page = read('docs/guide/13-driven-steps.md');
  const reasons = [...page.matchAll(/^\| `([A-Z_]+)` \|/gm)].map(match => match[1]);
  assert.deepEqual(reasons.sort(), Object.keys(PAUSE_REASON_TEXT).sort());
  for (const kind of HANDBACK_ANSWER_KINDS) assert.ok(page.includes(`"kind": "${kind}"`), `the page doesn't show answer ${kind}`);
  for (const text of ['JEV_EXPERIMENTAL_DRIVEN', '`1` or `true`', '.jev/config.json', '.jev/preflight.json',
    'localOnlyScreens', 'handbackTimeoutMs', 'wall-time', 'Only MCP can answer', 'pixels of the screenshot file',
    'Android only', 'Real iPhones aren\'t supported', 'canvas', 'web views', 'system sheets']) {
    assert.ok(page.includes(text), `13-driven-steps.md does not cover ${text}`);
  }
});

test('report-json.md lists every field of a driven run\'s report', () => {
  const page = read('docs/guide/reference/report-json.md');
  const listed = new Set(page.split('\n').filter(row => row.startsWith('| `'))
    .flatMap(row => [...row.split(' | ')[0]!.matchAll(/`([A-Za-z]+)`/g)].map(match => match[1]!)));
  const golden = JSON.parse(read('tests/golden/report-json-driven.json')) as Record<string, Record<string, unknown>>;
  for (const report of Object.values(golden)) {
    for (const field of [...Object.keys(report), ...Object.keys(report.driven as object)]) {
      assert.ok(listed.has(field), `report-json.md does not list ${field}`);
    }
  }
});

test('both skills teach driven mode: do steps, the hand-back loop, checkpoints from the developer, the data change', () => {
  for (const skill of ['skills/test-ios/SKILL.md', 'skills/test-android/SKILL.md']) {
    const text = read(skill);
    for (const part of ['"version": 2', '"kind": "do"', 'doneWhen', 'effect', 'fromEnv', 'needs_claude', 'resolve_step',
      'get_report', '"revise"', '"stop"', '"done"', 'decidedBy', 'TypeSafe', 'every decision', 'never invent']) {
      assert.ok(text.includes(part), `${skill} does not mention ${part}`);
    }
  }
});

test('the CHANGELOG has an unreleased 1.3.0 entry for driven steps', () => {
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, /^## 1\.3\.0 \(unreleased\)$/m);
  assert.ok(changelog.indexOf('## 1.3.0') < changelog.indexOf('## 1.2.0'));
  for (const text of ['resolve_step', 'experimentalDriven', 'APP_NOT_IN_FOREGROUND', 'fromEnv', 'attach']) {
    assert.ok(changelog.slice(0, changelog.indexOf('## 1.2.0')).includes(text), `the 1.3.0 entry does not mention ${text}`);
  }
});
