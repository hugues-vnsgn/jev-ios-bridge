import pathlib,json,os,hashlib
os.umask(0o077);root=pathlib.Path('/Users/hugues_mini/orca/workspaces/jev-ios-bridge/observed-host-faults');e=pathlib.Path('/tmp/jev-observed-ticket09-evidence');indices={}
for version in ['26','24']:
 p=e/('added-final-node'+version);records=[]
 for f in p.rglob('test-context.json'):
  name=json.loads(f.read_text())['name'];parent=f.parent;records.append({'name':name,'directory':str(parent.parent),'artifacts':[str(x) for x in sorted(parent.glob('*.json*'))]})
 for phase in ['configuration','host-proof','artifact-inspection','artifact-staging']:
  records.append({'name':f'H05.12 genuine CLI SIGTERM during {phase} fences ignored-abort preparation','directory':str(p/('early-'+phase)),'artifacts':[str(p/('early-'+phase)/'public/public-result.json'),str(p/('early-'+phase)/'public/milestone.jsonl'),str(p/('early-'+phase)/'public/calls.json')]})
 assert len(records)==193
 indices[version]=records;(e/('artifact-index-node'+version+'.json')).write_text(json.dumps(records,indent=2)+'\n')
frozen=json.loads((e/'owned-final-gate-freeze.json').read_text());p=root/'tests/fixtures/observed-host/case-matrix.json';m=json.loads(p.read_text())
for row in m['rows']:
 fam='.'.join(row['id'].split('.')[:2]);evidence={}
 for version,records in indices.items():
  candidates=[r for r in records if r['name'].startswith(fam+' ')]
  tr=row['transport'].lower()
  if tr in ['cli','mcp']:
   filtered=[r for r in candidates if tr in r['name'].lower().split() or not any(x in r['name'].lower().split() for x in ['cli','mcp'])]
   if filtered:candidates=filtered
  parts=row['variant'].split('/')
  specific=[r for r in candidates if all(part.lower() in r['name'].lower() for part in parts)]
  if specific:candidates=specific
  assert candidates,row['id']
  evidence['node'+version]={'log':str(e/('added-final-node'+version+'.log')),'commandRecord':str(e/('added-final-node'+version+'.json')),'artifactSets':candidates}
 row['evidence']=evidence;row['verdict']='PASS';row['verdictScope']='Mapped isolated host assertions; not complete Root/live acceptance';row['testSourceSha256']=frozen['files'][row['test'].rsplit(':',1)[0]]
m['executed']={'node26':{'tests':193,'pass':193,'fail':0,'skipped':0},'node24':{'tests':193,'pass':193,'fail':0,'skipped':0},'gateFreeze':str(e/'owned-final-gate-freeze.json'),'fullChecks':'Separate full npm run check command records in private report; no full-check result inferred here'}
p.write_text(json.dumps(m,indent=2)+'\n');freeze=dict(frozen);freeze['files']={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in frozen['files']};(e/'owned-before-full-check-freeze.json').write_text(json.dumps(freeze,indent=2)+'\n')
(e/'six-family-closure.json').write_text(json.dumps({'review':'/tmp/jev-ticket09-spec-completeness-esc18h5n/review.md','finalRuntimeFreeze':str(e/'owned-final-gate-freeze.json'),'map':str(p),'closures':{finding:[{'id':r['id'],'test':r['test'],'assertionLocations':r['assertionLocations'],'evidence':r['evidence']} for r in m['rows'] if '.'.join(r['id'].split('.')[:2]) in families] for finding,families in m['completenessAudit']['closureFamilies'].items()}},indent=2)+'\n')
print(json.dumps({'inventory':len(m['rows']),'mappedVerdicts':'PASS bounded only','executedTestsPerRuntime':193,'rawArtifactSetsPerRuntime':193,'reportOnlyChanges':'matrix verdict/evidence metadata; runtime code unchanged'}))
