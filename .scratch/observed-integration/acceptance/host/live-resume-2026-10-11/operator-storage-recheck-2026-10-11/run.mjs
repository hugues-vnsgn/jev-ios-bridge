import {recordCommand,writeNew} from './commands.mjs';
if(process.argv.length!==3||process.argv[2]!=='--read-only-once')throw new Error('Explicit once argument required');
const observed=await recordCommand('storage',[process.execPath,'/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/host/live-resume-2026-10-11/operator-storage-recheck-2026-10-11/storage.mjs'],{timeoutMs:10000,cap:65536});
let result;try{result=JSON.parse(observed.stdout);}catch(error){result={status:'UNPARSEABLE_STORAGE_RESULT',error:error.message};}
const closedCleanly=observed.receipt.signal===null&&!observed.receipt.stopped&&!observed.receipt.error&&observed.receipt.captureComplete;
const expectedExit=(result.status==='PASS'&&observed.receipt.exitCode===0)||(result.status==='STORAGE_UNAVAILABLE'&&observed.receipt.exitCode===3);
await writeNew('storage-result.json',result);
const summary={stage:'fresh-read-only-conservative-storage',status:closedCleanly&&expectedExit?result.status:'COMMAND_FAILURE',storage:result.storage??null,requirements:result.requirements??null,shortfall:result.shortfall??null,helperCalls:result.helperCalls??null,exitCode:observed.receipt.exitCode,actualClose:observed.receipt.closedAtUtc};
await writeNew('execution-result.json',summary);console.log(JSON.stringify(summary));process.exitCode=summary.status==='PASS'?0:3;
