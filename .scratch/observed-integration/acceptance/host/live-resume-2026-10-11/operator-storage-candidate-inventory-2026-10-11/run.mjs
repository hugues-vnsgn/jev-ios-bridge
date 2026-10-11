import {recordCommand,writeNew} from './commands.mjs';
if(process.argv.length!==3||process.argv[2]!=='--read-only-once')throw new Error('Explicit once argument required');
const paths=['/Users/hugues_mini/Downloads','/Users/hugues_mini/Desktop','/Users/hugues_mini/Movies','/Users/hugues_mini/Library/Developer/Xcode/DerivedData','/Users/hugues_mini/Library/Caches','/Users/hugues_mini/orca/workspaces/jev-ios-bridge'];
const observed=await recordCommand('du',['/usr/bin/du','-sk','-P',...paths],{timeoutMs:120000,cap:65536});
const r=observed.receipt;
const result={status:observed.ok?'RAW_INVENTORY_COMPLETE':'RAW_INVENTORY_PARTIAL_OR_REFUSED',paths,duCalls:1,actualClose:r.closedAtUtc,exitCode:r.exitCode,signal:r.signal,captureComplete:r.captureComplete,timedOut:r.timedOut,overflow:r.overflow,stdoutBytes:r.stdoutOriginalBytes,stderrBytes:r.stderrOriginalBytes,symlinkPolicy:'Explicit du -P: no symbolic link following',scopeQualifier:'du metadata traversal only; no file contents read. Project-workspace root includes active worktrees and preserved evidence in its aggregate, so this total is not relocation authorization.',relocations:0,cleanup:0,deviceOperations:0};
await writeNew('inventory-result.json',result);await new Promise(done=>process.stdout.write(JSON.stringify(result)+'\n',done));process.exitCode=observed.ok?0:3;
