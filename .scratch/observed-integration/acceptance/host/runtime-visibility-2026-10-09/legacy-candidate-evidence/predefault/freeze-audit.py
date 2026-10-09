from pathlib import Path
import datetime, hashlib, json, os, re, subprocess
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime')
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
put=lambda p,x:p.open('x').write(json.dumps(x,indent=2)+'\n')
b=json.loads((r/'baseline.json').read_text())
source={p:sha(p) for p in b['source441']}
source.update({p:sha(p) for p in b['ownedPaths']})
assert len(source)==443 and all(source[p]==h for p,h in b['protected440'].items())
assert subprocess.run(['git','diff','--check'],check=True).returncode==0
changes=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
assert changes==['src/observed/allocation-config.ts']
archive=r/'frozen-owned-bytes';archive.mkdir(mode=0o700,exist_ok=True)
for p in b['ownedPaths']:
    target=archive/p;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if not target.exists():target.open('xb').write(Path(p).read_bytes())
    assert sha(target)==source[p]
historical={}
for archiveName,labels in {'initial-red-bytes':['red-node26','red-node24'],'domain-red-bytes':['domain-red-node26','domain-red-node24'],'first-green-attempt-bytes':['first-green-node26'],'entry-alias-red-bytes':['entry-alias-red-node26','entry-alias-red-node24']}.items():
    hashes={p:sha(r/archiveName/p) for p in b['ownedPaths']}
    for label in labels:
        receipt=json.loads((r/label/'command.json').read_text());assert hashes==receipt['owned3']
    historical[archiveName]={'capture':'contemporaneous, not reconstructed','owned3':hashes,'matchingReceipts':labels}
results={};receipts=[]
for d in sorted(r.iterdir()):
    if not d.is_dir() or not (d/'command.json').exists():continue
    rc=json.loads((d/'command.json').read_text());assert sha(d/'stdout.txt')==rc['stdoutSha256'] and sha(d/'stderr.txt')==rc['stderrSha256']
    result=json.loads((d/'result.json').read_text());assert result['actualCloseRecorded'] and result['receiptSha256']==sha(d/'command.json')
    results[d.name]={'exitCode':rc['exitCode'],'counts':result['counts'],'start':rc['startedAtUtc'],'close':rc['completedAtUtc'],'receipt':str(d/'command.json'),'receiptSha256':sha(d/'command.json'),'stdoutSha256':sha(d/'stdout.txt'),'stderrSha256':sha(d/'stderr.txt'),'source443Sha256':hashlib.sha256(json.dumps(rc['candidateSource443'],sort_keys=True).encode()).hexdigest(),'childPid':rc['childPid'],'childProcessGroup':rc['childProcessGroup']}
    receipts.append(rc)
gates=['focused-node26','focused-node24','typecheck-node26','typecheck-node24','coverage-node26','coverage-node24','build-node26','build-node24']
previous=None
for name in gates:
    rc=json.loads((r/name/'command.json').read_text());assert rc['exitCode']==0 and rc['candidateSource443']==source
    if previous:assert rc['startedAtUtc']>=previous
    previous=rc['completedAtUtc']
c26=json.loads((r/'build-node26/compiled-manifest.json').read_text());c24=json.loads((r/'build-node24/compiled-manifest.json').read_text());assert c26==c24 and len(c26)==69
for node in ['26','24']:
    for p,h in c26.items():assert sha(r/('build-node'+node)/'compiled'/p)==h
compiledChanged=[p for p,h in c26.items() if b['compiled69'][p]!=h]
assert compiledChanged==['dist/observed/allocation-config.js']
for p,h in c26.items():assert sha(p)==h
ownedNames=[]
ownedOutput=(r/'focused-node26/stdout.txt').read_text().splitlines()
# The owned suite is run as one test file; retain all names in the full raw receipts,
# and expose the 191-case owned run plus final grammar names as a searchable matrix.
for line in (r/'owned-final-node26/stdout.txt').read_text().splitlines():
    if line.startswith('✔ '):ownedNames.append(re.sub(r' \([^()]*ms\)$','',line[2:]))
assert len(ownedNames)==191
for line in ownedOutput:
    if line.startswith('✔ legacy recognizes only bounded exact build grammar ') or line.startswith('✔ unrecognized iOS_1000A1 ') or line.startswith('✔ unrecognized iOS_1AAAA1 ') or line.startswith('✔ unrecognized iOS_1A1000000 ') or line.startswith('✔ unrecognized iOS_1A1zz ') or line.startswith('✔ unrecognized iOS_1a1 ') or line.startswith('✔ unrecognized prefix_iOS_22G86 '):
        ownedNames.append(re.sub(r' \([^()]*ms\)$','',line[2:]))
assert len(ownedNames)==199
put(r/'owned-case-matrix.json',{'owned199':[{'case':i+1,'displayName':name} for i,name in enumerate(ownedNames)],'distinctDisplayNames':len(set(ownedNames)),'bothFinalFocusedReceipts':gates[:2],'bothFinalCoverageReceipts':gates[4:6],'rawNamesAuthoritative':True})
put(r/'predefault-audit.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':b['base'],'source443':source,'owned3':{p:source[p] for p in b['ownedPaths']},'protected440':b['protected440'],'compiled69':c26,'compiledChangedFromBase':compiledChanged,'historicalArchives':historical,'rawReceipts':results,'serialFinalGateOrder':gates,'allFinalActualCloseExit0':True,'gitDiffCheckExit0':True,'source443FixedAcrossFinal8Gates':True,'privateEvidenceInventoryWillBeSealedSeparately':True})
print(json.dumps({'source':len(source),'protected':440,'owned3':{p:source[p] for p in b['ownedPaths']},'compiled':len(c26),'compiledChanged':compiledChanged,'ownedCases':len(ownedNames),'rawReceipts':len(results)},indent=2))
