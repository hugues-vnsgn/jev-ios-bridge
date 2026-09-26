import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readRunEvents, validateRunId } from '../log/index.js';
import { buildScriptedReport } from '../scripted/report.js';

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>iOS verification run</title><link rel="stylesheet" href="/style.css">
<main><header><p>Jev iOS Bridge</p><h1>Verification run</h1><p id="status">Loading recorded evidence…</p></header>
<section id="timeline" aria-live="polite"></section></main><script src="/app.js" defer></script></html>`;
const css = `body{margin:0;background:#f6f5f2;color:#222;font:16px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px}header{border-bottom:2px solid #164e63;margin-bottom:24px}h1{font-size:32px}article{background:white;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}img{max-width:320px;max-height:600px}h2{font-size:18px;margin:0 0 8px}.passed{color:#176534}.failed{color:#a51c30}`;
const script = `const query=new URLSearchParams(location.search);const token=query.get('token');const runId=query.get('run');
const status=document.querySelector('#status');const timeline=document.querySelector('#timeline');let seen=0;
const titles={started:'Scenario',prepared:'App ready',step:'Observe',judgment:'Jev judgments',action:'Action',error:'Execution problem',checkpoint:'Checkpoint result',verdict:'Outcome'};
function paragraph(card,value){const p=document.createElement('p');p.textContent=value;card.append(p);}
function details(card,title,value){const box=document.createElement('details');const summary=document.createElement('summary');summary.textContent=title;const text=document.createElement('pre');text.textContent=value;box.append(summary,text);card.append(box);}
async function refresh(){try{const response=await fetch('/events?run='+encodeURIComponent(runId),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Cannot read run ('+response.status+')');const report=await response.json();const ended=report.events.some(event=>event.type==='verdict');const start=report.events.find(event=>event.type==='started');const planned=start?.data?.plannedSteps?.length;status.textContent=ended?report.verdict+': '+report.reason:(start?.data?.mode==='scripted'?'Running or interrupted after step '+report.steps+(planned?' of '+planned:'')+'.':'No final verdict recorded yet.');status.className=ended?report.verdict:'';
for(const event of report.events.slice(seen)){const card=document.createElement('article');const title=document.createElement('h2');title.textContent=event.sequence+'. '+(titles[event.type]||event.type);card.append(title);const data=event.data;
if(event.type==='started'){if(data.mode==='scripted'){paragraph(card,'Script for '+data.bundleId);for(const step of data.plannedSteps||[])paragraph(card,step.id+' ('+step.kind+')');}else{paragraph(card,data.goal||'Scenario with '+(data.checkpoints||[]).length+' ordered checkpoints');for(const checkpoint of data.checkpoints||[])paragraph(card,checkpoint.id+': '+checkpoint.goal);}}
if(event.type==='step'){paragraph(card,'Step '+data.step+(data.stepId?' · '+data.stepId:'')+(data.poll?' · wait poll '+data.poll:''));if(data.observationSummary)details(card,'Screen description',data.observationSummary);if(data.assertionObservation)details(card,'Full assertion observation',data.assertionObservation);if(data.logTails)for(const [name,tail] of Object.entries(data.logTails))details(card,'App log: '+name,tail);}
if(event.type==='judgment'){if(data.probabilities){for(const [name,value] of Object.entries(data.probabilities))paragraph(card,'Claim '+name+': '+Math.round(value*100)+'% probability.');}else{const j=data.judgment||{};paragraph(card,'Chosen action: '+j.choice+'; confidence: '+Math.round(j.confidence*100)+'%.');paragraph(card,'Goal reached: '+Math.round(j.goalReached*100)+'% probability.');for(const [name,value] of Object.entries(j.assertions||{}))paragraph(card,'Assertion '+name+': '+Math.round(value*100)+'% probability.');}}
if(event.type==='checkpoint'){paragraph(card,'Checkpoint '+(data.stepId||data.checkpointId)+' '+(data.status||'recorded')+' at step '+data.step+'.');for(const assertion of data.assertions||[])paragraph(card,assertion.claim+' ('+Math.round(assertion.probability*100)+'% probability)');}
if(event.type==='action')paragraph(card,data.description||'Step '+data.step+': '+data.action+(data.resolvedRef?' on '+data.resolvedRef:''));
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
