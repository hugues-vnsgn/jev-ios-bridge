import { resolve } from 'node:path';
import { readObservedExperiment, runObservedExperiment } from '../../src/experimental/observed-run.js';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: npx tsx spikes/observed-ui/cli.ts <experiment.json> <new-evidence-directory>');
  process.exitCode = 2;
} else {
  const abort = new AbortController();
  const stop = () => abort.abort(new Error('Experiment cancelled'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const result = await runObservedExperiment(await readObservedExperiment(resolve(args[0]!)), resolve(args[1]!),
      { cwd: process.cwd(), signal: abort.signal });
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'outcome_observed' || result.status === 'already_satisfied' ? 0 : 2;
  } catch (error) {
    // No vendor output, environment values or app content in the fallback error.
    console.error(`Observed experiment did not complete (${error instanceof Error ? error.name : 'unknown error'}). Inspect its journal and evidence; do not replay uncertain input.`);
    process.exitCode = 2;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
