/** Turning raw app and system log lines into pane lines. Pure functions, so they're easy to test. */

export type PaneSource = 'app' | 'os';
export type PaneLevel = 'error' | 'dim' | 'normal';
export interface PaneLine { source: PaneSource; time: string; level: PaneLevel; text: string }

const clock = (now = new Date()) => now.toTimeString().slice(0, 8);

/**
 * A line from the app's console (`simctl launch --console-pty`): print, NSLog, Kotlin println.
 * NSLog lines carry "2026-09-25 16:42:17.603 App[pid:tid] "; show their time and drop the prefix.
 */
export function appLine(raw: string, now?: Date): PaneLine | undefined {
  if (!raw.trim()) return undefined;
  const nslog = raw.match(/^\d{4}-\d\d-\d\d (\d\d:\d\d:\d\d\.\d{3}) \S+\[\d+:[0-9a-fx]+\] (.*)$/);
  const text = nslog ? nslog[2]! : raw;
  return { source: 'app', time: nslog ? nslog[1]! : clock(now), text,
    level: /\b(error|exception|fatal|crash)/i.test(text) ? 'error' : 'normal' };
}

/**
 * A line from `log stream --level=debug --predicate 'subsystem == "<bundle ID>"'`.
 * Columns: Timestamp Thread Type Activity PID TTL Process: (Library) [subsystem:category] message.
 * The tool's own chatter (headers, "Filtering the log data", getpwuid_r, child exit) is dropped.
 */
export function osLine(raw: string): PaneLine | undefined {
  if (!raw.trim() || /^Filtering the log data|^Timestamp\s+Thread/.test(raw)) return undefined;
  const parsed = raw.match(/^\S+ (\d\d:\d\d:\d\d\.\d{3})\S*\s+\S+\s+(\w+)\s+\S+\s+\d+\s+\d+\s+[^:]+:\s*(?:\([^)]*\)\s*)?(?:\[([^\]]*)\]\s*)?(.*)$/);
  if (!parsed) return undefined;
  const [, time, type, category, message] = parsed;
  return { source: 'os', time: time!, text: `${category ? `[${category}] ` : ''}${message}`,
    level: type === 'Error' || type === 'Fault' ? 'error' : type === 'Debug' || type === 'Info' ? 'dim' : 'normal' };
}

/** Mask every supplied script value as [value:<key>], longest first, as the run log redacts them. */
export function masker(values: Record<string, string>): (text: string) => string {
  const pairs = Object.entries(values).filter(([, value]) => value.length > 0)
    .sort((left, right) => right[1].length - left[1].length);
  return text => pairs.reduce((masked, [key, value]) => masked.split(value).join(`[value:${key}]`), text);
}

const ansi = { dim: '\x1b[2m', red: '\x1b[31m', cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m' };

/** Render one pane line for a terminal: time, [app] or [os], text; errors red, debug and info dim. */
export function renderLine(line: PaneLine, color: boolean): string {
  const paint = (code: string, text: string) => color ? `${code}${text}${ansi.reset}` : text;
  const tag = line.source === 'app' ? paint(ansi.cyan, '[app]') : '[os] ';
  const body = `${paint(ansi.dim, line.time.padEnd(12))} ${tag} ${line.text}`;
  return line.level === 'error' ? paint(ansi.red, body) : line.level === 'dim' ? paint(ansi.dim, body) : body;
}

export function bold(text: string, color: boolean): string { return color ? `${ansi.bold}${text}${ansi.reset}` : text; }
export function dim(text: string, color: boolean): string { return color ? `${ansi.dim}${text}${ansi.reset}` : text; }
