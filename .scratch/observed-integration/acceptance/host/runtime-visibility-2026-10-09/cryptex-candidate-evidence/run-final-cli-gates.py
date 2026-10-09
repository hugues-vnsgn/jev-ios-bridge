from pathlib import Path
import subprocess,sys,json,hashlib,os
os.umask(0o077)
r=Path('.scratch/installed-cryptex-runtime')
for label in ['focused-cli-final','typecheck-cli-final','coverage-cli-final','build-cli-final']:
 for node in ['26','24']:
  name=label+'-node'+node
  result=subprocess.run([sys.executable,str(r/'run-command-serial.py'),str(r/(name+'-job.json'))])
  subprocess.run([sys.executable,str(r/'record-job-v2.py'),name],check=True)
  if result.returncode:sys.exit(result.returncode)
  if label=='build-cli-final':
   d=r/name;manifest=json.loads((d/'result.json').read_text())['compiled69After'];archive=d/'compiled'
   archive.mkdir(mode=0o700)
   for path,expected in manifest.items():
    data=Path(path).read_bytes();assert hashlib.sha256(data).hexdigest()==expected
    target=archive/path;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with target.open('xb') as f:f.write(data)
   with (d/'compiled-manifest.json').open('x') as f:f.write(json.dumps(manifest,indent=2)+'\n')
print('All final CLI repair gates actually closed successfully, serially.')
