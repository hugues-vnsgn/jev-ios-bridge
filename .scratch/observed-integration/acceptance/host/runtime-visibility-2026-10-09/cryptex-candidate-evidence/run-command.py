from pathlib import Path
import subprocess,json,datetime,hashlib,sys,os
os.umask(0o077)
job=json.loads(Path(sys.argv[1]).read_text())
repo=Path(job['cwd']);target=repo/job['evidenceDirectory']
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
with (target/'stdout.txt').open('xb') as out,(target/'stderr.txt').open('xb') as err:
 child=subprocess.Popen(job['argv'],cwd=repo,env=job['env'],stdout=out,stderr=err,stdin=subprocess.DEVNULL,preexec_fn=lambda: os.umask(0o022))
 code=child.wait()
ended=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt={**job,'startedAtUtc':started,'completedAtUtc':ended,'exitCode':code}
for label in ('stdout','stderr'):
 data=(target/(label+'.txt')).read_bytes();receipt[label+'Bytes']=len(data);receipt[label+'Sha256']=hashlib.sha256(data).hexdigest()
with (target/'command.json').open('x') as f:f.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'argv':job['argv'],'cwd':str(repo),'exitCode':code,'startedAtUtc':started,'completedAtUtc':ended,'stdoutBytes':receipt['stdoutBytes'],'stderrBytes':receipt['stderrBytes']}))
sys.exit(code if code>=0 else 128-code)
