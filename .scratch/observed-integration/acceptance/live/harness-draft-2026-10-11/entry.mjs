// Deliberately inert until a separately reviewed adapter/controller is implemented.
// No product imports, environment reads, filesystem reads or child processes.
process.stderr.write('HARNESS_DRAFT_DISABLED: process recorder and public controller require independent review.\n');
process.exitCode = 3;
