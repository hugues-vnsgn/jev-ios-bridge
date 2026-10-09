import datetime, hashlib, json, os, re, subprocess, sys
from pathlib import Path
os.umask(0o077)
workspace = Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-xcode-path-policy')
if Path.cwd() != workspace: raise SystemExit('Wrong working directory')
label, *command = sys.argv[1:]
if not re.fullmatch(r'[a-zA-Z0-9-]+', label) or not command: raise SystemExit('Invalid command record')
evidence = workspace / '.scratch/installed-xcode-path-policy'
out = evidence / label
out.mkdir(mode=0o700)
base = json.loads((evidence / 'base.json').read_text())
reference = json.loads((evidence / 'accepted-source437.json').read_text())['source'] if (evidence / 'accepted-source437.json').exists() else base['source']
def sources():
    return {rel: hashlib.sha256((workspace/rel).read_bytes()).hexdigest() for rel in reference}
env = {key:os.environ[key] for key in ['PATH','HOME','TMPDIR'] if key in os.environ}
if Path(command[0]).name == 'node': env['PATH'] = str(Path(command[0]).parent) + os.pathsep + env.get('PATH', '')
env.update({'LANG':'C','LC_ALL':'C','npm_config_cache':str(evidence/'npm-cache')})
start=datetime.datetime.now(datetime.timezone.utc).isoformat()
before=sources()
with (out/'stdout.txt').open('wb') as stdout, (out/'stderr.txt').open('wb') as stderr:
    result=subprocess.run(command, cwd=workspace, env=env, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr)
end=datetime.datetime.now(datetime.timezone.utc).isoformat()
raw=(out/'stdout.txt').read_text(errors='replace')
counts={name:int(match.group(1)) if (match:=re.search(r'^(?:#|ℹ) '+name+r' (\d+)\s*$',raw,re.M)) else None for name in ['tests','pass','fail','cancelled','skipped','todo']}
record={'argv':command,'cwd':str(workspace),'base':base['base'],'head':subprocess.check_output(['git','rev-parse','HEAD'],env=env).decode().strip(),'startUtc':start,'endUtc':end,'exitCode':result.returncode,'stdoutBytes':(out/'stdout.txt').stat().st_size,'stderrBytes':(out/'stderr.txt').stat().st_size,'counts':counts,'sourceCount':len(before),'sourceBefore':before,'sourceAfter':sources(),'sanitizedEnvironmentKeys':list(env),'removedCredentialAndNodeOverrides':True}
record['sourceUnchanged']=record['sourceBefore']==record['sourceAfter']
(out/'command.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'label':label,'exitCode':result.returncode,'counts':counts,'sourceUnchanged':record['sourceUnchanged']}))
sys.exit(result.returncode)
