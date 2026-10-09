from pathlib import Path
import subprocess,json,hashlib,os,sys
os.umask(0o077)
r=Path('.scratch/installed-legacy-volume-runtime')
for label in ['focused','typecheck','coverage','build']:
 for node in ['26','24']:
  name=label+'-node'+node;result=subprocess.run([sys.executable,str(r/'run-command.py'),str(r/(name+'-job.json'))]);subprocess.run([sys.executable,str(r/'record.py'),name],check=True)
  if result.returncode:sys.exit(result.returncode)
  if label=='build':
   d=r/name;compiled=json.loads((d/'result.json').read_text())['compiled69'];archive=d/'compiled';archive.mkdir(mode=0o700)
   for path,expected in compiled.items():
    data=Path(path).read_bytes();assert hashlib.sha256(data).hexdigest()==expected;target=archive/path;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.write_bytes(data)
   (d/'compiled-manifest.json').write_text(json.dumps(compiled,indent=2)+'\n')
print('All final focused/typecheck/coverage/build gates actually closed successfully, serially.')
