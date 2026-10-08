import json,os,subprocess,sys,time
from pathlib import Path
os.umask(0o077)
r=Path(__file__).resolve().parent; name=sys.argv[1]; cmd=sys.argv[2:]; start=time.monotonic()
p=r/(name+".log")
with p.open("w") as f:
 os.chmod(p,0o600);f.write("COMMAND "+json.dumps(cmd)+"\n");f.flush()
 env={k:v for k,v in os.environ.items() if k!="TYPESAFE_API_KEY"}
 code=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,env=env,umask=0o022).returncode
 f.write(f"\nEXIT {code} ELAPSED {time.monotonic()-start:.2f}s\n")
print(p.read_text()[-3500:])
