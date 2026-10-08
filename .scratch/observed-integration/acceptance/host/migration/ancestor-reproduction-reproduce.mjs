import { mkdtempSync, realpathSync, mkdirSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const worktree = process.cwd();
const head = execFileSync('git',['rev-parse','HEAD'],{cwd:worktree,encoding:'utf8'}).trim();
const { migrateAdmissionForTesting } = await import(pathToFileURL(join(worktree,'src/device/admission-migration.ts')));
const { Admission } = await import(pathToFileURL(join(worktree,'src/device/admission.ts')));
const fixture = realpathSync(mkdtempSync(join(tmpdir(),'migration-review-ancestor-')));
const parent = join(fixture,'historical-parent'); mkdirSync(parent,{mode:0o700});
const extra = join(parent,'journal'); mkdirSync(extra,{mode:0o700});
const root = join(fixture,'admission');
const options={root,backend:'fake',defaultRoots:{journal:join(fixture,'absent-journal'),leases:join(fixture,'absent-leases')}};
const declaration={version:1,writersStopped:true,historicalRootsDeclaredOrExcluded:true,additionalJournalRoots:[extra],additionalLeaseRoots:[],excludedDevices:[]};
try {
  migrateAdmissionForTesting(declaration,options);
  const admission=Admission.forTesting({root,backend:'fake',initialize:false});
  chmodSync(parent,0o000);
  let rerun;
  try { migrateAdmissionForTesting(declaration,options); rerun={unexpected:'success'}; } catch(error) { rerun={code:error.code,message:error.message}; }
  let acquisition;
  try { acquisition={kind:admission.acquire({device:'11111111-2222-4333-8444-555555555555',attempt:{kind:'legacy',id:'after-unreadable-ancestor'},digest:'new',intent:{}}).kind}; } catch(error) { acquisition={code:error.code,message:error.message}; }
  console.log(JSON.stringify({head,node:process.version,fixture,rerun,guardRetained:existsSync(join(root,'migration.lock')),acquisition},null,2));
} finally { chmodSync(parent,0o700);rmSync(fixture,{recursive:true,force:true});console.log('Temporary source and admission fixtures removed.'); }
