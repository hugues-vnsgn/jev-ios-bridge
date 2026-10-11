import {recordCommand,writeNew} from './commands.mjs';
if(process.argv.length!==3||process.argv[2]!=='--read-only-once')throw new Error('Explicit once argument required');
const roots=['/Users/hugues_mini/.gradle','/Users/hugues_mini/Library/Caches','/Users/hugues_mini/.cache'];
const observed=await recordCommand('du',['/usr/bin/du','-k','-d','1','-P',...roots],{timeoutMs:180000,cap:65536});const r=observed.receipt;
const result={status:observed.ok?'RAW_CACHE_CHILD_INVENTORY_COMPLETE':'RAW_CACHE_CHILD_INVENTORY_PARTIAL_OR_REFUSED',roots,duCalls:1,actualClose:r.closedAtUtc,exitCode:r.exitCode,signal:r.signal,captureComplete:r.captureComplete,timedOut:r.timedOut,overflow:r.overflow,stdoutBytes:r.stdoutOriginalBytes,stderrBytes:r.stderrOriginalBytes,symlinkPolicy:'Explicit du -P; output limited to root/immediate-child depth1',relocations:0,cleanup:0,inactivityChecks:0,namespaceOrPermissionWork:0,builds:0,deviceOperations:0};
await writeNew('inventory-result.json',result);await new Promise(done=>process.stdout.write(JSON.stringify(result)+'\n',done));process.exitCode=observed.ok?0:3;
