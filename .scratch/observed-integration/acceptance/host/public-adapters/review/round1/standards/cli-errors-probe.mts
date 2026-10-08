import assert from 'node:assert/strict';
import {runCli} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/src/cli.ts';
import {createObservedComposition} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/src/observed/cli.ts';
const module=createObservedComposition({enabled:false,create(){assert.fail('No store, backend or SDK may open');}});
const original=process.stdout.write;let output='';
process.stdout.write=((value:unknown)=>{output+=String(value);return true;}) as typeof process.stdout.write;
try {
 await runCli(['observed-report','one','--json','--wait-ms'],{observed:module});
 assert.equal(process.exitCode,3);assert.equal(output.trim().split('\n').length,1);assert.equal(JSON.parse(output).code,'INVALID_REQUEST');
} catch(error) {
 process.exitCode=1;process.stderr.write(JSON.stringify({failure:'Missing flag value escapes safe CLI envelope',code:(error as {code?:string}).code,stdout:output})+'\n');
} finally {process.stdout.write=original;await module.close();}
