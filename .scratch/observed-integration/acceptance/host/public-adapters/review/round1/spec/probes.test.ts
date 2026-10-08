import test from 'node:test';import assert from 'node:assert/strict';
import {runCli} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/src/cli.ts';
import {createObservedComposition,validateObservedStartConfiguration} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/src/observed/cli.ts';
import {actionRequest} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/tests/fixtures/observed-cli-server.ts';
test('missing CLI option value returns safe one-record INVALID_REQUEST',async()=>{
 const module=createObservedComposition({enabled:false,create:()=>assert.fail('No authority for malformed input')});const original=process.stdout.write.bind(process.stdout);let stdout='';process.stdout.write=((chunk:unknown)=>{stdout+=String(chunk);return true;}) as typeof process.stdout.write;let error:unknown;const exit=process.exitCode;
 try{await runCli(['observed-report','one','--json','--wait-ms'],{observed:module});}catch(e){error=e;}finally{process.stdout.write=original;process.exitCode=exit;}
 console.log(JSON.stringify({case:'missing-value',stdout,error:error?{code:(error as any).code,message:(error as Error).message}:null}));assert.equal(error,undefined);assert.equal(JSON.parse(stdout).code,'INVALID_REQUEST');
});
test('failed configuration after retirement delegates authoritative unready result',async()=>{
 const request=actionRequest('ABCDEF00-0000-4000-8000-000000000099');const ready={kind:'allocation',allocation:{actionId:request.actionId,allocationId:request.allocationId,appBundleId:request.app.bundleId,actionDigest:null,state:'ready'}};let reads=0;let error:unknown;
 try{await validateObservedStartConfiguration({readAction:()=> (++reads===1?ready:{...ready,allocation:{...ready.allocation,state:'retained'}}) as never},request,async()=>{throw Error('private config fault');});}catch(e){error=e;}
 console.log(JSON.stringify({case:'retirement-config-race',reads,code:(error as any)?.code}));assert.equal(error,undefined,'No longer eligible for fresh binding: service must resolve current authority');
});
