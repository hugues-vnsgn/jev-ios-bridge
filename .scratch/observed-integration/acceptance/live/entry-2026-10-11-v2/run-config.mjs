import {recordCommand,writeNew} from './commands.mjs';
const argv=[process.execPath,'/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/entry-2026-10-11-v2/config.mjs'];
const observed=await recordCommand('01-config',argv,{timeoutMs:10000,cap:65536});let result;try{result=JSON.parse(observed.stdout);}catch(e){result={status:'UNPARSEABLE_CONFIG_RESULT',error:e.message};}
await writeNew('01-config-result.json',result);console.log(JSON.stringify({stage:'effective-config',status:observed.ok?result.status:'COMMAND_FAILURE',exitCode:observed.receipt.exitCode,actualClose:observed.receipt.closedAtUtc}));process.exitCode=observed.ok&&result.status==='PASS'?0:3;
