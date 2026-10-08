import json,os,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parent
name=sys.argv[1]; cmd=sys.argv[2:]; start=time.monotonic()
log=root/(name+".log")
with log.open("w") as f:
 os.chmod(log,0o600)
 f.write("COMMAND "+json.dumps(cmd)+"\n"); f.flush()
 env={k:v for k,v in os.environ.items() if k not in ("TYPESAFE_API_KEY",)}
 proc=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,env=env,umask=0o022)
 elapsed=time.monotonic()-start
 f.write(f"\nEXIT {proc.returncode} ELAPSED {elapsed:.2f}s\n")
print(log.read_text()[-4500:])
