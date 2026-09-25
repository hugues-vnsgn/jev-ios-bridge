import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'));

function actionDescription(item, id) {
  if (id === 'wait') return '`wait`: Wait for the screen to change';
  if (id === 'stop-goal') return '`stop-goal`: Stop because the goal is reached';
  if (id === 'stop-blocked') return '`stop-blocked`: Stop because of an observed blocker';
  if (id === 'none') return '`none`: No listed action fits';
  const [kind, ref, argument] = id.split(':');
  const element = item.fullSnapshot.elements.find(row => row.ref === ref);
  const name = element?.label || element?.identifier || element?.role || ref;
  if (kind === 'tap') return `\`${id}\`: Tap ${name}`;
  if (kind === 'swipe') return `\`${id}\`: Swipe ${argument} in ${name}`;
  if (kind === 'type') return `\`${id}\`: Replace all text in ${name} with supplied ${argument} value (${item.scenario.values[argument]})`;
  throw new Error(`Unknown action ID: ${id}`);
}

const lines = [
  '# Checkpoint feasibility cases for owner review', '',
  'These 30 labels are drafts: the original 10 tuning captures have new checkpoint goals for development, and the 20 held-out captures are fresh. Review each screenshot, paired compact/full capture, acceptable action set, completion label, and assertion label before approving the frozen experiment. The complete offered-option list and hashes are in [label-review.md](label-review.md).', '',
  'Each goal names one desired screen state at the active checkpoint. Values appear only where that checkpoint types. [Corpus notes](../README.md) record the synthetic setup and capture limitations. No screen justifies a `wait` label; that category remains unverified.', '',
  'Both Iris Moss rows are valid inspection steps because the list does not reveal which has the unique old email. On the final Weather, Contacts, Reminders, and Diagnostic screens, a visible desired state can coexist with a false assertion. A reached goal with a false assertion supports a failed verdict under the all-assertions rule.', '',
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
    `Acceptable next action${item.labels.acceptableActionIds.length === 1 ? '' : 's'}: ${item.labels.acceptableActionIds.map(id => actionDescription(item, id)).join(' or ')}`, '',
    `Goal reached: ${item.labels.goalReached ? 'yes' : 'no'}`, '',
    ...item.scenario.assertions.map(assertion => `Assertion ${assertion.id}: ${assertion.claim} **${item.labels.assertions[assertion.id] ? 'yes' : 'no'}**`),
    '',
  );
  if (item.positionalVariant) {
    lines.push(
      `Supplementary positional wording on this same screen: ${item.positionalVariant.goal}`, '',
      `Acceptable action: ${item.positionalVariant.acceptableActionIds.map(id => actionDescription(item, id)).join(' or ')}`, '',
    );
  }
}
writeFileSync(join(dir, 'review', 'case-review.md'), lines.join('\n'));
process.stdout.write(`Wrote review page for ${corpus.cases.length} cases.\n`);
