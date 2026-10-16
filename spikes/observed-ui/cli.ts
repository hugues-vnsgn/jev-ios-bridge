import { dirname, resolve } from 'node:path';
import { Admission } from '../../src/device/admission.js';
import { readObservedExperiment, runObservedExperiment, parseObservedExperiment } from '../../src/experimental/observed-run.js';
import { ObservedActionService, observedDriverFactory } from '../../src/observed/service.js';
import { ObservedOperationError } from '../../src/observed/schema.js';
import { observedActionExitCode } from '../../src/observed/report.js';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: npx tsx spikes/observed-ui/cli.ts <experiment.json> <evidence-directory>');
  process.exitCode = 2;
} else {
  let service: ObservedActionService | undefined;
  const abort = new AbortController();
  const stop = () => { abort.abort(); void service?.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    if (process.env.JEV_EXPERIMENTAL_OBSERVED !== '1') throw new ObservedOperationError('OBSERVED_DISABLED', 'Observed execution is disabled');
    const raw = parseObservedExperiment(await readObservedExperiment(resolve(args[0]!)));
    const admission = Admission.open();
    service = new ObservedActionService({ admission, runsDir: dirname(resolve(args[1]!)), bridgeVersion: 'experimental', backend: 'real',
      enabled: true, createDriver: observedDriverFactory({ cwd: process.cwd(), admission }) });
    const result = await runObservedExperiment(raw, resolve(args[1]!), { cwd: process.cwd(), signal: abort.signal, service });
    console.log(JSON.stringify(result)); process.exitCode = observedActionExitCode(result);
  } catch (error) {
    console.error(JSON.stringify(error instanceof ObservedOperationError ? error.toJSON() :
      new ObservedOperationError('MIGRATION_REQUIRED', 'Shared admission must be configured before historical execution').toJSON()));
    process.exitCode = 2;
  } finally {
    await service?.close(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
