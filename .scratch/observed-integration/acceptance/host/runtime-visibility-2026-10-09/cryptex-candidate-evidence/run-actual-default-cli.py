from pathlib import Path
import subprocess,sys,json,hashlib,os
os.umask(0o077)
r=Path('.scratch/installed-cryptex-runtime');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
m=json.loads((r/'candidate-cli-source.json').read_text());old=json.loads((r/'actual-default-node26/command.json').read_text())
assert m['commit']=='720cb380d07102d72b20a6a4f5f7787a0ab88f2b'
for node in ['26','24']:
 assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==m['commit']
 assert all(sha(p)==h for p,h in m['source441'].items())
 exact=json.loads((r/('first-green-node'+node+'-job.json')).read_text())['argv'][0]
 env={**old['env'],'PATH':str(Path(exact).parent)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'}
 assert not any(k in env for k in ['TYPESAFE_API_KEY','NODE_OPTIONS','NODE_NO_WARNINGS'])
 for label,args,purpose in [('actual-runtime-cli',[exact,'--version'],'Fresh exact Node runtime version before successor actual default.'),('actual-default-cli',[exact,'/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js','run','check'],'One unmodified npm run check against immutable successor, no extra test flags/options or warning suppression.')]:
  name=label+'-node'+node;d=r/name;d.mkdir(mode=0o700)
  job={'argv':args,'cwd':str(Path.cwd()),'evidenceDirectory':str(d),'env':env,'commandChildUmask':'022','evidenceUmask':'077','purpose':purpose,'owned5':m['owned5'],'candidateSource441':m['source441'],'protected436Match':True,'sourceSha256':m['owned5']['src/observed/allocation-config.ts'],'frozenCommit':m['commit'],'candidateManifestSha256':sha(r/'candidate-cli-source.json'),'removedInheritedEnvironmentNames':sorted(set(os.environ)-set(env)),'credentialAndNodeOverridesScrubbed':True,'noExtraTestFlagsOrOptions':True,'runtimeVersionVerified':('v26.8.1' if node=='26' else 'v24.0.0')}
  with (r/(name+'-job.json')).open('x') as f:f.write(json.dumps(job,indent=2)+'\n')
  result=subprocess.run([sys.executable,str(r/'run-command-serial.py'),str(r/(name+'-job.json'))])
  subprocess.run([sys.executable,str(r/'record-job-v2.py'),name],check=True)
  if result.returncode:sys.exit(result.returncode)
  if label=='actual-runtime-cli':assert (d/'stdout.txt').read_text().strip()==job['runtimeVersionVerified']
  else:
   res=json.loads((d/'result.json').read_text());assert res['counts']['tests']==1999 and res['counts']['pass']==1999 and res['counts']['fail']==0 and res['counts']['cancelled']==0 and res['counts']['skipped']==0 and res['counts']['todo']==0;assert res['compiled69After']==m['compiled69']
   raw=(d/'stdout.txt').read_text();package=json.loads(Path('package.json').read_text());marker='> '+package['name']+'@'+package['version']+' build';assert marker in raw
   with (d/'build-stage-confirmed.json').open('x') as f:f.write(json.dumps({'buildStageMarker':marker,'markerObservedInDefaultStdout':True,'wholeDefaultExitCode':0,'compiled69MatchesFrozenSource':True},indent=2)+'\n')
   archive=d/'compiled';archive.mkdir(mode=0o700)
   for path,expected in res['compiled69After'].items():
    data=Path(path).read_bytes();assert hashlib.sha256(data).hexdigest()==expected;target=archive/path;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with target.open('xb') as f:f.write(data)
   with (d/'compiled-manifest.json').open('x') as f:f.write(json.dumps(res['compiled69After'],indent=2)+'\n')
print('Both successor actual defaults closed successfully, serially; product remained immutable.')
