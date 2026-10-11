import * as fs from 'node:fs/promises';
import {recordCommand,writeNew} from './commands.mjs';
const source="/Users/hugues_mini/.gradle/caches/9.7.1";
const expected={"dev": "16777233", "ino": "117298840", "uid": "501", "gid": "20", "mode": "16877", "size": "576", "nlink": "18", "mtime_ns": "1791259549803184960", "ctime_ns": "1791259549803184960"};
const fields={dev:'dev',ino:'ino',uid:'uid',gid:'gid',mode:'mode',size:'size',nlink:'nlink',mtime_ns:'mtimeNs',ctime_ns:'ctimeNs'};
async function facts(){const s=await fs.lstat(source,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink())throw new Error('ROOT_TYPE_MISMATCH');return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,s[v].toString()]));}
let result={status:'FRESH_ROOT_CHECK_REFUSED',source,scope:'Exact-root read-only lsof; no copy or removal',qualification:'Point-in-time no-match is not atomic quiescence.'};
try {
 if(process.argv.length!==3||process.argv[2]!=='--fresh-root-once-after-root-review')throw new Error('INVOCATION_MISMATCH');
 await writeNew('fresh-root-once-claimed.json',{source,budget:1,claimedAtUtc:new Date().toISOString()});
 const before=await facts();
 if(Object.keys(expected).some(k=>expected[k]!==before[k]))throw new Error('PINNED_ROOT_IDENTITY_MISMATCH');
 const command=await recordCommand('fresh-root-lsof',['/usr/sbin/lsof','-nP','-F0pcfn','+D',source],{timeoutMs:30000,cap:2097152});
 const after=await facts(),r=command.receipt;
 result={...result,before,after,receipt:'fresh-root-lsof-receipt.json'};
 if(Object.keys(expected).some(k=>before[k]!==after[k]))throw new Error('ROOT_CHANGED_DURING_LSOF');
 if(r.exitCode!==1||r.signal!==null||r.stopped||r.error||!r.captureComplete||!r.closedAtUtc||command.stdout.length!==0||command.stderr.length!==0)throw new Error('OPEN_OR_INCOMPLETE_LSOF');
 result.status='FRESH_EXACT_ROOT_NO_MATCH_CLOSED';
 await writeNew('fresh-root-result.json',result);
 process.stdout.write(JSON.stringify(result)+'\n');
} catch(error) {
 result.error={name:error.name,message:error.message};
 await writeNew('fresh-root-refusal.json',result);
 process.stderr.write(JSON.stringify(result)+'\n');process.exitCode=3;
}
