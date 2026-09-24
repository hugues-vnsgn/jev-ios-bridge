import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssertionManifest, ScriptedCorpus } from '../contracts.js';
import { digest, validateFrozenManifest } from '../harness.js';

const dir = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')) as ScriptedCorpus;
const manifest = JSON.parse(readFileSync(join(dir, 'review/manifest.frozen.json'), 'utf8')) as AssertionManifest;
validateFrozenManifest(corpus, manifest);

const groups = new Map<string, typeof corpus.cases>();
for (const item of corpus.cases) {
  const rows = groups.get(item.workflowGroup) ?? [];
  rows.push(item);
  groups.set(item.workflowGroup, rows);
}

const lines = [
  '# Scripted bridge assertion labels: owner review', '',
  'These 24 screens are new held-out captures from the dedicated `jev-ios-bridge` simulator. The eight workflow groups cover Weather, Contacts, Reminders, and Diagnostic App. Each screen has one proposed true claim and one proposed false claim. Review the image, raw accessibility capture, setup, and both labels before approving this exact bundle. No scripted Jev call has been made.', '',
  `Corpus digest: \`${digest(corpus)}\`  `,
  `Frozen manifest digest: \`${digest(manifest)}\`  `,
  `Implementation digest: \`${manifest.implementationSha256}\``, '',
  'The two claims use neutral IDs `a` and `b`. Their order and ID assignment are each balanced across the corpus, so neither position nor ID reveals the expected answer. Labels and rationales stay in this local review data; they are excluded from Jev requests. The approval template is still `approved: false`.', '',
  'Two rejected captures remain under `preflight/`: the first Tessa list view had its lower row behind Search, and a deeper email-form swipe exceeded the request byte cap. Neither is in the 24 scored screens. The scored list view exposes both rows; the scored email view uses a shorter real swipe and passes the fixed budget.', '',
];

for (const [group, cases] of groups) {
  lines.push(`## ${group}`, '');
  for (const item of cases) {
    lines.push(`### ${item.id}`, '',
      `[Screenshot](../${item.assets.screenshotPath}) · [Full MobileBuildMCP capture](../${item.assets.fullPath})`, '',
      `Setup: ${item.setupSteps.join(' → ')}`, '',
      ...item.claims.map(claim => `- **${claim.id} · expected ${claim.expected ? 'true' : 'false'}:** ${claim.claim} ${claim.rationale}`), '');
  }
}

writeFileSync(join(dir, 'review/case-review.md'), lines.join('\n'), { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ cases: corpus.cases.length, groups: groups.size,
  corpusSha256: digest(corpus), manifestSha256: digest(manifest) }) + '\n');
