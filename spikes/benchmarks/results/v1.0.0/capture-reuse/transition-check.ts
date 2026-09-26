import { MobileBuildMcpDriver } from '../../../../../src/device/index.js';
const udid = '0E42FDE2-5E09-42D3-9876-9EF0037FCBE7';
const d = new MobileBuildMcpDriver({ cwd: process.cwd(), defaultUdid: udid, capture: 'full', screenshots: true });
const ctx = { app: { bundleId: 'dev.jevbridge.diagnostic' }, values: {} };
const sig = () => new AbortController().signal;
await d.prepare(ctx, sig());
let snap = await d.observe(sig());
for (const id of ['choose.apple', 'choose.bread', 'order.complete']) {
  const target = snap.elements.find(e => e.identifier === id && e.actions.includes('tap'))!;
  const settled = await d.act({ kind: 'tap', targetRef: target.ref }, snap, { ...ctx }, sig());
  const later = await d.observe(sig());
  const strip = (s: any) => s.elements.map(({ ref, ...e }: any) => JSON.stringify(e));
  const a = new Set(strip(settled)), b = new Set(strip(later));
  console.log(id, 'hash', settled!.screenHash, later.screenHash, 'n', a.size, b.size);
  for (const x of a) if (!b.has(x)) console.log('  only-settled', x.slice(0, 200));
  for (const x of b) if (!a.has(x)) console.log('  only-later  ', x.slice(0, 200));
  snap = later;
}
await d.close(sig());
