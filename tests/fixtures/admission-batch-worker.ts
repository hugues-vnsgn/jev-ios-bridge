import { AndroidOwnership } from '../../src/device/android/ownership.js';
import { hostIdentityFixture } from './identity-read-group.js';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Admission } from '../../src/device/admission.js';

const [root, mode] = process.argv.slice(2);
if (!root || !mode || !['declaration', 'reads', 'sequence', 'identity-start', 'identity-final'].includes(mode)) throw new Error('Expected isolated root and merge rule');
let groups = 0;
const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false,
  fault(point, operation) {
    if (mode.startsWith('identity-')) {
      if (point === 'afterCommit' && operation === 'authorizeReads' && ++groups === (mode === 'identity-start' ? 1 : 3)) process.kill(process.pid, 'SIGKILL');
      return;
    }
    if (point === 'afterCommit' && operation === (mode === 'reads' ? 'authorizeReads' : mode === 'sequence' ? 'advance' : 'authorize')) process.kill(process.pid, 'SIGKILL');
  },
});
const acquired = admission.acquire({ category: 'android-phone', device: 'fake-hardware',
  attempt: { kind: 'legacy', id: mode }, digest: mode, intent: {} });
if (acquired.kind !== 'acquired') throw new Error('Expected admission');
const session = () => acquired.claim.bindDriver('fake');
if (mode.startsWith('identity-')) {
  const ownership = new AndroidOwnership(admission, acquired.claim, 'emulator-5554', 'fake');
  const host = hostIdentityFixture(root, (file, args) => appendFileSync(join(root, 'probe-sent.jsonl'), JSON.stringify({ file, args }) + '\n'));
  await host.probe.withRecorder!(ownership.probe).android(AbortSignal.timeout(5000), 'emulator-5554');
} else if (mode === 'sequence') {
  await session().dispatchSequence(['first', 'second'].map((request, index) => ({ request,
    effect: async () => { writeFileSync(join(root, `sent-${index}`), request); return request; } })));
} else if (mode === 'reads') {
  await session().dispatchReads(['identity-name', 'identity-id', 'identity-path'].map(operation => ({ operation,
    read: async () => { writeFileSync(join(root, 'sent'), operation); return operation; } })));
} else await session().dispatch({ requestId: 'start', componentId: 'adb-start', operation: 'start', payload: {},
  components: [
    { id: 'adb-start', kind: 'adb-command', serial: 'fake-transport', args: ['shell', 'start'] },
    { id: 'agent', kind: 'android-agent', serial: 'fake-transport', classpath: '/fake/agent.dex', className: 'FakeAgent' },
  ],
}, async () => { writeFileSync(join(root, 'sent'), 'sent'); });
