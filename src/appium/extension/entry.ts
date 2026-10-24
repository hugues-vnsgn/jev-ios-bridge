import { readFileSync } from 'node:fs';
import { createControlledServer } from './server.js';

// Upstream logs arguments and driver echoes. Keep every stderr write value-free.
const write = process.stderr.write.bind(process.stderr);
process.stderr.write = (_chunk: string | Uint8Array, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
  write('[private appium stderr redacted]\n');
  if (typeof encoding === 'function') encoding(); else callback?.();
  return true;
};
const [stackRoot, profileFile] = process.argv.slice(2);
try {
  if (!stackRoot || !profileFile) throw new Error('NOT_ALLOWED');
  const server = await createControlledServer(stackRoot, JSON.parse(readFileSync(profileFile, 'utf8')));
  await server.start({ transportType: 'stdio' });
} catch { write('PRIVATE_APPIUM_START_FAILED\n'); process.exitCode = 1; }
