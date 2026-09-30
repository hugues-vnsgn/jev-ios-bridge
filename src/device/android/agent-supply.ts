import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DeviceReasonError } from '../index.js';

/** The SHA-256 of the device agent inside mobilecli 1.0.14's Mac programs (the same on both builds; ADR-0006). */
export const PINNED_AGENT_SHA256 = '0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f';

/** The device agent copied out of the pinned mobilecli program: the checked cache file, and its SHA-256. */
export interface PinnedAgent {
  path: string;
  sha256: string;
}

export interface PinnedAgentOptions {
  /** Reads the mobilecli program's bytes. Defaults to the installed `@mobilenext/mobilecli-darwin-<arch>` program. */
  readProgram?: () => Promise<Uint8Array>;
  /** Defaults to `$TMPDIR/jev-android-agent`. */
  cacheFolder?: string;
  /** Tests only: synthetic program bytes can't carry the real agent's SHA-256. */
  pinnedSha256?: string;
}

const DEX_HEADER_SIZE = 0x70;
const DEX_MAGIC = /^dex\n0\d\d\0$/;

function unavailable(message: string): DeviceReasonError {
  return new DeviceReasonError('ANDROID_TOOLS_UNAVAILABLE', message);
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Every DEX file inside `program` whose length field, Adler-32 checksum and SHA-1 signature are all valid. */
function validDexFiles(program: Buffer): Buffer[] {
  const found: Buffer[] = [];
  for (let at = program.indexOf('dex\n0', 0, 'latin1'); at !== -1; at = program.indexOf('dex\n0', at + 1, 'latin1')) {
    if (at + DEX_HEADER_SIZE > program.length || !DEX_MAGIC.test(program.toString('latin1', at, at + 8))) continue;
    const size = program.readUInt32LE(at + 32);
    if (size < DEX_HEADER_SIZE || at + size > program.length) continue;
    const dex = program.subarray(at, at + size);
    const checksumValid = adler32(dex.subarray(12)) === dex.readUInt32LE(8);
    const signatureValid = createHash('sha1').update(dex.subarray(32)).digest().equals(dex.subarray(12, 32));
    if (checksumValid && signatureValid) found.push(dex);
  }
  return found;
}

/** The mobilecli program for this Mac, resolved from mobilecli's own location. Only ever read, never run (ADR-0006). */
function mobilecliProgramPath(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const mobilecli = createRequire(import.meta.url).resolve('mobilecli/package.json');
  const platformPackage = createRequire(mobilecli).resolve(`@mobilenext/mobilecli-darwin-${arch}/package.json`);
  return join(dirname(platformPackage), `mobilecli-darwin-${arch}`);
}

async function readInstalledProgram(): Promise<Uint8Array> {
  return readFile(mobilecliProgramPath());
}

async function cachedSha256(path: string): Promise<string | undefined> {
  try {
    return sha256Of(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Write the agent to `<sha256>.dex` through a fresh temporary file, so a reader never sees half a file. */
async function writeCache(folder: string, path: string, agent: Buffer): Promise<void> {
  const partial = join(folder, `.${process.pid}-${Date.now()}.partial`);
  try {
    await writeFile(partial, agent, { mode: 0o600, flag: 'wx' });
    await rename(partial, path);
  } finally {
    await rm(partial, { force: true });
  }
}

/**
 * Copy the device agent out of the pinned mobilecli program and cache it, checked against the pinned SHA-256.
 * The program is read, never executed. The cached file's hash is checked on every call, and a cache file that
 * doesn't match is rewritten. Any failure is `ANDROID_TOOLS_UNAVAILABLE`.
 */
export async function pinnedAgent(options: PinnedAgentOptions = {}): Promise<PinnedAgent> {
  const pinned = options.pinnedSha256 ?? PINNED_AGENT_SHA256;
  let program: Buffer;
  try {
    const bytes = await (options.readProgram ?? readInstalledProgram)();
    program = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } catch {
    throw unavailable('The pinned mobilecli package is missing or unreadable. Run npm install in the bridge.');
  }
  const valid = validDexFiles(program);
  if (valid.length !== 1) {
    throw unavailable(`The pinned mobilecli program holds ${valid.length} valid device agents instead of exactly one.`);
  }
  const agent = valid[0]!;
  if (sha256Of(agent) !== pinned) {
    throw unavailable('The device agent in the pinned mobilecli program does not match the pinned SHA-256.');
  }
  const folder = options.cacheFolder ?? join(tmpdir(), 'jev-android-agent');
  const path = join(folder, `${pinned}.dex`);
  try {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await chmod(folder, 0o700);
    if (await cachedSha256(path) !== pinned) await writeCache(folder, path, agent);
    await chmod(path, 0o600);
    if (await cachedSha256(path) !== pinned) throw new Error('the rewritten cache file does not match');
  } catch {
    throw unavailable(`The device agent cache at ${path} could not be written or does not match the pinned SHA-256.`);
  }
  return { path, sha256: pinned };
}
