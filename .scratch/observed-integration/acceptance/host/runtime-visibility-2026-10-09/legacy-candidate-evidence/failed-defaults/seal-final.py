from pathlib import Path
import datetime,hashlib,json,os,stat,subprocess
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
c=json.loads((r/'candidate-source.json').read_text());pre=json.loads((r/'predefault-evidence-manifest.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==c['candidateCommit']
assert subprocess.check_output(['git','diff','HEAD','--name-only'],text=True)==''
assert {p:sha(p) for p in c['source443']}==c['source443']
for p,info in pre['immutableEvidenceFiles'].items():assert sha(r/p)==info['sha256']
defaults={};previous=None
for node in ['26','24']:
    name='actual-default-node'+node;d=r/name;rc=json.loads((d/'command.json').read_text());record=json.loads((d/'result.json').read_text())
    assert rc['exitCode']==0 and record['actualCloseRecorded']
    assert rc['argv'][1:]==['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check']
    assert rc['candidateSource443']==c['source443'] and record['compiled69']==c['compiled69']
    assert rc['commandChildUmask']=='022' and rc['evidenceUmask']=='077'
    assert all(name not in rc['env'] for name in ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])
    assert record['counts']=={'tests':2198,'suites':0,'pass':2198,'fail':0,'cancelled':0,'skipped':0,'todo':0}
    if previous:assert rc['startedAtUtc']>=previous
    previous=rc['completedAtUtc']
    raw=(d/'stdout.txt').read_text();assert '> tsc --noEmit' in raw and '> tsc\n' in raw
    for label in ['stdout','stderr']:assert sha(d/(label+'.txt'))==rc[label+'Sha256']
    for p,h in c['compiled69'].items():assert sha(d/'compiled'/p)==h
    defaults[node]={'receipt':str(d/'command.json'),'receiptSha256':sha(d/'command.json'),'resultSha256':sha(d/'result.json'),'exactNode':rc['argv'][0],'actualArgv':rc['argv'],'counts':record['counts'],'exitCode':rc['exitCode'],'startUtc':rc['startedAtUtc'],'actualCloseUtc':rc['completedAtUtc'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'stdoutBytes':rc['stdoutBytes'],'stderrBytes':rc['stderrBytes'],'childPid':rc['childPid'],'childProcessGroup':rc['childProcessGroup'],'unmodifiedPackageCheckMarkerPresent':True,'normalChildUmask022':True,'fixedSource443Compiled69':True}
receipts={}
for d in sorted(r.iterdir()):
    if not d.is_dir() or not (d/'command.json').exists():continue
    rc=json.loads((d/'command.json').read_text());rr=json.loads((d/'result.json').read_text())
    assert rr['receiptSha256']==sha(d/'command.json') and rr['actualCloseRecorded']
    assert sha(d/'stdout.txt')==rc['stdoutSha256'] and sha(d/'stderr.txt')==rc['stderrSha256']
    receipts[d.name]={'receiptSha256':sha(d/'command.json'),'resultSha256':sha(d/'result.json'),'exitCode':rc['exitCode'],'counts':rr['counts'],'startUtc':rc['startedAtUtc'],'actualCloseUtc':rc['completedAtUtc'],'stdoutSha256':rc['stdoutSha256'],'stderrSha256':rc['stderrSha256'],'owned3':rc['owned3']}
final={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':c['candidateCommit'],'parent':c['parent'],'authorVerdict':'PASS hermetic fixture verification; independent review and native compatibility pending','candidateSourceManifest':'candidate-source.json','candidateSourceSha256':sha(r/'candidate-source.json'),'source443':c['source443'],'protected440':c['protected440'],'owned3':c['owned3'],'compiled69':c['compiled69'],'predefaultEvidenceManifestSha256':sha(r/'predefault-evidence-manifest.json'),'prior320ImmutableFilesRehashMatch':True,'actualDefaults':defaults,'rawReceipts':receipts,'allSourceFixedAcrossDefaults':True,'allCompiledFixedAcrossDefaults':True,'noDefaultRetriesOrSignals':True,'noNativeOperations':True,'historicalReportsPreserved':True}
put(r/'final-verification-index.json',final)
text='''# Final author verification

Frozen candidate: `'''+c['candidateCommit']+'''`, parent `'''+c['parent']+'''`.

The actual unmodified `npm run check` passed once on exact Node 26.8.1 and once on exact Node 24.0.0, serially, with 2198/2198 tests on each. Both checks included their unchanged typecheck/test/build sequence and actually closed exit 0. No cancellations/skips/todos, retry, warning suppression, Source edit or process signal occurred. Full raw outputs are retained, including any runtime warning.

The three owned files stayed frozen; Source443 matched Git and working bytes, protected440 matched the accepted baseline, and compiled69 matched both final builds and both default gates. Only allocation-config.js differs from the baseline compiled vector. Final focused 704/704, coverage 553/553 and typecheck/build passed on both Nodes before the freeze. Allocation-config coverage was 97.82% lines, 95.08% branches and 88.75% functions.

The earlier implementation-report.md and predefault status are historical and remain unchanged. final-verification-index.json supplies the successor actual-default receipts and all raw receipt hashes; final-evidence-manifest.json seals all immutable private artifacts with explicit operational/self exclusions. Historical genuine red archives remain contemporaneous exact receipt matches. The audit-label uniqueness error is qualified as a bookkeeping error with a tool-output transcription, not a command-recorder capture.

This author verdict is PASS for hermetic fixture verification. Independent review, Root integration and revalidation, fresh installed-host metadata/compatibility gates and the sole operator's live acceptance cases remain pending. No native/device/SDK/account/store/key operation was performed by this author.
'''
(r/'final-verification-report.md').open('x').write(text)
inventory={};exclusions={};r.chmod(0o700)
for p in sorted(r.rglob('*')):
    info=p.lstat();assert not stat.S_ISLNK(info.st_mode)
    if p.is_dir():p.chmod(0o700);continue
    assert stat.S_ISREG(info.st_mode);p.chmod(0o600);rel=str(p.relative_to(r));entry={'sha256':sha(p),'bytes':p.stat().st_size,'mode':'0600'}
    if rel.startswith('npm-cache/') or rel=='validation.lock':exclusions[rel]={**entry,'reason':'operational cache/lock, no acceptance receipt excluded'}
    else:inventory[rel]=entry
put(r/'final-evidence-manifest.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':c['candidateCommit'],'root':str(r.resolve()),'immutableEvidenceFiles':inventory,'operationalExclusions':exclusions,'selfExclusion':'final-evidence-manifest.json exact SHA256 sent to Root','priorPredefaultManifestRehashed':True,'historicalCryptexDirectoryUntouched':True,'files600Directories700':True,'acceptanceReceiptExclusions':[]})
print(json.dumps({'candidateCommit':c['candidateCommit'],'default26':defaults['26'],'default24':defaults['24'],'indexSha256':sha(r/'final-verification-index.json'),'finalEvidenceManifestSha256':sha(r/'final-evidence-manifest.json'),'immutableEvidenceFiles':len(inventory),'operationalExclusions':len(exclusions)},indent=2))
