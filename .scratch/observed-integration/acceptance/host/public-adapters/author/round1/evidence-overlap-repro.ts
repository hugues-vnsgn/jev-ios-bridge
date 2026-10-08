import assert from 'node:assert/strict';
import {mkdtemp,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setupPublicFixture,fixtureObserved,actionRequest,fixtureCalls} from '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters/tests/fixtures/observed-cli-server.ts';
const root=await mkdtemp(join(tmpdir(),'jev-evidence-overlap-'));const f=await setupPublicFixture(root);
const module=fixtureObserved(root,true,'already');
try {
 const allocation=await module.prepareAllocation(f.request('one'));assert.ok(!('kind' in allocation));
 console.log({allocation});const action=await module.start(actionRequest(allocation.allocationId));
 const terminal=await module.inspect('one',{waitMs:5000});console.log({terminal,calls:fixtureCalls(root)});
 console.log({actionDirectoryExists:(await lstat(join(f.runsDir,'observed','one'))).isDirectory()});
 assert.equal(terminal.outcome,'already_satisfied');
}finally{await module.close();await f.cleanup();await rm(root,{recursive:true,force:true});}
