import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync,unlinkSync,statSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObservedActionJournal } from '../../../../../src/experimental/observed-journal.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const root=realpathSync(mkdtempSync(join(tmpdir(),'jev-runtime-correspondence-')));
try {
 for(const state of ['in-flight','completed','uncertain']) {
  const input={deviceId:'abcdef00-0000-4000-8000-000000000001',actionId:state,intent:{tap:'fixture'}};
  const result={status:'outcome_observed',actionAttempted:true,actionAcknowledged:true,observations:2};
  const oldRoot=join(root,state,'old');const newRoot=join(root,state,'new');
  const old=await new ObservedActionJournal(oldRoot).begin(input);
  if(state==='completed') await old.complete(result);
  if(state==='uncertain') await old.uncertain('lost');
  const directory=join(newRoot,hash(input.deviceId));mkdirSync(directory,{recursive:true,mode:0o700});
  const put=(name:string,value:unknown)=>writeFileSync(join(directory,name),JSON.stringify(value),{mode:0o600,flag:'wx'});
  put('claim.json',{...input,token:randomUUID()});put(`${hash(input.actionId)}.intent.json`,{...input,status:'in-flight'});
  if(state!=='in-flight') {
   if(state==='uncertain') put('quarantine.json',{deviceId:input.deviceId,reason:'lost'});
   put(`${hash(input.actionId)}.result.json`,{...input,status:state,...(state==='completed'?{result}:{reason:'lost'})});
   unlinkSync(join(directory,'claim.json'));
  }
  const shape=(base:string)=>readdirSync(base).sort().map(name=>{const path=join(base,name);const value=JSON.parse(readFileSync(path,'utf8'));if(value.token)value.token='normalized-random-token';return{name,value,mode:statSync(path).mode&0o777};});
  assert.deepEqual(shape(join(oldRoot,hash(input.deviceId))),shape(directory));console.log(`${state}: identical names, parsed records and 0600 modes (random claim token normalized)`);
 }
} finally {rmSync(root,{recursive:true,force:true});}
