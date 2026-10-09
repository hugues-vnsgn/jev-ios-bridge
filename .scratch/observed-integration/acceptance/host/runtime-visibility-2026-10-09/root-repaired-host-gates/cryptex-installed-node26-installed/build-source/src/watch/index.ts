import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readRunEvents, validateRunId } from '../log/index.js';
import { buildScriptedReport } from '../scripted/report.js';

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Verification run</title><link rel="stylesheet" href="/style.css">
<main><header><p>Jev iOS Bridge</p><h1>Verification run</h1><p id="status">Loading recorded evidence…</p></header>
<section id="timeline" aria-live="polite"></section></main><script src="/app.js" defer></script></html>`;
const css = `body{margin:0;background:#f6f5f2;color:#222;font:16px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px}header{border-bottom:2px solid #164e63;margin-bottom:24px}h1{font-size:32px}article{background:white;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}img{max-width:320px;max-height:600px}h2{font-size:18px;margin:0 0 8px}.passed{color:#176534}.failed{color:#a51c30}`;
const script = `const query=new URLSearchParams(location.search);const token=query.get('token');const runId=query.get('run');
const status=document.querySelector('#status');const timeline=document.querySelector('#timeline');let seen=0;
const heading=document.querySelector('h1');
const titles={started:'Scenario',prepared:'App ready',step:'Observe',judgment:'Jev judgments',action:'Action',error:'Execution problem',checkpoint:'Checkpoint result',verdict:'Outcome',preflight:'Preflight',decision:'Jev decision',search:'Target search',handback:'Handed back to Claude',handback_answer:"Claude's answer"};
const deciders={script:'the script',jev:'Jev',claude:'Claude'};function percent(value){return Math.round(value*100)+'%';}
function paragraph(card,value){const p=document.createElement('p');p.textContent=value;card.append(p);}
function target(t){return [t.role,t.label!==undefined?'"'+t.label+'"':'',t.identifier!==undefined?'identifier "'+t.identifier+'"':''].filter(Boolean).join(' ');}
function details(card,title,value){const box=document.createElement('details');const summary=document.createElement('summary');summary.textContent=title;const text=document.createElement('pre');text.textContent=value;box.append(summary,text);card.append(box);}
async function refresh(){try{const response=await fetch('/events?run='+encodeURIComponent(runId),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Cannot read run ('+response.status+')');const report=await response.json();const ended=report.events.some(event=>event.type==='verdict');const start=report.events.find(event=>event.type==='started');const planned=start?.data?.plannedSteps?.length;const driven=(start?.data?.plannedSteps||[]).some(step=>step.kind==='do');const answered=new Set(report.events.filter(event=>event.type==='handback_answer').map(event=>event.data.pauseId));const open=report.events.filter(event=>event.type==='handback'&&!answered.has(event.data.pauseId)).at(-1);
const platform=start?.data?.platform==='android'?'Android':'iOS';document.title=platform+' verification run';heading.textContent=platform+' verification run';
status.textContent=ended?report.verdict+': '+report.reason:open?'Waiting for Claude (needs_claude): step '+open.data.stepId+', '+open.data.reason+'.':(start?.data?.mode==='scripted'?'Running or interrupted after step '+report.steps+(planned?' of '+planned:'')+'.':'No final verdict recorded yet.');status.className=ended?report.verdict:'';
for(const event of report.events.slice(seen)){const card=document.createElement('article');const title=document.createElement('h2');title.textContent=event.sequence+'. '+(titles[event.type]||event.type);card.append(title);const data=event.data;
if(event.type==='started'){if(data.mode==='scripted'){paragraph(card,'Script for '+(data.bundleId||data.package));if(data.start)paragraph(card,'Start: '+data.start);for(const step of data.plannedSteps||[])paragraph(card,step.id+' ('+step.kind+')');}else{paragraph(card,data.goal||'Scenario with '+(data.checkpoints||[]).length+' ordered checkpoints');for(const checkpoint of data.checkpoints||[])paragraph(card,checkpoint.id+': '+checkpoint.goal);}}
if(event.type==='step'){paragraph(card,'Step '+data.step+(data.stepId?' · '+data.stepId:'')+(data.poll?' · wait poll '+data.poll:''));if(data.observationSummary)details(card,'Screen description',data.observationSummary);if(data.assertionObservation)details(card,'Full assertion observation',data.assertionObservation);if(data.logTails)for(const [name,tail] of Object.entries(data.logTails))details(card,'App log: '+name,tail);}
if(event.type==='judgment'){if(data.probabilities){for(const [name,value] of Object.entries(data.probabilities))paragraph(card,'Claim '+name+': '+Math.round(value*100)+'% probability.');}else{const j=data.judgment||{};paragraph(card,'Chosen action: '+j.choice+'; confidence: '+Math.round(j.confidence*100)+'%.');paragraph(card,'Goal reached: '+Math.round(j.goalReached*100)+'% probability.');for(const [name,value] of Object.entries(j.assertions||{}))paragraph(card,'Assertion '+name+': '+Math.round(value*100)+'% probability.');}}
if(event.type==='checkpoint'){paragraph(card,'Checkpoint '+(data.stepId||data.checkpointId)+' '+(data.status||'recorded')+' at step '+data.step+'.');for(const assertion of data.assertions||[])paragraph(card,assertion.claim+' ('+Math.round(assertion.probability*100)+'% probability)');}
if(event.type==='action'){const decider=data.decidedBy||(driven?'script':undefined);paragraph(card,(data.description||'Step '+data.step+': '+data.action+(data.target&&data.target.role?' on '+target(data.target)+(data.resolvedRef?' (ref '+data.resolvedRef+')':''):data.resolvedRef?' on '+data.resolvedRef:''))+(decider?', decided by '+(deciders[decider]||decider)+(typeof data.confidence==='number'?' (confidence '+percent(data.confidence)+')':'')+'.':''));}
if(event.type==='preflight')paragraph(card,'Preflight '+data.status+(typeof data.exitCode==='number'?', exit code '+data.exitCode:'')+(data.failure?' ('+data.failure+')':'')+'.');
if(event.type==='decision')paragraph(card,'Jev decision '+data.decision+': '+data.choice+', confidence '+percent(data.confidence)+'; step done '+percent(data.done)+'.'+(data.stepDone?' Jev judged the step done.':''));
if(event.type==='search')paragraph(card,'Scrolled '+data.direction+' (attempt '+data.attempt+'): '+(data.changed?'the screen changed':'no change')+'. Decided by the bridge (target search).');
if(event.type==='handback')paragraph(card,'Step '+data.stepId+' handed back to Claude: '+data.reason+'.');
if(event.type==='handback_answer'){const pause=report.events.find(other=>other.type==='handback'&&other.data.pauseId===data.pauseId);paragraph(card,'Claude answered '+data.kind+(pause?' after '+Math.round((Date.parse(event.at)-Date.parse(pause.at))/1000)+' s':'')+'.'+(data.kind==='done'?' Claude declared the step done.':''));}
if(event.type==='error')paragraph(card,data.code?'Execution problem: '+data.code+' during '+data.phase:(data.message||'Execution could not continue'));
if(event.type==='verdict'){paragraph(card,data.reason||data.verdict);paragraph(card,'Steps: '+(data.steps||0)+'; input tokens: '+(data.inputTokens||0)+'.');}
if(event.type==='step'&&data.screenshotPath){const response=await fetch('/image?run='+encodeURIComponent(runId)+'&name='+encodeURIComponent(data.screenshotPath),{headers:{Authorization:'Bearer '+token}});if(response.ok){const img=document.createElement('img');img.alt='Screen captured at step '+data.step;img.src=URL.createObjectURL(await response.blob());card.append(img);}}
details(card,'Recorded event',JSON.stringify(data,null,2));timeline.append(card);}seen=report.events.length;}catch(error){status.textContent=error.message;}finally{setTimeout(refresh,1000);}}refresh();`;

export interface WatchServer {
  /** The watch URL for one run. Its token opens only that run's evidence, for as long as this server lives. */
  urlFor(runId: string): string;
  close(): Promise<void>;
}

export async function startWatchServer(baseDir: string): Promise<WatchServer> {
  const tokens = new Map<string, string>();
  const root = resolve(baseDir);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; object-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    try {
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/' || url.pathname === '/app.js' || url.pathname === '/style.css') {
        const [mime, body] = url.pathname === '/' ? ['text/html', page]
          : url.pathname === '/app.js' ? ['application/javascript', script] : ['text/css', css];
        response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }).end(body); return;
      }
      const runId = validateRunId(url.searchParams.get('run') ?? '');
      const token = tokens.get(runId);
      const presented = Buffer.from((request.headers.authorization ?? '').replace(/^Bearer /, ''));
      if (!token || presented.length !== token.length || !timingSafeEqual(presented, Buffer.from(token))) {
        response.writeHead(401).end('Unauthorized'); return;
      }
      if (url.pathname === '/events') {
        const report = buildScriptedReport(await readRunEvents(root, runId));
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(report)); return;
      }
      if (url.pathname === '/image') {
        const name = url.searchParams.get('name') ?? '';
        if (!/^screen-\d+\.(png|jpg)$/.test(name)) { response.writeHead(400).end('Invalid image'); return; }
        const image = await readFile(join(root, runId, name));
        response.writeHead(200, { 'Content-Type': name.endsWith('.png') ? 'image/png' : 'image/jpeg' }).end(image); return;
      }
      response.writeHead(404).end('Not found');
    } catch {
      response.writeHead(404).end('Run evidence unavailable');
    }
  });
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Watch server did not bind');
  return {
    urlFor(runId: string) {
      validateRunId(runId);
      let token = tokens.get(runId);
      if (!token) { token = randomBytes(32).toString('hex'); tokens.set(runId, token); }
      return `http://127.0.0.1:${address.port}/?token=${token}&run=${runId}`;
    },
    close: () => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())),
  };
}
