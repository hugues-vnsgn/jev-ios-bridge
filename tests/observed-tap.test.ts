import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot } from '../src/contracts/index.js';
import { runObservedTap } from '../src/experimental/observed-tap.js';
const screen = (done = false): Snapshot => ({ deviceId:'sim', sequence:1, capturedAt:Date.now(), expiresAt:Date.now()+60000, truncated:false,
  elements:[{ref:'one',identifier:done?'done':'go',role:'button',actions:['tap'],frame:{x:0,y:0,width:10,height:10},state:{visible:true,enabled:true}}] });
function setup(screens = [screen(),screen(true)]) {
  let taps=0, reads=0; const terminal:string[]=[];
  return {options:{deviceId:'sim',actionId:'a',selector:{identifier:'go'},before:{present:[{identifier:'go'}]},after:{present:[{identifier:'done'}]},
    scenario:{app:{bundleId:'example.app'},values:{}},timeoutMs:100,pollIntervalMs:1,
    driver:{async observe(){return screens[Math.min(reads++,screens.length-1)]!;},async tapOnce(){taps++;}},
    journal:{async begin(){return {async complete(){terminal.push('complete');},async uncertain(){terminal.push('uncertain');}}}}},
    taps:()=>taps,reads:()=>reads,terminal};
}
test('one attempt verifies a fresh visible outcome',async()=>{
 const s=setup(); const result=await runObservedTap(s.options);
 assert.equal(result.status,'outcome_observed'); assert.equal(s.taps(),1);assert.equal(s.reads(),2);assert.deepEqual(s.terminal,['complete']);
});
test('cleanup failure cannot publish completed outcome',async()=>{
 const s=setup(); const result=await runObservedTap({...s.options,finish:async()=>{throw new Error('CLOSE_FAILED');}});
 assert.equal(result.status,'inconclusive');assert.deepEqual(s.terminal,['uncertain']);
});
test('already satisfied sends nothing',async()=>{const s=setup([screen(true)]);assert.equal((await runObservedTap(s.options)).status,'already_satisfied');assert.equal(s.taps(),0);});
test('raw duplicate identifiers refuse even when frames overlap',async()=>{
 const first=screen();first.elements.push({...first.elements[0]!,ref:'two'});const s=setup([first]);
 assert.equal((await runObservedTap(s.options)).status,'refused');assert.equal(s.taps(),0);
});
test('lost acknowledgement never polls or retries and quarantines',async()=>{
 const s=setup();let attempts=0;s.options.driver.tapOnce=async()=>{attempts++;throw new Error('LOST_ACK');};
 const result=await runObservedTap(s.options);assert.equal(result.status,'inconclusive');assert.equal(attempts,1);assert.equal(s.reads(),1);assert.deepEqual(s.terminal,['uncertain']);
});
test('unchanged screen times out with one submission',async()=>{
 const s=setup([screen()]);const result=await runObservedTap({...s.options,timeoutMs:15});assert.equal(result.status,'inconclusive');assert.equal(s.taps(),1);assert.ok(s.reads()>1);
});
test('prepare failure quarantines before any observation',async()=>{
 const s=setup();const result=await runObservedTap({...s.options,prepare:async()=>{throw new Error('LAUNCH_UNKNOWN');}});assert.equal(result.status,'inconclusive');assert.equal(s.reads(),0);assert.deepEqual(s.terminal,['uncertain']);
});
test('evidence write failure after input is inconclusive',async()=>{
 const s=setup();const result=await runObservedTap({...s.options,onObservation:async(_,i)=>{if(i===2)throw new Error('DISK');}});assert.equal(result.status,'inconclusive');assert.equal(s.taps(),1);
});
test('ambiguous postcondition after action is inconclusive',async()=>{
 const done=screen(true);done.elements.push({...done.elements[0]!,ref:'two'});const s=setup([screen(),done]);assert.equal((await runObservedTap(s.options)).status,'inconclusive');assert.equal(s.taps(),1);
});
test('nonfinite capture validity refuses before input',async()=>{
 const invalid=screen();invalid.expiresAt=NaN;const s=setup([invalid,screen(true)]);assert.equal((await runObservedTap(s.options)).status,'refused');assert.equal(s.taps(),0);
});
test('observation transport failure is uncertain without input',async()=>{
 const s=setup();s.options.driver.observe=async()=>{throw new Error('CAPTURE_LOST');};assert.equal((await runObservedTap(s.options)).status,'inconclusive');assert.equal(s.taps(),0);
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeviceCliError, MobileBuildMcpDriver, type CliRunner } from '../src/device/index.js';
test('real driver single submission suppresses expired-reference retry and near-TTL refresh',async()=>{
 const root=await mkdtemp(join(tmpdir(),'observed-driver-'));const calls:string[][]=[];const udid='0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
 const runner:CliRunner=async args=>{
  calls.push(args);const tap=args.includes('touch');
  return {stdout:JSON.stringify({schema:tap?'mobilebuildmcp.output.ui-action-result':'mobilebuildmcp.output.launch-result',schemaVersion:'2',didError:tap,
   data:{summary:{status:tap?'FAILED':'SUCCEEDED'},action:{type:'tap'},artifacts:{simulatorId:udid},diagnostics:{},...(tap?{uiError:{code:'SNAPSHOT_EXPIRED'}}:{})}}),stderr:'',exitCode:tap?1:0};
 };
 const driver=new MobileBuildMcpDriver({cwd:root,lockRoot:root,runner,stopAppOnClose:false});
 const context={app:{bundleId:'example.app'},device:{udid},values:{}};
 try {
  await driver.prepare(context,new AbortController().signal);
  const snapshot={...screen(),deviceId:udid,expiresAt:Date.now()+2000};
  snapshot.elements[0]!.actions.push('touch');
  await assert.rejects(driver.tapOnce('one',snapshot,context,new AbortController().signal),(error:unknown)=>error instanceof DeviceCliError && error.code==='SNAPSHOT_EXPIRED');
  assert.equal(calls.filter(args=>args.includes('touch')).length,1);assert.equal(calls.filter(args=>args.includes('snapshot-ui')).length,0);
  await driver.close(new AbortController().signal);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('cancellation after submission does not finish or observe again',async()=>{
 const s=setup();const controller=new AbortController();let finishes=0;
 s.options.driver.tapOnce=async()=>{controller.abort();};
 const result=await runObservedTap({...s.options,signal:controller.signal,finish:async()=>{finishes++;}});
 assert.equal(result.status,'inconclusive');assert.equal(s.reads(),1);assert.equal(finishes,0);
});
test('late acknowledgement after deadline cannot enable observation or completion',async()=>{
 const s=setup();s.options.driver.tapOnce=async()=>{await new Promise(resolve=>setTimeout(resolve,30));};
 const result=await runObservedTap({...s.options,timeoutMs:5});assert.equal(result.status,'inconclusive');assert.equal(s.reads(),1);
 await new Promise(resolve=>setTimeout(resolve,40));assert.equal(s.reads(),1);assert.deepEqual(s.terminal,['uncertain']);
});
test('journal claim refusal prevents prepare and observation',async()=>{
 const s=setup();let prepares=0;await assert.rejects(runObservedTap({...s.options,prepare:async()=>{prepares++;},journal:{async begin(){throw new Error('QUARANTINED');}}}),/QUARANTINED/);
 assert.equal(prepares,0);assert.equal(s.reads(),0);assert.equal(s.taps(),0);
});
test('initial evidence persistence failure quarantines without input',async()=>{
 const s=setup();const result=await runObservedTap({...s.options,onObservation:async()=>{throw new Error('INITIAL_DISK_FAILURE');}});
 assert.equal(result.status,'inconclusive');assert.equal(s.taps(),0);assert.deepEqual(s.terminal,['uncertain']);
});
test('result evidence is persisted after finish and before journal completion',async()=>{
 const s=setup();const order:string[]=[];
 const result=await runObservedTap({...s.options,finish:async()=>{order.push('finish');},onResult:async(result)=>{assert.equal(result.status,'outcome_observed');order.push('evidence');},
  journal:{async begin(){return {async complete(){order.push('complete');},async uncertain(){order.push('uncertain');}};}}});
 assert.equal(result.status,'outcome_observed');assert.deepEqual(order,['finish','evidence','complete']);
});
test('result evidence failure quarantines before any successful journal terminal',async()=>{
 const s=setup();const result=await runObservedTap({...s.options,onResult:async()=>{throw new Error('RESULT_DISK_FAILURE');}});
 assert.equal(result.status,'inconclusive');assert.deepEqual(s.terminal,['uncertain']);
});
test('cancelled attempt still persists inconclusive result before quarantine',async()=>{
 const s=setup();const controller=new AbortController();const persisted:string[]=[];
 s.options.driver.tapOnce=async()=>{controller.abort();};
 const result=await runObservedTap({...s.options,signal:controller.signal,onResult:async(value)=>{persisted.push(value.status);}});
 assert.equal(result.status,'inconclusive');assert.deepEqual(persisted,['inconclusive']);assert.deepEqual(s.terminal,['uncertain']);
});
test('journal intent includes scenario and observation limits',async()=>{
 const s=setup();let intent:unknown;
 await runObservedTap({...s.options,journal:{async begin(input){intent=input.intent;return {async complete(){},async uncertain(){}};}}});
 assert.deepEqual(intent,{selector:{identifier:'go'},before:{present:[{identifier:'go'}]},after:{present:[{identifier:'done'}]},
  scenario:{app:{bundleId:'example.app'},values:{}},timeoutMs:100,pollIntervalMs:1});
});
