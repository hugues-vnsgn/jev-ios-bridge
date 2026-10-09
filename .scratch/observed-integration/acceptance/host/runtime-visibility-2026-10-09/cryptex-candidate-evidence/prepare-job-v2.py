from pathlib import Path
import json,hashlib,os,sys
os.umask(0o077)
r=Path('.scratch/installed-cryptex-runtime');label,node,purpose=sys.argv[1:4];args=json.loads(sys.argv[4])
job=json.loads((r/('first-green-node'+node+'-job.json')).read_text());job['argv']=[job['argv'][0],*args];job['evidenceDirectory']=str(r/(label+'-node'+node));job['purpose']=purpose
owned=['src/observed/allocation-config.ts','tests/fixtures/observed-allocation-backend.ts','tests/observed-cryptex-runtime.test.ts','tests/fixtures/observed-cryptex-runtime.ts','tests/fixtures/observed-cli-server.ts']
job['owned5']={path:hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in owned}
for key,path in [('sourceSha256',owned[0]),('testSha256',owned[2]),('fixtureSha256',owned[3]),('sharedFixtureSha256',owned[1])]:job[key]=job['owned5'][path]
protected=json.loads((r/'candidate-source.json').read_text())['protected437'];protected={p:h for p,h in protected.items() if p != 'tests/fixtures/observed-cli-server.ts'};assert len(protected)==436;assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==h for path,h in protected.items());job['protected436Match']=True
job['candidateSource441']={**protected,**job['owned5']};assert len(job['candidateSource441'])==441
Path(job['evidenceDirectory']).mkdir(mode=0o700);(r/(label+'-node'+node+'-job.json')).write_text(json.dumps(job,indent=2)+'\n')
