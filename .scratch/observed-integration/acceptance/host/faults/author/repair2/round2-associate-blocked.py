import os,json,hashlib,re
from pathlib import Path
os.umask(0o077)
v=Path(__file__).resolve().parent;w=v.parents[1]
prior=json.loads((v/'round2-original08/source/tests/fixtures/observed-host/case-matrix.json').read_text())
current=json.loads((w/'tests/fixtures/observed-host/case-matrix.json').read_text())
assert [r['id'] for r in current['rows']]==[r['id'] for r in prior['rows']]
runs={};index=[]
for label,tests,passed,code in [('added-node26',193,193,0),('added-node24',193,193,0),('check-node26',1668,1667,1),('check-node24',1668,1668,0),('check-node26-rerun',1668,1667,1)]:
 run=v/('round2-'+label);result=json.loads((run/'result.json').read_text());assert result['exitCode']==code
 text=(run/'output.log').read_text();summary={m.group(1):int(m.group(2)) for m in re.finditer(r'^[#ℹ] (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
 assert summary=={'tests':tests,'pass':passed,'fail':tests-passed,'cancelled':0,'skipped':0,'todo':0},(label,summary)
 artifacts={}
 for directory in sorted((run/'raw').iterdir()):
  contexts=[directory/'public/test-context.json',directory/'backend/test-context.json'];names=[json.loads(c.read_text())['name'] for c in contexts if c.exists()]
  if directory.name.startswith('early-'):names=['H05.12 genuine CLI SIGTERM during '+directory.name.removeprefix('early-')+' fences ignored-abort preparation']
  assert len(names)==1,(label,str(directory),names)
  title=names[0];assert title not in artifacts,(label,title);files=[];commands=0
  for file in sorted(directory.rglob('*')):
   if file.is_symlink():index.append({'run':label,'test':title,'path':str(file.relative_to(w)),'kind':'symlink','target':os.readlink(file)});continue
   if not file.is_file():continue
   h=hashlib.sha256(file.read_bytes()).hexdigest();item={'run':label,'test':title,'path':str(file.relative_to(w)),'kind':'regular','size':file.stat().st_size,'sha256':h};index.append(item)
   if file.name.startswith('command-'):commands+=1
   if file.name in ['calls.jsonl','milestones.jsonl','mcp-requests.jsonl','public-waits.jsonl','backend-attempts.jsonl','milestone.jsonl','public-result.json','test-context.json','backend-calls.json','public-commands.jsonl','raw-backends.jsonl']:files.append(item['path'])
  artifacts[title]={'name':title,'directory':str(directory.relative_to(w)),'artifacts':files,'commandRecords':commands,'completeFileIndex':'.scratch/ticket09-repair2-evidence/round2-raw-index.json','mappingKind':'Shared executable fixture; multiple inventory IDs may reference the same actual execution/artifact set'}
 assert len(artifacts)==193,(label,len(artifacts))
 after=json.loads((run/'source-after.json').read_text());assert result['source']==after
 runs[label]={'verdict':'PASS' if code==0 else 'FAIL','summary':summary,'result':str((run/'result.json').relative_to(w)),'log':str((run/'output.log').relative_to(w)),'typecheck':'PASS' if label.startswith('check') else 'Separate initial26typecheck PASS','build':'PASS' if label=='check-node24' else 'Not reached after test exit1' if label.startswith('check') else 'Not part of added suite command','sourceBefore':result['source'],'sourceAfter':after,'artifacts':artifacts}
for row,old in zip(current['rows'],prior['rows']):
 names=[x['name'] for x in old['evidence']['node26']['artifactSets']]
 row['verdict']='PASS';row['evidence']={'round2':{}}
 for label,run in runs.items():
  missing=[name for name in names if name not in run['artifacts']];assert not missing,(row['id'],label,missing)
  row['evidence']['round2'][label]={'fullGateVerdict':run['verdict'],'log':run['log'],'commandRecord':run['result'],'artifactSets':[run['artifacts'][name] for name in names]}
 row['evidence']['priorCandidate']='08a985805cb442a2404eb9561ae92f69748ae5e0'
 row['evidence']['priorRawLoss']='3176 prior indexed raw files and48trace audit unavailable; neither recreated nor recertified'
 row['verdictScope']='PASS for mapped isolated assertions in complete193-added suites on both runtimes; shared fixture/family mapping is not396 unique executions. Node26default full gate remains BLOCKED; no complete Root/live acceptance.'
 row['testSourceSha256']=hashlib.sha256((w/row['test'].rsplit(':',1)[0]).read_bytes()).hexdigest()
current['executed']={'round2':{label:{'verdict':run['verdict'],'summary':run['summary'],'typecheck':run['typecheck'],'build':run['build']} for label,run in runs.items()},'inventoryIds':396,'addedIds':0,'testsPerAddedRuntime':193,'testsPerFullRuntime':1668,'mapping':'Shared fixture/family assertion links;396 IDs are inventory, not396 independently executed tests','prior193Results':'First candidate only; lost raw is not recertified'}
current['repairRound2'].update({'status':'BLOCKED: both complete added193PASS and actual full24PASS; both actual default26full checksFAIL1667/1668 on unchanged known boot-poll boundary; Root diagnosis/acceptance pending','rawIndex':'.scratch/ticket09-repair2-evidence/round2-raw-index.json','gateFreeze':'.scratch/ticket09-repair2-evidence/round2-static-freeze.json','rawLossLedger':'.scratch/ticket09-repair2-evidence/round2-evidence-loss.json','metadataAssociation':'Only matrix evidence/verdict and own issue comments change after gates;8 runtime test/fixture bytes including authorized producer trace remain identical to executed gate freeze','protectedAudit':'original108 mappings: exactly107 unchanged plus ONE authorized synchronous window trace before identical failure','default26Failures':[{'verdict':'FAIL','log':'.scratch/ticket09-repair2-evidence/round2-check-node26/output.log','classification':'.scratch/ticket09-repair2-evidence/round2-check-node26/failure-classification-v2.json','firstMetadataTypo':'.scratch/ticket09-repair2-evidence/round2-check-node26/failure-classification.json'},{'verdict':'FAIL','log':'.scratch/ticket09-repair2-evidence/round2-check-node26-rerun/output.log','classification':'.scratch/ticket09-repair2-evidence/round2-check-node26-rerun/failure-classification.json'}],'fallback':'None; no Source/budget/assertion/parallelism changes; only one Root-authorized unchanged default26rerun'})
current['limits'] += ['Earlier /tmp provenance paths are historical associations whose original raw files are unavailable after /tmp clearing; round2-original08 and Root durable survivor copies preserve available source/log/report evidence. Original3176raw and48trace audit are not recreated.','Producer window trace is a synchronous fake presentation-attempt counter before the identical assertion failure; it does not prove real/native presentation.','Both actual default26full checks remain FAIL1667/1668 with typecheckPASS/buildnotreached; no serial/fallback was used. Root owns protected boot-poll fixture diagnosis and complete default-gate acceptance.']
with (v/'round2-raw-index.json').open('x') as f:json.dump(index,f,indent=2);f.write('\n')
summary={'runs':{k:{x:y for x,y in r.items() if x!='artifacts'} for k,r in runs.items()},'regularFiles':sum(x['kind']=='regular' for x in index),'symlinks':sum(x['kind']=='symlink' for x in index),'rows':len(current['rows']),'rawIndexSha256':hashlib.sha256((v/'round2-raw-index.json').read_bytes()).hexdigest()}
with (v/'round2-gate-summary.json').open('x') as f:json.dump(summary,f,indent=2);f.write('\n')
(w/'tests/fixtures/observed-host/case-matrix.json').write_text(json.dumps(current,indent=2)+'\n')
print(json.dumps({k:y for k,y in summary.items() if k!='runs'},indent=2))
