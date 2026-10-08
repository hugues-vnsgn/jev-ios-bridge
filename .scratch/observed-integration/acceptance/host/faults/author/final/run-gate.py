import os,pathlib,subprocess,time,json,sys
root=pathlib.Path("/Users/hugues_mini/orca/workspaces/jev-ios-bridge/observed-host-faults")
e=pathlib.Path("/tmp/jev-observed-ticket09-evidence")
label=sys.argv[1];version=sys.argv[2];command=sys.argv[3:]
os.umask(0o077)
archive=e/label;archive.mkdir(exist_ok=True)
env=os.environ.copy()
for key in ["TYPESAFE_API_KEY","NODE_OPTIONS","NODE_NO_WARNINGS"]:env.pop(key,None)
if version=="24":env["PATH"]="/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin:"+env["PATH"]
env["HOST_EVIDENCE_DIR"]=str(archive)
start=time.time()
with (e/(label+".log")).open("w") as log:
 result=subprocess.run(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,umask=0o022)
record={"command":command,"runtime":version,"exit":result.returncode,"seconds":time.time()-start,"archive":str(archive),"base":subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()}
(e/(label+".json")).write_text(json.dumps(record,indent=2)+"\n")
print(json.dumps(record));sys.exit(result.returncode)
