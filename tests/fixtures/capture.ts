import { Writable } from 'node:stream';

/** A writable that keeps everything written to it, for a test that reads what a log pane printed. */
export class Capture extends Writable {
  text = '';
  _write(chunk: Buffer, _encoding: string, done: () => void) { this.text += chunk.toString(); done(); }
}
