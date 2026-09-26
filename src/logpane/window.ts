import { execFile } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** The command that follows a run's app output in any terminal. */
export function logsCommand(cliPath: string, runId: string): string {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} logs ${runId}`;
}

/** Why no window opened, or undefined when one can. The run carries on either way. */
export async function paneWindowBlocked(environment: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  if (environment.JEV_LOG_PANE === 'off') return 'turned off with JEV_LOG_PANE=off';
  if (process.platform !== 'darwin') return 'not on macOS';
  if (environment.SSH_CONNECTION || environment.SSH_TTY) return 'running over SSH';
  if (environment.CI) return 'running in CI';
  try {
    // "Aqua" is a logged-in desktop session; anything else can't show a window.
    const { stdout } = await run('launchctl', ['managername']);
    if (stdout.trim() !== 'Aqua') return 'no desktop session';
  } catch { return 'no desktop session'; }
  return undefined;
}

/**
 * Open the pane in a new terminal window: a .command file in the run folder, opened through
 * LaunchServices. That picks the app macOS uses for .command files (Terminal unless changed), with no
 * AppleScript and so no Automation permission prompt. JEV_LOG_PANE_APP names another terminal app.
 */
export async function openPaneWindow(runDir: string, command: string,
  environment: NodeJS.ProcessEnv = process.env): Promise<{ opened: true; app: string } | { opened: false; reason: string }> {
  const blocked = await paneWindowBlocked(environment);
  if (blocked) return { opened: false, reason: blocked };
  const file = join(runDir, 'log-pane.command');
  await writeFile(file, `#!/bin/zsh\nclear\nexec ${command}\n`, { mode: 0o700 });
  await chmod(file, 0o700);
  const app = environment.JEV_LOG_PANE_APP?.trim();
  try {
    await run('open', app ? ['-a', app, file] : [file]);
    return { opened: true, app: app || 'the default terminal' };
  } catch {
    return { opened: false, reason: `could not open ${app || 'a terminal window'}` };
  }
}
