import { readFile } from 'node:fs/promises';
import { runObservedCommand, observedExitCode, observedSummary, observedError, type ObservedReply, type ObservedCommand } from '../src/observed/cli.js';
import { ObservedOperationError } from '../src/observed/schema.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createObservedComposition } from '../src/observed/cli.js';

test('observed composition is lazy and disabled mutations refuse before opening authority', async () => {
  let opens = 0;
  const publicModule = createObservedComposition({ enabled: false, create: () => { opens++; throw new Error('Never open'); } });
  assert.equal(opens, 0);
  await assert.rejects(publicModule.start({}), { code: 'OBSERVED_DISABLED' });
  await assert.rejects(publicModule.prepareAllocation({}), { code: 'OBSERVED_DISABLED' });
  await publicModule.close();
  assert.equal(opens, 0);
});

test('composition memoizes authority and leaves reads available with enablement off', async () => {
  let opens = 0; let closes = 0;
  const module = createObservedComposition({ enabled: false, create: () => {
    opens++;
    return { async inspect() { return { marker: 'persisted' } as never; }, async getAllocation() { return { marker: 'allocation' } as never; },
      async cancel() { return { marker: 'cancel' } as never; }, async cancelAllocation() { return { marker: 'allocation-cancel' } as never; },
      async retireAllocation() { return { marker: 'retire' } as never; }, async start() { assert.fail(); }, async prepareAllocation() { assert.fail(); },
      async close() { closes++; } };
  } });
  assert.deepEqual(await module.inspect('one'), { marker: 'persisted' });
  assert.deepEqual(await module.getAllocation('ABCDEF00-0000-4000-8000-000000000001'), { marker: 'allocation' });
  assert.deepEqual(await module.cancel('one'), { marker: 'cancel' });
  assert.deepEqual(await module.cancelAllocation('ABCDEF00-0000-4000-8000-000000000001'), { marker: 'allocation-cancel' });
  assert.deepEqual(await module.retireAllocation('ABCDEF00-0000-4000-8000-000000000001'), { marker: 'retire' });
  await Promise.all([module.close(), module.close()]);
  assert.equal(opens, 1); assert.equal(closes, 1);
});

test('enabled invalid preparation is rejected offline before authority opens', async () => {
  let opens = 0;
  const module = createObservedComposition({ enabled: true, create: () => { opens++; throw new Error('Never open'); } });
  await assert.rejects(module.prepareAllocation({ version: 2 }), { code: 'UNSUPPORTED_VERSION' });
  await assert.rejects(module.prepareAllocation({ version: 1, admissionRoot: '/unsafe' }), { code: 'INVALID_REQUEST' });
  assert.equal(opens, 0);
});

const literalPort = (reply: ObservedReply) => ({
  async start() { return reply as never; }, async inspect() { return reply as never; }, async cancel() { return reply as never; },
  async prepareAllocation() { return reply as never; }, async getAllocation() { return reply as never; },
  async cancelAllocation() { return reply as never; }, async retireAllocation() { return reply as never; }, async close() {},
});
test('versioned reply goldens freeze exact outcome exits and preserve historical/busy optional fields', async () => {
  const golden = JSON.parse(await readFile(new URL('./golden/observed-replies-v1.json', import.meta.url),'utf8')) as {version:number;cases:{name:string;command:ObservedCommand;reply:ObservedReply;exit:number}[]};
  assert.equal(golden.version,1);assert.equal(golden.cases.length,18);
  for(const row of golden.cases) {
    const module=createObservedComposition({enabled:true,create:()=>literalPort(row.reply)});let stdout='';
    const action=['observed-report','observed-cancel'].includes(row.command);
    const code=await runObservedCommand(module,row.command,action?'one':'ABCDEF00-0000-4000-8000-000000000099',{json:true,projectDir:'/isolated',write:text=>{stdout+=text;}});
    assert.equal(code,row.exit,row.name);assert.equal(observedExitCode(row.reply),row.exit,row.name);
    assert.equal(stdout.trim().split('\n').length,1);assert.deepEqual(JSON.parse(stdout),row.reply,row.name);
    assert.ok(observedSummary(row.reply).includes('evidence'),row.name);
    await module.close();
  }
  const historical=golden.cases.find(row=>row.name==='historical')!.reply as any;
  assert.equal(historical.readOnly,true);assert.equal(historical.historicalOutcome,'already_satisfied');assert.equal(historical.reservation.capacityHeld,false);
  const preparing=golden.cases.find(row=>row.name==='preparing_busy')!.reply as any;assert.equal(preparing.state,'preparing');assert.match(preparing.message,/cancel_observed_allocation/);
  const executing=golden.cases.find(row=>row.name==='executing_busy')!.reply as any;assert.equal(executing.state,'executing');assert.match(executing.message,/cancel_observed_action/);
});
test('safe operation errors preserve accepted metadata and never expose unknown exceptions',()=>{
  assert.deepEqual(observedError(new ObservedOperationError('ACTION_ID_CONFLICT','Immutable identity conflict',{actionId:'one',acceptance:'yes'}),'action'),
    {version:1,kind:'observed-operation-error',code:'ACTION_ID_CONFLICT',message:'Immutable identity conflict',actionId:'one',acceptance:'yes',acceptanceKind:'action'});
  const unknown=observedError(new Error('private vendor secret'),'preparation');assert.equal(unknown.code,'INTERNAL_ERROR');assert.equal(unknown.acceptance,'unknown');assert.equal(unknown.acceptanceKind,'preparation');assert.ok(!JSON.stringify(unknown).includes('secret'));
});

test('typed allocation configuration errors retain their shared safe preparation code', async () => {
  const { AllocationInputError } = await import('../src/observed/allocation-schema.js');
  const error = observedError(new AllocationInputError('CONFIG_INVALID'),'preparation');
  assert.equal(error.code,'CONFIG_INVALID');assert.equal(error.acceptanceKind,'preparation');assert.equal(error.acceptance,'no');
  assert.equal(observedError(new AllocationInputError('CONFIG_INVALID'),'action').code,'CONFIGURATION_ERROR');
});
