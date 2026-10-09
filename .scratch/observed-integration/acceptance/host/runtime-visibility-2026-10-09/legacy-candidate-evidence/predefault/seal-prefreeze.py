from pathlib import Path
import datetime, hashlib, json, os, stat, subprocess
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime')
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
b=json.loads((r/'baseline.json').read_text());audit=json.loads((r/'predefault-audit.json').read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert head=='4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d'
assert subprocess.check_output(['git','diff',b['base'],head,'--name-only'],text=True).splitlines()==sorted(b['ownedPaths'])
assert subprocess.check_output(['git','diff','HEAD','--name-only'],text=True)==''
source={p:sha(p) for p in audit['source443']};assert source==audit['source443']
requests=''.join(head+':'+p+'\n' for p in source).encode()
data=subprocess.check_output(['git','cat-file','--batch'],input=requests);cursor=0;gitMap={}
for p in source:
    end=data.index(b'\n',cursor);header=data[cursor:end].split();assert header[1]==b'blob';size=int(header[2]);start=end+1
    blob=data[start:start+size];assert data[start+size:start+size+1]==b'\n';cursor=start+size+1
    gitMap[p]=hashlib.sha256(blob).hexdigest()
assert cursor==len(data) and gitMap==source
candidate={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':head,'parent':b['base'],'owned3':audit['owned3'],'source443':source,'gitSource443':gitMap,'protected440':b['protected440'],'compiled69':audit['compiled69'],'compiledChangedFromBase':audit['compiledChangedFromBase'],'policySha256':b['policySha256'],'ownerReceiptSha256':b['ownerReceiptSha256'],'predefaultAuditSha256':sha(r/'predefault-audit.json'),'reportSha256':sha(r/'implementation-report.md'),'clauseMatrixSha256':sha(r/'clause-regression-matrix.md'),'caseMatrixSha256':sha(r/'owned-case-matrix.json'),'allTrackedChangesCommitted':True,'gitAndWorkingSource443Match':True,'defaultStatus':'pending, authorized serial unmodified defaults','sourceFrozenAcrossDefaults':True}
put(r/'candidate-source.json',candidate)
inventory={};exclusions={};r.chmod(0o700)
for p in sorted(r.rglob('*')):
    info=p.lstat();assert not stat.S_ISLNK(info.st_mode)
    if p.is_dir():p.chmod(0o700);continue
    assert stat.S_ISREG(info.st_mode);p.chmod(0o600)
    relative=str(p.relative_to(r));record={'sha256':sha(p),'bytes':p.stat().st_size,'mode':'0600'}
    if relative.startswith('npm-cache/') or relative=='validation.lock':
        exclusions[relative]={**record,'reason':'operational npm cache or lock; mutable during authorized later defaults, not acceptance evidence'}
    else:inventory[relative]=record
manifest={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateCommit':head,'root':str(r.resolve()),'immutableEvidenceFiles':inventory,'operationalFileExclusions':exclusions,'selfExclusion':'predefault-evidence-manifest.json cannot hash itself; parent receives its exact SHA256','futureFiles':'actual-default-* and successor final report/index will be fresh and separately sealed','historicalCryptexEvidence':'../installed-cryptex-runtime remains untouched and is held by Root separately','failureTranscriptQualification':'predefault-packaging-selector-failure.txt is a transcription of the tool output, not a contemporaneous command recorder receipt','noExcludedAcceptanceReceipts':True,'files600Directories700':True}
put(r/'predefault-evidence-manifest.json',manifest)
print(json.dumps({'candidateCommit':head,'candidateSourceSha256':sha(r/'candidate-source.json'),'predefaultManifestSha256':sha(r/'predefault-evidence-manifest.json'),'immutableFiles':len(inventory),'operationalExclusions':len(exclusions),'source443GitMatch':True,'protected440Match':True},indent=2))
