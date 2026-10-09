from pathlib import Path
import subprocess,hashlib,json,os,datetime
os.umask(0o077)
r=Path('.scratch/installed-cryptex-runtime');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
m=json.loads((r/'candidate-cli-source.json').read_text());assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==m['commit'];assert subprocess.run(['git','diff','--quiet','HEAD','--']).returncode==0;assert all(sha(p)==h for p,h in m['source441'].items())
defaults={}
for node in ['26','24']:
 d=r/('actual-default-cli-node'+node);rc=json.loads((d/'command.json').read_text());res=json.loads((d/'result.json').read_text());build=json.loads((d/'build-stage-confirmed.json').read_text())
 exact=json.loads((r/('first-green-node'+node+'-job.json')).read_text())['argv'][0]
 assert rc['argv']==[exact,'/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'] and rc['exitCode']==0
 assert rc['commandChildUmask']=='022' and rc['evidenceUmask']=='077' and rc['frozenCommit']==m['commit']
 assert not any(k in rc['env'] for k in ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])
 assert res['counts']=={'tests':1999,'suites':0,'pass':1999,'fail':0,'cancelled':0,'skipped':0,'todo':0}
 assert res['source441After']==m['source441'] and res['protected436']==m['protected436'] and res['compiled69After']==m['compiled69']
 assert sha(d/'stdout.txt')==rc['stdoutSha256'] and sha(d/'stderr.txt')==rc['stderrSha256'] and build['markerObservedInDefaultStdout']
 defaults[node]={'receipt':str(d/'command.json'),'receiptSha256':sha(d/'command.json'),'result':str(d/'result.json'),'resultSha256':sha(d/'result.json'),'runtimeReceipt':str(r/('actual-runtime-cli-node'+node)/'command.json'),'runtimeReceiptSha256':sha(r/('actual-runtime-cli-node'+node)/'command.json'),'buildProof':str(d/'build-stage-confirmed.json'),'buildProofSha256':sha(d/'build-stage-confirmed.json'),'compiledManifest':str(d/'compiled-manifest.json'),'compiledManifestSha256':sha(d/'compiled-manifest.json'),'counts':res['counts'],'exitCode':0,'startedAtUtc':rc['startedAtUtc'],'completedAtUtc':rc['completedAtUtc'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'source441Match':True,'protected436Match':True,'compiled69Match':True,'buildStageExecuted':True,'actualCloseRecorded':True}
assert defaults['24']['startedAtUtc']>=defaults['26']['completedAtUtc']
summary={'commit':m['commit'],'candidateManifest':str(r/'candidate-cli-source.json'),'candidateManifestSha256':sha(r/'candidate-cli-source.json'),'recordedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'defaults':defaults,'serialActualCloseConfirmed':True,'owned5':m['owned5'],'source441':m['source441'],'protected436':m['protected436'],'compiled69':m['compiled69'],'sourceAndProductUnchanged':True,'oldFailedDefaultPreserved':str(r/'actual-default-node26/command.json'),'oldFailedDefaultReceiptSha256':sha(r/'actual-default-node26/command.json'),'independentSuccessorReviewsRequired':True,'nativeCompatibilityAndAcceptancePending':True}
with (r/'actual-default-cli-summary.json').open('x') as f:f.write(json.dumps(summary,indent=2)+'\n')
index={'commit':m['commit'],'successorIndex':str(r/'verification-index-cli.json'),'successorIndexSha256':sha(r/'verification-index-cli.json'),'actualDefaultSummary':str(r/'actual-default-cli-summary.json'),'actualDefaultSummarySha256':sha(r/'actual-default-cli-summary.json'),'retainedPriorCandidate':m['parentCandidate'],'originalEvidencePathsPreserved':True,'defaults':defaults}
with (r/'verification-index-cli-defaults.json').open('x') as f:f.write(json.dumps(index,indent=2)+'\n')
report=f"""# Cryptex author validation completed

Frozen candidate `{m['commit']}` passed the unmodified `npm run check` on exact Node 26.8.1 and 24.0.0, serially. Both actual defaults report 1,999/1,999 tests, zero failures/cancellations/skips/TODO, and exit zero after typecheck, test, and build. All 441 Source bytes, 436 protected paths, and 69 compiled files match the frozen candidate throughout. The normal child umask was 022; private evidence was 077. Runtime overrides, warning suppression, and credentials were absent. Node 24's run began after Node 26 actually closed successfully.

The feature owns five product paths over base 38aa879c. The successor changes only the public fixture mapper and 14 pure mapping regressions over dadde33a. Production Source remains fixed. Both earlier serial focused checks passed 505/505, owned coverage 354/354, affected public suites 235/235, and typecheck/build. The 180 owned cases retain the original 166 assertions.

The failed original default (1,985 / 1,858 pass / 127 fail), naturally closed without signals, remains immutable. Its build did not execute. Earlier overlap failures, mapping reds, attempted fixture fixes, stale seed schema fields, private packaging assertion mistakes, and exact hash-matched historical reconstructions remain explicitly identified in the linked successor index/report. Original candidate/manifest/report/index paths remain unchanged; successor product archives and public mapping red/green archives are contemporaneous.

See actual-default-cli-summary.json and verification-index-cli-defaults.json for exact argv, fixed environment, runtimes, times, exits, raw hashes, Source and compiled correspondence. Independent nonauthor review and sole-operator installed compatibility/live acceptance remain separate pending gates. No native/device work or production acceptance claim is made by this author report.
"""
with (r/'implementation-final-report.md').open('x') as f:f.write(report)
print(json.dumps({'commit':m['commit'],'summary':str(r/'actual-default-cli-summary.json'),'summarySha256':sha(r/'actual-default-cli-summary.json'),'index':str(r/'verification-index-cli-defaults.json'),'indexSha256':sha(r/'verification-index-cli-defaults.json'),'report':str(r/'implementation-final-report.md'),'reportSha256':sha(r/'implementation-final-report.md'),'defaults':{k:v['counts'] for k,v in defaults.items()}},indent=2))
