import json,hashlib,re,collections
from pathlib import Path
o=Path(__file__).parent;d=json.loads((o/'results.json').read_text());b=Path(d['evidence'])
for name,want in d['evidenceHashes'].items():assert hashlib.sha256((b/name).read_bytes()).hexdigest()==want,name
for platform in ['ios','android']:
 raw=(b/platform/('console.log'if platform=='ios'else'logcat.log')).read_text();events=[json.loads(x)for x in re.findall(r'FIXTURE_EVENT (\{[^\n]*\})',raw)]
 for a in json.loads((b/platform/'attempts.json').read_text()):
  row=next(x for x in d['rows']if x['platform']==platform and x['kind']==a['kind'])
  for step,expected in zip(a['steps'],row['steps'],strict=True):
   assert all(x in events for x in step['events'])
   got=dict(collections.Counter(x['kind']for x in step['events']if x['control']=='field.'+a['kind']));assert got==expected['callbacks']
for p in ['ios','android']:
 receipt=json.loads((b/(p+'-final-shutdown-verified.json')).read_text());assert len(receipt['observations'])==6 and all(x['deviceOffline']and x['ownedPortsClosed']for x in receipt['observations'])
for n in ['ios','lost-retry/ios']:
 assert json.loads((b/n/'secure-at-rest-audit.json').read_text())['clearValueFiles']==[]
assert d['lostAcknowledgement']['replyReceived']is False and d['lostAcknowledgement']['sameAppPid']
print('PASS. Evidence hashes, native callback correspondence, lost acknowledgement, secure audits and both shutdown receipts.')
