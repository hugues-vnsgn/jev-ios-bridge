#!/usr/bin/env node
// Builds the Claude Code plugin zip for a GitHub release: the bridge, its /test-ios and /test-android skills,
// and its MCP server, for iOS and Android.
// Dependencies aren't bundled. Claude Code installs them from the lockfile on install
// (npm ci --ignore-scripts), which keeps MobileBuildMCP's bundled AXe binary executable.
// Output: build/plugin/jev-ios-bridge/ (the plugin root), its zip, and the marketplace.json that points at the zip.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The skills ship for npm installs too, so point their paths at the plugin only in the plugin's copy.
const skillRewrites = {
  'test-ios': [
    ['node_modules/jev-ios-bridge/docs/guide/', '${CLAUDE_PLUGIN_ROOT}/docs/guide/'],
    ['npx mobilebuildmcp', 'node "${CLAUDE_PLUGIN_ROOT}/node_modules/mobilebuildmcp/build/cli.js"'],
  ],
  'test-android': [
    ['node_modules/jev-ios-bridge/docs/guide/', '${CLAUDE_PLUGIN_ROOT}/docs/guide/'],
    ['npx jev-ios-bridge capture', 'node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" capture'],
  ],
};

/** The plugin's copy of skills/<name>/SKILL.md. Throws when the skill no longer mentions a path it rewrites. */
export function rewriteSkill(name, skill) {
  for (const [from, to] of skillRewrites[name]) {
    if (!skill.includes(from)) throw new Error(`skills/${name}/SKILL.md no longer mentions ${from}; update build-plugin.mjs`);
    skill = skill.replaceAll(from, to);
  }
  return skill;
}

// Tests import rewriteSkill; only `npm run build:plugin` builds.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) build();

function build() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const out = 'build/plugin';
  const root = join(out, 'jev-ios-bridge');
  const zip = join(out, `jev-ios-bridge-plugin-${pkg.version}.zip`);
  const json = value => `${JSON.stringify(value, null, 2)}\n`;

  rmSync(out, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  for (const path of ['dist', 'docs/guide', 'README.md', 'LICENSE', 'CHANGELOG.md']) cpSync(path, join(root, path), { recursive: true });

  mkdirSync(join(root, '.claude-plugin'));
  writeFileSync(join(root, '.claude-plugin/plugin.json'), json({ ...JSON.parse(readFileSync('plugin/plugin.json', 'utf8')), version: pkg.version }));

  for (const name of Object.keys(skillRewrites)) {
    mkdirSync(join(root, 'skills', name), { recursive: true });
    writeFileSync(join(root, 'skills', name, 'SKILL.md'), rewriteSkill(name, readFileSync(`skills/${name}/SKILL.md`, 'utf8')));
  }

  // Runtime dependencies only, with the exact versions from the repo's lockfile.
  const { name, version, type, license, engines, dependencies } = pkg;
  writeFileSync(join(root, 'package.json'), json({ name, version, private: true, type, license, engines, dependencies }));
  cpSync('package-lock.json', join(root, 'package-lock.json'));
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });

  // The plugin root sits at the top of the zip.
  execFileSync('zip', ['-qrX', join('..', basename(zip)), '.'], { cwd: root });
  const sha256 = createHash('sha256').update(readFileSync(zip)).digest('hex');
  writeFileSync(join(out, 'marketplace.json'), json({
    name: 'jev-ios-bridge',
    owner: { name: 'hugues-vnsgn', url: 'https://github.com/hugues-vnsgn' },
    description: 'jev-ios-bridge: scripted iOS simulator and Android emulator checks judged by Jev',
    plugins: [{
      name: 'jev-ios-bridge',
      description: pkg.description,
      source: {
        source: 'archive',
        url: `https://github.com/hugues-vnsgn/jev-ios-bridge/releases/download/v${pkg.version}/${basename(zip)}`,
        sha256,
      },
    }],
  }));
  console.log(`${zip}\nsha256 ${sha256}\n${join(out, 'marketplace.json')}`);
}
