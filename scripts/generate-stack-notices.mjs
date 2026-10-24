import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export function generateNotices({ root, files, packages }) {
  const texts = new Map(); const rows = []; const noMetadata = new Set();
  const audited = { pipenet: 'MIT', 'ftp-response-parser': 'MIT', 'parse-listing': 'MIT' };
  const source = repository => typeof repository === 'string' ? repository : repository?.url ?? '';
  for (const pkg of packages) {
    const metadata = JSON.parse(readFileSync(join(root, 'stack', pkg.path, 'package.json'), 'utf8'));
    let license = typeof metadata.license === 'string' ? metadata.license : metadata.license?.type;
    if (!license) {
      if (!audited[pkg.name]) throw new Error(`Hand check required for missing licence metadata: ${pkg.name}`);
      license = audited[pkg.name]; noMetadata.add(pkg.name);
    }
    rows.push(`| ${pkg.name}@${pkg.version} | ${license.replaceAll('|', '/')} | ${source(metadata.repository).replaceAll('|', '/')} |`);
  }
  for (const path of Object.keys(files).sort()) {
    if (!path.startsWith('node_modules/') || files[path].kind !== 'file' || !/^(licen[cs]e|copying|notice|copyright)([.-].*)?$/i.test(basename(path))) continue;
    const bytes = readFileSync(join(root, 'stack', path));
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8'); const digest = createHash('sha256').update(bytes).digest('hex');
    const group = texts.get(digest) ?? { paths: [], text }; group.paths.push(path); texts.set(digest, group);
  }
  const listingReadme = readFileSync(join(root, 'stack/node_modules/parse-listing/README.md'), 'utf8');
  const listingLicense = listingReadme.slice(listingReadme.indexOf('## License'));
  if (!listingLicense.includes('Copyright(c) 2013 Sergi Mansilla')) throw new Error('parse-listing licence needs another hand check');
  let result = '# Third-party notices\n\nThe frozen stack and qualified WebDriverAgent runner are redistributed unmodified. This inventory describes the darwin-arm64 archive produced from the Phase 1 lock. Licence and notice files also remain at their original paths inside that archive. The GNU licence copies come from https://www.gnu.org/licenses/lgpl-3.0.txt and https://github.com/spdx/license-list-data/blob/main/text/GPL-3.0-only.txt.\n\n';
  result += '## libvips\n\n`@img/sharp-libvips-darwin-arm64` is distributed under LGPL-3.0-or-later. The binary is unmodified. Source and build instructions are at https://github.com/lovell/sharp-libvips/tree/v1.3.4; component versions are in its `versions.json`. libvips source is at https://github.com/libvips/libvips/tree/v8.18.7. Replace the library in the extracted package to use a modified build; the bridge refuses a changed frozen artifact, so an owner-approved re-freeze must update its hashes. The LGPL and accompanying GPL terms follow.\n\n';
  for (const name of ['LGPL-3.0.txt', 'GPL-3.0.txt']) result += `### ${name}\n\n\`\`\`\`text\n${readFileSync(join(root, 'stack/licenses', name), 'utf8')}\n\`\`\`\`\n\n`;
  result += '## Attribution\n\n`spdx-exceptions` data is by The Linux Foundation under CC-BY-3.0 (https://github.com/kemitchell/spdx-exceptions.json). `@promptbook/utils` is by the Promptbook contributors under CC-BY-4.0 (https://github.com/webgptorg/promptbook). Both are redistributed without modification; the texts below retain their supplied notices.\n\n';
  result += '## WebDriverAgent\n\nThe qualified runner is built from `appium-webdriveragent` 16.14.2 bundled in `appium-xcuitest-driver` 12.17.1. Its package metadata says Apache-2.0; its supplied Facebook BSD text below governs this notice. Apple-supplied runner and framework signatures are recorded in `stack/wda/provenance.json`.\n\n';
  result += readFileSync(join(root, 'stack/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent/LICENSE'), 'utf8') + '\n\n';
  result += `## Packages without a license field\n\nHand-checked against the installed files: ${[...noMetadata].sort().map(name => `\`${name}\``).join(', ')}. All three ship MIT text; the two FTP packages also carry MIT in their legacy \`licenses\` arrays. \`parse-listing\` puts its copyright and MIT text in its README, reproduced below. The supplied \`ftp-response-parser/LICENSE\` retains its placeholder copyright line.\n\n\`\`\`\`text\n${listingLicense}\n\`\`\`\`\n\n`;
  result += '## Package inventory\n\n| Package | Licence | Source |\n| --- | --- | --- |\n' + rows.join('\n') + '\n\n## Supplied licence and notice texts\n\n';
  for (const { paths, text } of texts.values()) result += paths.map(path => `- \`${path}\``).join('\n') + `\n\n\`\`\`\`text\n${text}\n\`\`\`\`\n\n`;
  writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), result);
}
