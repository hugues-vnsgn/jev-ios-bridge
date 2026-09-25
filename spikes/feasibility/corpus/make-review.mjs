import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'));

function actionDescription(item, id) {
  if (id === 'wait') return 'Wait for the screen to change';
  if (id === 'stop-goal') return 'Stop: goal reached';
  if (id === 'stop-blocked') return 'Stop: observed blocker';
  if (id === 'none') return 'None of the listed actions';
  const [kind, ref, argument] = id.split(':');
  const element = item.fullSnapshot.elements.find(row => row.ref === ref);
  const name = element?.label || element?.identifier || element?.role || ref;
  if (kind === 'tap') return `Tap ${name}`;
  if (kind === 'swipe') return `Swipe ${argument} in ${name}`;
  if (kind === 'type') return `Replace all text in ${name} with supplied ${argument} value (${item.scenario.values[argument]})`;
  throw new Error(`Unknown action ID: ${id}`);
}

const lines = [
  '# Corpus cases for owner label review', '',
  'These 30 labels are drafts. Review the screenshot and the paired compact/full evidence for each case before approving a frozen experiment. The full candidate list and the corpus and manifest hashes are in [label-review.md](label-review.md).', '',
  'The corpus has no truthful wait case. The iOS 26.4 simulator does not show Software Update under General, and no captured screen showed a transient loading state. This is a coverage gap against the feasibility plan.', '',
  'In h04, finding the United States region completes the goal, while the claim that the region is France is false. A completed run should therefore fail that assertion. In h18 and h19, zero active reminders do not rule out a completed item; search remains the proposed next step before the settled empty result in h20.', '',
];
for (const item of corpus.cases) {
  const screen = `../${item.assets.screenshotPath}`;
  const compact = `../${item.assets.compactPath}`;
  const full = `../${item.assets.fullPath}`;
  lines.push(
    `## ${item.id} (${item.partition})`, '',
    `Goal: ${item.scenario.goal}`, '',
    `Screen: [screenshot](${screen}) · [compact capture](${compact}) · [full capture](${full})`, '',
    `Supplied values: ${Object.keys(item.scenario.values).length ? Object.entries(item.scenario.values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ') : 'none'}`, '',
    `Recent steps: ${item.history.length ? item.history.map(step => step.description).join(' → ') : 'none'}`, '',
    `Acceptable next action${item.labels.acceptableActionIds.length === 1 ? '' : 's'}: ${[...new Set(item.labels.acceptableActionIds.map(id => actionDescription(item, id)))].join(' or ')}`, '',
    `Goal reached: ${item.labels.goalReached ? 'yes' : 'no'}`, '',
    ...item.scenario.assertions.map(assertion => `Assertion ${assertion.id}: ${assertion.claim} **${item.labels.assertions[assertion.id] ? 'yes' : 'no'}**`),
    '',
  );
  if (item.positionalVariant) {
    lines.push(
      `Supplementary positional wording on this same screen: ${item.positionalVariant.goal}`, '',
      `Acceptable action: ${[...new Set(item.positionalVariant.acceptableActionIds.map(id => actionDescription(item, id)))].join(' or ')}`, '',
    );
  }
}
writeFileSync(join(dir, 'review', 'case-review.md'), lines.join('\n'));
process.stdout.write(`Wrote review page for ${corpus.cases.length} cases.\n`);
