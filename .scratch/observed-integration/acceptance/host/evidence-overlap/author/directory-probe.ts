import {mkdtemp,mkdir,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {FileObservedEvidence} from '../../../../../src/observed/evidence.js';
import {parseObservedAction} from '../../../../../src/observed/schema.js';
const root=await mkdtemp(join(tmpdir(),'jev-evidence-directory-probe-'));
const directory=join(root,'observed','one');await mkdir(join(directory,'allocation'),{recursive:true,mode:0o700});
try{const stat=await lstat(directory);console.log(JSON.stringify({mode:stat.mode&0o777,uid:stat.uid,owned:stat.uid===process.getuid?.(),symlink:stat.isSymbolicLink()}));
 const request=parseObservedAction({version:1,actionId:'one',allocationId:'ABCDEF00-0000-4000-8000-000000000001',app:{bundleId:'dev.fixture'},action:{kind:'tap',selector:{identifier:'go'}},before:{present:[{identifier:'go'}]},after:{present:[{identifier:'done'}]},timeoutMs:100});
 try{await new FileObservedEvidence().prepare(directory,request);console.log(JSON.stringify({prepared:true}));}catch(error){console.log(JSON.stringify({code:(error as NodeJS.ErrnoException).code,message:(error as Error).message}));process.exitCode=1;}
}finally{await rm(root,{recursive:true,force:true});}
