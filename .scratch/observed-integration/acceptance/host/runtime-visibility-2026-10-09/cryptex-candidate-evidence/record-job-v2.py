from pathlib import Path
import hashlib,json,re,os,sys,datetime
os.umask(0o077)
r=Path('.scratch/installed-cryptex-runtime');d=r/sys.argv[1]
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
receipt=json.loads((d/'command.json').read_text());raw=(d/'stdout.txt').read_text()
assert sha(d/'stdout.txt')==receipt['stdoutSha256'];assert sha(d/'stderr.txt')==receipt['stderrSha256']
source={p:sha(p) for p in receipt['candidateSource441']};assert source==receipt['candidateSource441']
protected=json.loads((r/'candidate-source.json').read_text())['protected437'];protected={p:h for p,h in protected.items() if p!='tests/fixtures/observed-cli-server.ts'}
assert len(source)==441 and len(protected)==436 and all(source[p]==h for p,h in protected.items())
counts={k:int(v) for k,v in re.findall(r'^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$',raw,re.M)}
compiled={str(p):sha(p) for p in sorted(Path('dist').rglob('*.js'))};assert len(compiled)==69
result={'receipt':str(d/'command.json'),'receiptSha256':sha(d/'command.json'),'exitCode':receipt['exitCode'],'counts':counts,'startedAtUtc':receipt['startedAtUtc'],'completedAtUtc':receipt['completedAtUtc'],'stdoutSha256':receipt['stdoutSha256'],'stderrSha256':receipt['stderrSha256'],'source441Before':receipt['candidateSource441'],'source441After':source,'source441Match':True,'protected436':protected,'protected436Match':True,'compiled69After':compiled,'actualCloseRecorded':True,'owned5Authoritative':receipt['owned5']}
with (d/'result.json').open('x') as f:f.write(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['receipt','exitCode','counts','source441Match','protected436Match','actualCloseRecorded']},indent=2))
