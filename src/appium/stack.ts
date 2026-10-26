import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod/v4';

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const pathSchema = z.string().min(1).refine(path => !path.includes('\0') && !path.includes('\\') && !isAbsolute(path)
  && path.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
const entrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('file'), sha256: hash, mode: z.number().int().min(0).max(0o777) }),
  z.strictObject({ kind: z.literal('symlink'), target: z.string().min(1) }),
]);
const identitySchema = z.strictObject({ version: z.literal(1), stackSha256: hash, wdaSha256: hash, manifestSha256: hash });
const manifestSchema = z.strictObject({ version: z.literal(1), lockSha256: hash,
  files: z.record(pathSchema, entrySchema), loaded: z.array(pathSchema).min(1),
  packages: z.array(z.strictObject({ path: pathSchema, name: z.string(), version: z.string(), integrity: z.string().nullable(),
    integritySource: pathSchema, resolved: z.string().nullable() })),
  androidApks: z.array(z.strictObject({ path: pathSchema, sha256: hash, package: z.string() })),
  wda: z.strictObject({ version: z.literal('16.14.2'), path: pathSchema, treeSha256: hash }),
});
export type StackIdentity = z.infer<typeof identitySchema>;
type Manifest = z.infer<typeof manifestSchema>;
type Host = { platform: string; arch: string; node: string };
type Inputs = { artifactRoot: string; dataRoot: string; identity: StackIdentity; host: Host };
type Selection = { iosVersion?: string; xcodeVersion?: string };
export type VerifiedStack = { root: string; nodeModules: string; wdaRunner: string; identity: StackIdentity; manifest: Manifest; warnings: string[] };
export class StackError extends Error {
  constructor(readonly code: string, detail: string) { super(detail); this.name = 'StackError'; }
}
const tar = promisify(execFile);
const tarEnv = { PATH: '/usr/bin:/bin', LANG: 'C', COPYFILE_DISABLE: '1' };
function refuse(code: string, detail: string): never { throw new StackError(code, detail); }
function withHint<T>(hint: string, check: () => T): T {
  try { return check(); }
  catch (error) { throw error instanceof StackError ? new StackError(error.code, `${error.message} ${hint}`) : error; }
}
function checkHost(host: Host): void {
  const major = /^(\d+)\./.exec(host.node)?.[1];
  if (host.platform !== 'darwin' || host.arch !== 'arm64' || !major || Number(major) < 24)
    refuse('UNSUPPORTED_HOST', 'The frozen stack requires macOS on Apple silicon and Node 24 or later.');
}
function archiveBytes(root: string, name: string, expected: string, code: string): Buffer {
  try {
    const path = join(root, name);
    if (!lstatSync(path).isFile()) refuse(code, `Expected a regular ${name}.`);
    const bytes = readFileSync(path);
    if (sha256(bytes) !== expected) refuse(code, `${name} differs from the built bridge.`);
    return bytes;
  } catch (error) {
    if (error instanceof StackError) throw error;
    return refuse(code, `Cannot verify ${name}.`);
  }
}
function checkEntry(root: string, path: string, entry: z.infer<typeof entrySchema>, code: string): void {
  try {
    for (let parent = dirname(path); parent !== '.'; parent = dirname(parent))
      if (!lstatSync(join(root, parent)).isDirectory()) refuse(code, `Unexpected parent of ${path}.`);
    const full = join(root, path); const stat = lstatSync(full);
    if (entry.kind === 'file') {
      if (!stat.isFile() || sha256(readFileSync(full)) !== entry.sha256 || (stat.mode & 0o111) !== (entry.mode & 0o111))
        refuse(code, `Frozen file differs: ${path}.`);
    } else {
      const target = posix.normalize(posix.join(posix.dirname(path), entry.target));
      if (isAbsolute(entry.target) || entry.target.includes('\0') || target === '..' || target.startsWith('../')
        || !stat.isSymbolicLink() || readlinkSync(full) !== entry.target)
        refuse(code, `Frozen link differs: ${path}.`);
    }
  } catch (error) {
    if (error instanceof StackError) throw error;
    refuse(code, `Cannot verify frozen file: ${path}.`);
  }
}
function verifyTree(root: string, manifest: Manifest, firstUse: boolean): void {
  if (!lstatSync(root).isDirectory()) refuse('STACK_FILE_MISMATCH', 'The extracted stack is not a directory.');
  const selected = new Set(firstUse ? Object.keys(manifest.files) : [...manifest.loaded, ...manifest.androidApks.map(apk => apk.path)]);
  for (const path of Object.keys(manifest.files)) if (path.startsWith(manifest.wda.path + '/')) selected.add(path);
  for (const path of selected) {
    const entry = manifest.files[path];
    if (!entry) refuse('STACK_MANIFEST_MISMATCH', `Manifest has no entry for ${path}.`);
    checkEntry(root, path, entry, path.startsWith('wda/') ? 'WDA_MISMATCH' : 'STACK_FILE_MISMATCH');
  }
  for (const apk of manifest.androidApks) {
    const entry = manifest.files[apk.path];
    if (entry?.kind !== 'file' || entry.sha256 !== apk.sha256) refuse('STACK_MANIFEST_MISMATCH', 'Android APK identity differs.');
  }
  const wda = Object.entries(manifest.files).filter(([path]) => path.startsWith(manifest.wda.path + '/'))
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  if (wda.length === 0 || sha256(Buffer.concat(wda.map(([path, entry]) => {
    if (entry.kind !== 'file') return refuse('WDA_MISMATCH', 'The WDA tree contains a non-file.');
    return Buffer.concat([Buffer.from(path.slice(manifest.wda.path.length + 1) + '\0'), Buffer.from(entry.sha256, 'hex')]);
  }))) !== manifest.wda.treeSha256) refuse('WDA_MISMATCH', 'The WDA tree identity differs.');
  const walk = (directory: string): void => {
    for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${item.name}` : item.name;
      if (path === '.verified.json') continue;
      if (item.isDirectory()) walk(path);
      else if (!manifest.files[path]) refuse('STACK_FILE_MISMATCH', `Unexpected file: ${path}.`);
    }
  };
  walk('');
}
function marker(root: string, expected: string): void {
  try {
    const path = join(root, '.verified.json');
    if (!lstatSync(path).isFile() || readFileSync(path, 'utf8') !== expected) refuse('STACK_MARKER_MISMATCH', 'The extraction marker differs.');
  } catch (error) {
    if (error instanceof StackError) throw error;
    refuse('STACK_MARKER_MISMATCH', 'The extraction marker is missing.');
  }
}

export class FrozenStack {
  private constructor(private readonly inputs: () => Promise<Inputs>) {}
  static shipped(): FrozenStack {
    return new FrozenStack(async () => {
      const host = { platform: process.platform, arch: process.arch, node: process.versions.node };
      checkHost(host);
      const generated: unknown = (await import(new URL('./stack-identity.js', import.meta.url).href)).default;
      return { host, identity: identitySchema.parse(generated),
        artifactRoot: fileURLToPath(new URL('../../stack/release/', import.meta.url)),
        dataRoot: join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/stacks') };
    });
  }
  static forTesting(inputs: Inputs): FrozenStack { return new FrozenStack(async () => inputs); }
  async prepare(selection: Selection = {}): Promise<VerifiedStack> {
    const inputs = await this.inputs(); checkHost(inputs.host);
    const identity = identitySchema.parse(inputs.identity);
    const { manifest, archives } = withHint('Reinstall jev-ios-bridge to restore its release files.', () => {
      const manifestBytes = archiveBytes(inputs.artifactRoot, 'manifest.json', identity.manifestSha256, 'STACK_MANIFEST_MISMATCH');
      let manifest: Manifest;
      try { manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString('utf8'))); }
      catch { return refuse('STACK_MANIFEST_MISMATCH', 'Invalid stack manifest.'); }
      return { manifest, archives: [
        { name: 'stack.tar.gz', bytes: archiveBytes(inputs.artifactRoot, 'stack.tar.gz', identity.stackSha256, 'STACK_ARCHIVE_MISMATCH') },
        { name: 'wda.tar.gz', bytes: archiveBytes(inputs.artifactRoot, 'wda.tar.gz', identity.wdaSha256, 'WDA_ARCHIVE_MISMATCH') },
      ] };
    });
    const id = sha256(JSON.stringify(identity)); const root = join(inputs.dataRoot, id);
    const expectedMarker = JSON.stringify({ version: 1, identity }) + '\n';
    const extracted = () => withHint(`Delete ${root} and start again; the bridge extracts the stack again from its release.`, () => {
      marker(root, expectedMarker); verifyTree(root, manifest, false);
    });
    if (!existsSync(root)) {
      mkdirSync(inputs.dataRoot, { recursive: true, mode: 0o700 });
      const directory = lstatSync(inputs.dataRoot);
      if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o077) !== 0)
        refuse('STACK_LOCATION_UNSAFE', 'The stack location must be private to this account.');
      const staging = mkdtempSync(join(inputs.dataRoot, '.extract-'));
      try {
        const allowed = new Set(Object.keys(manifest.files));
        for (const path of Object.keys(manifest.files)) for (let parent = dirname(path); parent !== '.'; parent = dirname(parent)) allowed.add(parent);
        for (const { name, bytes } of archives) {
          const archive = resolve(staging, `.${name}`);
          writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
          const { stdout } = await tar('/usr/bin/tar', ['-tzf', archive], { env: tarEnv, maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
          for (const item of stdout.trim().split('\n')) {
            const path = item.replace(/\/$/, '');
            if (!pathSchema.safeParse(path).success || !allowed.has(path))
              refuse('STACK_MANIFEST_MISMATCH', `Unexpected archive path: ${item}.`);
          }
          await tar('/usr/bin/tar', ['-xzf', archive, '-C', staging], { env: tarEnv, timeout: 60000 });
          rmSync(archive);
        }
        verifyTree(staging, manifest, true);
        writeFileSync(join(staging, '.verified.json'), expectedMarker, { flag: 'wx', mode: 0o600 });
        try { renameSync(staging, root); }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && ['EEXIST', 'ENOTEMPTY'].includes(String(error.code)))) throw error;
          extracted();
        }
      } finally { rmSync(staging, { recursive: true, force: true }); }
    }
    extracted();
    const warnings: string[] = [];
    if (selection.iosVersion !== undefined && selection.iosVersion !== '26.5') warnings.push(`Unsupported iOS ${selection.iosVersion}; qualified version is 26.5.`);
    if (selection.xcodeVersion !== undefined && selection.xcodeVersion !== '27.0') warnings.push(`Unsupported Xcode ${selection.xcodeVersion}; qualified version is 27.0.`);
    return { root, nodeModules: join(root, 'node_modules'), wdaRunner: join(root, manifest.wda.path), identity, manifest, warnings };
  }
}
