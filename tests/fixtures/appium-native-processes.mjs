import { spawn } from 'node:child_process';
import { installNativeProcessReceipts } from '../../.scratch/appium-mcp-migration/candidate-stack/experiments/native-process-receipts.mjs';
import { journal } from '../../.scratch/appium-mcp-migration/candidate-stack/experiments/stop-journal.mjs';
const directory = process.argv[2];
journal(directory, 'initialize', { platform: 'ios', runId: 'escaped-process', device: 'fake-only-host' });
installNativeProcessReceipts(directory, process.env.JEV_STOP_GROUP_RECORD);
const helper = spawn(process.execPath, ['-e', 'console.log("ready"); setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
helper.stdout.once('data', () => console.log(JSON.stringify({ helperPid: helper.pid })));
setInterval(() => {}, 1000);
