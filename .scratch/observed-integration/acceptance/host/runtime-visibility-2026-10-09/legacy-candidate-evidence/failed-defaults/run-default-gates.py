from pathlib import Path
import hashlib,json,os,subprocess,sys
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime');candidate=json.loads((r/'candidate-source.json').read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
for node in ['26','24']:
    assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==candidate['candidateCommit']
    assert {p:sha(p) for p in candidate['source443']}==candidate['source443']
    name='actual-default-node'+node
    subprocess.run([sys.executable,str(r/'prepare.py'),'actual-default',node,'Actual unmodified npm run check on frozen candidate; serial, once',json.dumps(['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'])],check=True)
    result=subprocess.run([sys.executable,str(r/'run-command.py'),str(r/(name+'-job.json'))])
    subprocess.run([sys.executable,str(r/'record.py'),name],check=True)
    if result.returncode:
        print('Confirmed actual-default failure; later Node is held, no retry or Source change.',flush=True);sys.exit(result.returncode)
    record=json.loads((r/name/'result.json').read_text());assert record['source443']==candidate['source443']
    assert record['compiled69']==candidate['compiled69']
    archive=r/name/'compiled';archive.mkdir(mode=0o700)
    for p,h in record['compiled69'].items():
        data=Path(p).read_bytes();assert hashlib.sha256(data).hexdigest()==h;target=archive/p;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.open('xb').write(data)
    (r/name/'compiled-manifest.json').open('x').write(json.dumps(record['compiled69'],indent=2)+'\n')
    print('Frozen actual-default '+node+' closed exit 0; Source443 and compiled69 fixed.',flush=True)
print('Both actual unmodified defaults closed exit 0 serially on the frozen candidate.',flush=True)
