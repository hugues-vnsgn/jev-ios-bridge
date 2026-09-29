// Run a command and prefix each stdout line with the host's epoch ms when it arrived.
// Usage: node stamp.mjs <outfile> <cmd> [args...]   Stops on SIGTERM/SIGINT (kills the child).
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
const [out, cmd, ...args] = process.argv.slice(2);
const file = createWriteStream(out);
const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
createInterface({ input: child.stdout }).on('line', line => file.write(`${Date.now()} ${line}\n`));
createInterface({ input: child.stderr }).on('line', line => file.write(`${Date.now()} STDERR ${line}\n`));
child.on('exit', (code, sig) => { file.write(`${Date.now()} EXIT code=${code} signal=${sig}\n`); file.end(() => process.exit(0)); });
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => child.kill('SIGTERM'));
