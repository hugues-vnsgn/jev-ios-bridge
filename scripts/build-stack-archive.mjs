import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNotices } from './generate-stack-notices.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const node = '26.8.1'; const npm = '11.19.0';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';
const stack = join(root, 'stack'); const out = join(stack, 'release');

if (process.versions.node !== node || execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== npm) {
  execFileSync('npx', ['--yes', `--package=node@${node}`, `--package=npm@${npm}`, '--', 'node', fileURLToPath(import.meta.url)], { cwd: root, stdio: 'inherit' });
} else {
  const freeze = read(join(stack, 'freeze.json')); const provenance = read(join(stack, 'wda/provenance.json'));
  if (sha(readFileSync(join(stack, 'package-lock.json'))) !== freeze.lockSha256 || sha(readFileSync(join(stack, 'package.json'))) !== freeze.packageSha256)
    throw new Error('Phase 1 candidate files differ. Re-freezing requires the owner.');
  const wdaArchive = join(stack, 'wda/wda-16.14.2.tar.gz');
  if (sha(readFileSync(wdaArchive)) !== provenance.archiveSha256) throw new Error('Qualified WDA archive differs.');
  execFileSync('npm', ['ci', '--ignore-scripts', '--os=darwin', '--cpu=arm64', '--prefix', stack, '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  mkdirSync(join(root, 'build'), { recursive: true });
  const work = mkdtempSync(join(root, 'build/stack-'));
  try {
    const files = {};
    const walk = (base, directory = '') => {
      for (const name of readdirSync(join(base, directory)).sort()) {
        const path = directory ? `${directory}/${name}` : name; const full = join(base, path); const stat = lstatSync(full);
        if (stat.isDirectory()) walk(base, path);
        else if (stat.isSymbolicLink()) files[path] = { kind: 'symlink', target: readlinkSync(full) };
        else if (stat.isFile()) files[path] = { kind: 'file', sha256: sha(readFileSync(full)), mode: stat.mode & 0o111 ? 0o755 : 0o644 };
        else throw new Error(`Unsupported archive entry ${path}`);
      }
    };
    walk(stack, 'node_modules');
    for (const [path, expected] of Object.entries(freeze.loaded))
      if (files[path]?.sha256 !== expected) throw new Error(`Phase 1 loaded file differs: ${path}`);
    for (const pkg of freeze.packages)
      if (files[pkg.path + '/package.json']?.sha256 !== pkg.packageJsonSha256) throw new Error(`Phase 1 package differs: ${pkg.path}`);
    for (const apk of freeze.androidApks)
      if (files[apk.path]?.sha256 !== apk.sha256) throw new Error(`Phase 1 APK differs: ${apk.path}`);
    const lock = read(join(stack, 'package-lock.json'));
    const packages = [];
    for (const [path, expected] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
      if (!path || !files[path + '/package.json']) continue;
      const actual = read(join(stack, path, 'package.json'));
      if (actual.version !== expected.version) throw new Error(`Locked version differs: ${path}`);
      let archive = path;
      while (!lock.packages[archive]?.integrity && archive.includes('/node_modules/')) archive = archive.slice(0, archive.lastIndexOf('/node_modules/'));
      packages.push({ path, name: actual.name, version: actual.version, integrity: lock.packages[archive]?.integrity ?? null,
        integritySource: archive, resolved: lock.packages[archive]?.resolved ?? null });
    }
    execFileSync('/usr/bin/tar', ['-xzf', wdaArchive, '-C', work], { env: { PATH: '/usr/bin:/bin', COPYFILE_DISABLE: '1' } });
    walk(work, 'wda');
    const wdaPath = 'wda/WebDriverAgentRunner-Runner.app';
    const runnerFiles = Object.entries(files).filter(([path]) => path.startsWith(wdaPath + '/')).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    const treeSha256 = sha(Buffer.concat(runnerFiles.map(([path, entry]) => Buffer.concat([Buffer.from(path.slice(wdaPath.length + 1) + '\0'), Buffer.from(entry.sha256, 'hex')]))));
    if (treeSha256 !== provenance.treeSha256 || runnerFiles.length !== provenance.files.length) throw new Error('Qualified WDA tree differs.');
    const manifest = { version: 1, lockSha256: freeze.lockSha256, files, loaded: Object.keys(freeze.loaded).sort(), packages,
      androidApks: freeze.androidApks, wda: { version: '16.14.2', path: wdaPath, treeSha256 } };
    writeFileSync(join(out, 'manifest.json'), json(manifest));
    execFileSync('python3', ['-c', String.raw`
import gzip, pathlib, sys, tarfile
source=pathlib.Path(sys.argv[1]); destination=pathlib.Path(sys.argv[2])
with destination.open('wb') as output, gzip.GzipFile(fileobj=output,mode='wb',filename='',mtime=0) as compressed, tarfile.open(fileobj=compressed,mode='w',format=tarfile.PAX_FORMAT) as archive:
    for path in [source/'node_modules', *sorted((source/'node_modules').rglob('*'))]:
        entry=archive.gettarinfo(str(path),arcname=path.relative_to(source).as_posix())
        entry.uid=entry.gid=0;entry.uname=entry.gname='';entry.mtime=0;entry.pax_headers={}
        entry.mode=0o755 if path.is_dir() or path.lstat().st_mode & 0o111 else 0o644
        if entry.isfile():
            with path.open('rb') as content: archive.addfile(entry,content)
        else: archive.addfile(entry)
`, stack, join(out, 'stack.tar.gz')], { stdio: 'inherit', maxBuffer: 1024 * 1024 });
    cpSync(wdaArchive, join(out, 'wda.tar.gz'));
    const identity = { version: 1, stackSha256: sha(readFileSync(join(out, 'stack.tar.gz'))),
      wdaSha256: provenance.archiveSha256, manifestSha256: sha(readFileSync(join(out, 'manifest.json'))) };
    const identityModule = `export default ${json(identity).trim()};\n`;
    if (!existsSync(join(root, 'dist/appium/stack.js'))) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    writeFileSync(join(root, 'dist/appium/stack-identity.js'), identityModule);
    generateNotices({ root, files, packages });
    console.log(JSON.stringify({ ...identity, node, npm, packages: packages.length, files: Object.keys(files).length, loaded: manifest.loaded.length, wdaFiles: runnerFiles.length }));
  } finally { rmSync(work, { recursive: true, force: true }); }
}
