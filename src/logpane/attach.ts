import { connect } from 'node:net';
import { createInterface } from 'node:readline';
import { bold, dim, renderLine } from './format.js';
import { paneSocketPath, type PaneMessage } from './stream.js';

/**
 * Follow a live run's app output in this terminal (`jev-ios-bridge logs RUN_ID`).
 * Resolves false when no live run is serving that ID. After the run ends it resolves true once the
 * pane should close: a few seconds after a pass, or when the person presses Ctrl-C otherwise.
 */
export function attachLogPane(runId: string, output: NodeJS.WriteStream = process.stdout,
  options: { keepOpen?: boolean } = {}): Promise<boolean> {
  const color = Boolean(output.isTTY) && !process.env.NO_COLOR;
  const print = (text: string) => output.write(text + '\n');
  // A pane that stays open must keep this process alive after the socket closes.
  const stayOpen = () => { if (options.keepOpen !== false) setInterval(() => {}, 1 << 30); };
  return new Promise(resolveAttach => {
    const socket = connect(paneSocketPath(runId));
    let connected = false;
    let ended = false;
    socket.once('connect', () => { connected = true; });
    socket.on('error', () => { if (!connected) resolveAttach(false); });
    const lines = createInterface({ input: socket });
    lines.on('error', () => {}); // readline re-emits the socket's errors; the socket handler owns them
    lines.on('line', raw => {
      let message: PaneMessage;
      try { message = JSON.parse(raw) as PaneMessage; } catch { return; }
      if (message.type === 'hello') {
        if (color) output.write(`\x1b]0;jev log · ${message.bundleId}\x07`);
        print(bold(`jev-ios-bridge log pane · ${message.bundleId} · run ${message.runId}`, color));
        print(dim(`app output: ${message.sources.runtime ?? 'unavailable'}`, color));
        print(dim(`system log (subsystem ${message.bundleId}): ${message.sources.os ?? 'unavailable'}`, color));
        print(dim('Local only: nothing here goes to Jev or the host agent. Values from the script are masked.\n', color));
      } else if (message.type === 'line') {
        print(renderLine(message, color));
      } else if (message.type === 'note') {
        print(bold(`!! ${message.text}`, color));
      } else if (message.type === 'end') {
        ended = true;
        print('\n' + bold(`── run finished: ${message.verdict} (${message.reason}) ──`, color));
        print(dim(`evidence: ${message.evidencePath}`, color));
        if (message.closeAfterMs !== undefined) {
          // A process can't close its Terminal window; Terminal's "When the shell exits" setting decides.
          print(dim('The pane has finished. Close this window when you like; Terminal closes it by itself if its ' +
            'profile is set to close the window when the shell exits.', color));
          setTimeout(() => resolveAttach(true), message.closeAfterMs);
        } else {
          print(dim('This window stays open. Close it or press Ctrl-C.', color));
          stayOpen();
        }
      }
    });
    socket.once('close', () => {
      if (!connected) return;
      if (!ended) {
        print('\n' + bold('── the bridge stopped before the run finished ──', color));
        print(dim('This window stays open. Close it or press Ctrl-C.', color));
        stayOpen();
      }
    });
  });
}
