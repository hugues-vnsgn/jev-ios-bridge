import os,json,hashlib,re,collections
from pathlib import Path
os.umask(0o077)
v=Path(__file__).resolve().parent
w=v.parents[1]
prior=json.loads((v/'round2-original08/source/tests/fixtures/observed-host/case-matrix.json').read_text())
current=json.loads((w/'tests/fixtures/observed-host/case-matrix.json').read_text())
assert [r['id'] for r in current['rows']]==[r['id'] for r in prior['rows']]
runs={}
index=[]
for label,expected in [('added-node26',193),('added-node24',193),('check-node26',1668),('check-node24',1668)]:
 run=v/('round2-'+label)
 result=json.loads((run/'result.json').read_text());assert result['exitCode']==0
 text=(run/'output.log').read_text()
 summary={m.group(1):int(m.group(2)) for m in re.finditer(r'^[#ℹ] (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
 assert summary=={'tests':expected,'pass':expected,'fail':0,'cancelled':0,'skipped':0,'todo':0},(label,summary)
 artifacts={}
 for directory in sorted((run/'raw').iterdir()):
  contexts=[directory/'public/test-context.json',directory/'backend/test-context.json']
  names=[json.loads(c.read_text())['name'] for c in contexts if c.exists()]
  if directory.name.startswith('early-'): names=['H05.12 genuine CLI SIGTERM during '+directory.name.removeprefix('early-')+' fences ignored-abort preparation']
  assert len(names)==1,(label,str(directory),names)
  title=names[0];assert title not in artifacts,(label,title)
  files=[]
  for file in sorted(directory.rglob('*')):
   if file.is_symlink():
    index.append({'run':label,'test':title,'path':str(file.relative_to(w)),'kind':'symlink','target':os.readlink(file)});continue
   if not file.is_file():continue
   h=hashlib.sha256(file.read_bytes()).hexdigest()
   item={'run':label,'test':title,'path':str(file.relative_to(w)),'kind':'regular','size':file.stat().st_size,'sha256':h}
   index.append(item);files.append(item['path'])
  artifacts[title]={'name':title,'directory':str(directory.relative_to(w)),'regularFiles':len(files),'artifacts':files}
 assert len(artifacts)==193,(label,len(artifacts))
 runs[label]={'summary':summary,'result':str((run/'result.json').relative_to(w)),'log':str((run/'output.log').relative_to(w)),'sourceBefore':result['source'],'sourceAfter':json.loads((run/'source-after.json').read_text()),'artifacts':artifacts}
 assert runs[label]['sourceBefore']==runs[label]['sourceAfter']
for row,old in zip(current['rows'],prior['rows']):
 names=[x['name'] for x in old['evidence']['node26']['artifactSets']]
 row['verdict']='PASS'
 row['evidence']={'round2':{}}
 for label,run in runs.items():
  missing=[name for name in names if name not in run['artifacts']];assert not missing,(row['id'],label,missing)
  row['evidence']['round2'][label]={'log':run['log'],'commandRecord':run['result'],'artifactSets':[run['artifacts'][name] for name in names]}
 row['evidence']['priorCandidate']='08a985805cb442a2404eb9561ae92f69748ae5e0'
 row['evidence']['priorRawLoss']='3176 prior indexed raw files and48trace audit unavailable; neither recreated nor recertified'
 row['testSourceSha256']=hashlib.sha256((w/row['test'].rsplit(':',1)[0]).read_bytes()).hexdigest()
current['executed']={'round2':{label:run['summary'] for label,run in runs.items()},'inventoryIds':396,'addedIds':0,'testsPerAddedRuntime':193,'testsPerFullRuntime':1668,'prior193Results':'First candidate only; lost raw is not recertified'}
current['repairRound2']['status']='Fresh complete added/full gates passed both runtimes; final independent reviews pending'
current['repairRound2']['rawIndex']='.scratch/ticket09-repair2-evidence/round2-raw-index.json'
current['repairRound2']['gateFreeze']='.scratch/ticket09-repair2-evidence/round2-static-freeze.json'
current['repairRound2']['rawLossLedger']='.scratch/ticket09-repair2-evidence/round2-evidence-loss.json'
current['limits'] += ['Earlier /tmp provenance paths are historical associations whose originals are unavailable after /tmp clearing; round2-original08 and Root durable survivor copies preserve available source/log/report evidence. Original3176raw and48trace audit are not recreated.','Producer window trace is a synchronous fake presentation-attempt counter before the identical assertion failure; it does not prove real/native presentation.']
with (v/'round2-raw-index.json').open('x') as f:json.dump(index,f,indent=2);f.write('\n')
summary={'runs':{k:{x:y for x,y in r.items() if x!='artifacts'} for k,r in runs.items()},'regularFiles':sum(x['kind']=='regular' for x in index),'symlinks':sum(x['kind']=='symlink' for x in index),'rows':len(current['rows']),'rawIndexSha256':hashlib.sha256((v/'round2-raw-index.json').read_bytes()).hexdigest()}
with (v/'round2-gate-summary.json').open('x') as f:json.dump(summary,f,indent=2);f.write('\n')
(w/'tests/fixtures/observed-host/case-matrix.json').write_text(json.dumps(current,indent=2)+'\n')
print(json.dumps({k:y for k,y in summary.items() if k!='runs'},indent=2))
