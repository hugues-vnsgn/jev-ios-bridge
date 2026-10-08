import os, sys, json, time, subprocess, pathlib, hashlib, re
os.umask(0o077)
worktree = pathlib.Path(__file__).resolve().parents[2]
vault = pathlib.Path(__file__).resolve().parent
runtime, gate, label = sys.argv[1:]
nodes = {'26': '/opt/homebrew/bin/node', '24': '/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node'}
node = nodes[runtime]
run = vault / ('round2-' + label)
run.mkdir(mode=0o700)
env = os.environ.copy()
for name in ['TYPESAFE_API_KEY', 'NODE_OPTIONS', 'NODE_NO_WARNINGS']: env.pop(name, None)
env['PATH'] = str(pathlib.Path(node).parent) + os.pathsep + env.get('PATH','')
env['HOST_EVIDENCE_DIR'] = str(run / 'raw')
pathlib.Path(env['HOST_EVIDENCE_DIR']).mkdir(mode=0o700)
if gate == 'added': command = [node, '--import', 'tsx', '--test', 'tests/observed-host-fault.test.ts', 'tests/observed-public-races.test.ts', 'tests/observed-crash.test.ts']
elif gate in ['check','typecheck']: command = [node, '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', 'run', gate]
else: raise ValueError('Unknown gate')
manifest = json.loads((vault / 'round2-static-freeze.json').read_text())
source = {name: hashlib.sha256((worktree/name).read_bytes()).hexdigest() for name in manifest['files']}
if source != manifest['files']: raise RuntimeError('Frozen owned Source drift')
metadata = {'runtime': runtime, 'gate':gate, 'command':command, 'cwd':str(worktree), 'parent':manifest['parent'], 'source':source, 'evidenceUmask':'0077', 'childUmask':'0022', 'environmentRemoved':['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'], 'started':time.time()}
(run/'command.json').write_text(json.dumps(metadata,indent=2)+'\n')
with (run/'output.log').open('xb') as output:
 result=subprocess.run(command,cwd=worktree,env=env,stdout=output,stderr=subprocess.STDOUT,umask=0o022)
metadata.update({'exitCode':result.returncode,'finished':time.time()})
text=(run/'output.log').read_text()
metadata['tapSummary'] = [line for line in text.splitlines() if re.match(r'^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ',line)]
metadata['logSha256']=hashlib.sha256((run/'output.log').read_bytes()).hexdigest()
(run/'result.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps({'run':str(run),'exitCode':result.returncode,'seconds':metadata['finished']-metadata['started'],'tapSummary':metadata['tapSummary']},indent=2))
sys.exit(result.returncode)
