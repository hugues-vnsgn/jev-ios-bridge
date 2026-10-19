import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import * as publicCore from 'appium-mcp/core';
const [preparationPath,platform,mode,directory]=process.argv.slice(2);
const preparation=JSON.parse(readFileSync(preparationPath,'utf8'));
const state={version:1,mode,platform,serverPid:process.pid,commands:[]};
let core;
function persist() {
  const file=join(directory,'server.json');writeFileSync(file+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});
  const fd=openSync(file+'.tmp','r');try{fsyncSync(fd);}finally{closeSync(fd);}
  renameSync(file+'.tmp',file);const dir=openSync(directory,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
}
const plugin={name:'jev-feasibility-fault-control',version:'0.1.0',
  register(_registry,availableCore){core=availableCore;persist();},
  beforeCall(ctx){
    const gate=JSON.parse(readFileSync(join(directory,'dispatch.json'),'utf8'));
    assert.equal(gate.closed,false,'Dispatch is durably closed');
    if(ctx.toolName==='appium_session_management'){
      assert.equal(ctx.args.action,'create');assert.equal(core.listSessions().length,0);
      const caps=JSON.parse(ctx.args.capabilities);
      assert.equal(caps['appium:udid'],platform==='ios'?preparation.ios.udid:preparation.android.serial);
      if(platform==='ios')assert.equal(caps['appium:simulatorDevicesSetPath'],preparation.ios.set);
      assert.equal(ctx.args.remoteServerUrl,undefined);
    }else{assert.equal(typeof ctx.args.sessionId,'string');assert.ok(core.getSessionInfo(ctx.args.sessionId));}
    assert.ok(!state.commands.some(x=>x.state==='outstanding'));
    state.commands.push({request:{name:ctx.toolName,arguments:ctx.args},state:'outstanding',startedAt:Date.now()});persist();
  },
  async afterCall(ctx,reply){
    const command=state.commands.at(-1);command.state='terminal';command.isError=reply.isError===true;command.endedAt=Date.now();
    if(ctx.toolName==='appium_session_management'&&!reply.isError){
      state.sessions=core.listSessions();assert.equal(state.sessions.length,1);
      reply={...reply,structuredContent:{extensionVersion:1,sessions:state.sessions}};
    }
    persist();
    if((mode==='lost-create'&&ctx.toolName==='appium_session_management')||(mode==='lost-action'&&ctx.toolName==='appium_gesture'))await new Promise(()=>{});
    if(mode==='late-action'&&ctx.toolName==='appium_gesture'){
      await new Promise(resolve=>setTimeout(resolve,2000));command.lateReplySentAt=Date.now();persist();
    }
    return reply;
  },
};
publicCore.configureStdioTransportLogging();
const server=await publicCore.createAppiumMcpServer({plugins:[plugin],policy:{allowTools:[/^appium_(session_management|gesture)$/]}});
await server.start({transportType:'stdio'});
