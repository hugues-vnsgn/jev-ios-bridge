import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { Admission } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-shared-driver/src/device/admission.ts';
import { MobileBuildMcpDriver } from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-shared-driver/src/device/index.ts';
const root = realpathSync(mkdtempSync('/tmp/jev-driver-spec-review-store-'));
mkdirSync(join(root,'store'),{mode:0o700});
const admission=Admission.forTesting({root:join(root,'store'),backend:'fake'});
const device='ABCDEF00-0000-4000-8000-000000000001';
const calls=[];
const runner=async args => {
 calls.push(args[1]);
 const data=args[1]==='list' ? {simulators:[{simulatorId:device,state:123}]} : {artifacts:{simulatorId:device}};
 return {stdout:JSON.stringify({schema:`mobilebuildmcp.output.${args[1]==='list'?'simulator-list':'launch-result'}`,schemaVersion:'2',didError:false,data}),stderr:'',exitCode:0};
};
const window=async()=>{calls.push('window');};
const driver=new MobileBuildMcpDriver({cwd:root,lockRoot:join(root,'leases'),admission,fakeBackend:{runner,window}});
let error;
try {await driver.prepare({app:{bundleId:'dev.fixture'},device:{udid:device},values:{}},new AbortController().signal);}catch(e){error=e;}
console.log(JSON.stringify({root,calls,rejected:!!error,warnings:driver.prepareWarnings(),admission:admission.inspect(device)?.state}));
assert.equal(calls.includes('launch-app'),false,'Malformed selected-device state must close dispatch before launch');
