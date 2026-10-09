from pathlib import Path
import hashlib,json,re,os,sys
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime');d=r/sys.argv[1];rc=json.loads((d/'command.json').read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();base=json.loads((r/'baseline.json').read_text());source={p:sha(p) for p in rc['candidateSource443']};assert source==rc['candidateSource443'];assert all(source[p]==h for p,h in base['protected440'].items())
raw=(d/'stdout.txt').read_text();counts={k:int(v) for k,v in re.findall(r'^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$',raw,re.M)};compiled={str(p):sha(p) for p in sorted(Path('dist').rglob('*.js'))};assert len(compiled)==69
res={'receipt':str(d/'command.json'),'receiptSha256':sha(d/'command.json'),'counts':counts,'exitCode':rc['exitCode'],'startedAtUtc':rc['startedAtUtc'],'completedAtUtc':rc['completedAtUtc'],'stdoutSha256':sha(d/'stdout.txt'),'stderrSha256':sha(d/'stderr.txt'),'source443':source,'source443Unchanged':True,'protected440Match':True,'compiled69':compiled,'actualCloseRecorded':True}
assert res['stdoutSha256']==rc['stdoutSha256'] and res['stderrSha256']==rc['stderrSha256']
with (d/'result.json').open('x') as f:f.write(json.dumps(res,indent=2)+'\n')
print(json.dumps({k:res[k] for k in ['receipt','counts','exitCode','source443Unchanged','protected440Match','actualCloseRecorded']},indent=2))
