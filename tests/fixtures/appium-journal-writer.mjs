import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const db = new DatabaseSync(join(process.argv[2], 'stop-journal.sqlite'));
db.exec('BEGIN EXCLUSIVE');
process.send({ holding: true });
await new Promise(resolve => setTimeout(resolve, 300));
db.exec('COMMIT'); db.close();
process.disconnect();
