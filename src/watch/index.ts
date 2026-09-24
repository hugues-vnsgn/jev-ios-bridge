import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readRunEvents, validateRunId } from '../log/index.js';
import { buildReport } from '../report/index.js';

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>iOS verification run</title><link rel="stylesheet" href="/style.css">
<main><header><p>Jev iOS Bridge</p><h1>Verification run</h1><p id="status">Loading recorded evidence…</p></header>
<section id="timeline" aria-live="polite"></section></main><script src="/app.js" defer></script></html>`;
const css = `body{margin:0;background:#f6f5f2;color:#222;font:16px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px}header{border-bottom:2px solid #164e63;margin-bottom:24px}h1{font-size:32px}article{background:white;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}img{max-width:320px;max-height:600px}h2{font-size:18px;margin:0 0 8px}.passed{color:#176534}.failed{color:#a51c30}`;
const script = `const query=new URLSearchParams(location.search);const token=query.get('token');const runId=query.get('run');
const status=document.querySelector('#status');const timeline=document.querySelector('#timeline');let seen=0;
async function refresh(){try{const response=await fetch('/events?run='+encodeURIComponent(runId),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Cannot read run ('+response.status+')');const report=await response.json();status.textContent=report.verdict+': '+report.reason;status.className=report.verdict;
for(const event of report.events.slice(seen)){const card=document.createElement('article');const title=document.createElement('h2');title.textContent=event.sequence+'. '+event.type;card.append(title);const text=document.createElement('pre');text.textContent=JSON.stringify(event.data,null,2);card.append(text);
if(event.type==='step'&&event.data.screenshotPath){const response=await fetch('/image?run='+encodeURIComponent(runId)+'&name='+encodeURIComponent(event.data.screenshotPath),{headers:{Authorization:'Bearer '+token}});if(response.ok){const img=document.createElement('img');img.alt='Screen captured at step '+event.data.step;img.src=URL.createObjectURL(await response.blob());card.append(img);}}
timeline.append(card);}seen=report.events.length;}catch(error){status.textContent=error.message;}finally{setTimeout(refresh,1000);}}refresh();`;

export async function startWatchServer(baseDir: string): Promise<{ url: string; close(): Promise<void> }> {
  const token = randomBytes(32).toString('hex');
  const root = resolve(baseDir);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
    try {
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/' || url.pathname === '/app.js' || url.pathname === '/style.css') {
        const [mime, body] = url.pathname === '/' ? ['text/html', page]
          : url.pathname === '/app.js' ? ['application/javascript', script] : ['text/css', css];
        response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }).end(body); return;
      }
      const presented = (request.headers.authorization ?? '').replace(/^Bearer /, '');
      if (presented.length !== token.length || !timingSafeEqual(Buffer.from(presented), Buffer.from(token))) {
        response.writeHead(401).end('Unauthorized'); return;
      }
      const runId = validateRunId(url.searchParams.get('run') ?? '');
      if (url.pathname === '/events') {
        const report = buildReport(await readRunEvents(root, runId));
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
    url: `http://127.0.0.1:${address.port}/?token=${token}`,
    close: () => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())),
  };
}
