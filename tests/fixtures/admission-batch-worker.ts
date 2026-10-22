import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Admission } from '../../src/device/admission.js';

const [root, mode] = process.argv.slice(2);
if (!root || !mode || !['declaration', 'reads', 'sequence'].includes(mode)) throw new Error('Expected isolated root and merge rule');
const admission = Admission.forTesting({ root, backend: 'fake', durability: 'full', initialize: false,
  fault(point, operation) {
    if (point === 'afterCommit' && operation === (mode === 'reads' ? 'authorizeReads' : mode === 'sequence' ? 'advance' : 'authorize')) process.kill(process.pid, 'SIGKILL');
  },
});
const acquired = admission.acquire({ category: 'android-phone', device: 'fake-hardware',
  attempt: { kind: 'legacy', id: mode }, digest: mode, intent: {} });
if (acquired.kind !== 'acquired') throw new Error('Expected admission');
const session = acquired.claim.bindDriver('fake');
if (mode === 'sequence') {
  await session.dispatchSequence(['first', 'second'].map((request, index) => ({ request,
    effect: async () => { writeFileSync(join(root, `sent-${index}`), request); return request; } })));
} else if (mode === 'reads') {
  await session.dispatchReads(['identity-name', 'identity-id', 'identity-path'].map(operation => ({ operation,
    read: async () => { writeFileSync(join(root, 'sent'), operation); return operation; } })));
} else await session.dispatch({ requestId: 'start', componentId: 'adb-start', operation: 'start', payload: {},
  components: [
    { id: 'adb-start', kind: 'adb-command', serial: 'fake-transport', args: ['shell', 'start'] },
    { id: 'agent', kind: 'android-agent', serial: 'fake-transport', classpath: '/fake/agent.dex', className: 'FakeAgent' },
  ],
}, async () => { writeFileSync(join(root, 'sent'), 'sent'); });
