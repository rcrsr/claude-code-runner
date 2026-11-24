/**
 * ANSI color codes for terminal output
 */

import {
  CONTEXT_WINDOW_1M_MODEL_PREFIXES,
  CONTEXT_WINDOW_1M_TOKENS,
  CONTEXT_WINDOW_DEFAULT_TOKENS,
  DISPLAY_FALLBACK_WIDTH,
  STATUS_LINE_ELLIPSIS,
  STATUS_LINE_MIN_WIDTH,
} from '../utils/constants.js';
import { configureDeadDrop, flushDeadDrop, sendToDeadDrop } from './deaddrop-queue.js';
import type { FormatterState } from './formatter.js';

// Re-export deaddrop functions for backward compatibility
export { configureDeadDrop, flushDeadDrop };

// Module-level formatter state binding (follows configureDeadDrop pattern)
let boundFormatterState: FormatterState | null = null;

/**
 * Bind a FormatterState so terminalLog re-renders the status line after each log.
 * Call once at runner startup; call unbindFormatterState() on teardown.
 */
export function bindFormatterState(state: FormatterState): void {
  boundFormatterState = state;
}

/**
 * Unbind the formatter state (teardown).
 */
export function unbindFormatterState(): void {
  boundFormatterState = null;
}

export const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
} as const;

export type ColorName = keyof typeof colors;

/**
 * Background colors for agent markers (8 distinct colors)
 * Uses bright background colors (100-107) for better visibility
 */
const AGENT_BG_COLORS = [
  '\x1b[106m', // bright cyan
  '\x1b[103m', // bright yellow
  '\x1b[102m', // bright green
  '\x1b[105m', // bright magenta
  '\x1b[104m', // bright blue
  '\x1b[101m', // bright red
  '\x1b[107m', // bright white
  '\x1b[100m', // bright black (gray)
] as const;

/**
 * Hash an agent ID string to a stable color index in [0, AGENT_BG_COLORS.length).
 * Uses djb2-style hashing: accumulates hash = (hash * 31 + charCode) >>> 0.
 * @param id - Agent ID string to hash
 */
export function hashAgentId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % AGENT_BG_COLORS.length;
}

/**
 * Get an agent marker: inverted dot with cycling background color
 * @param index - Color index (0-based), from hashAgentId or direct value
 */
export function agentMarker(index: number): string {
  const bg = AGENT_BG_COLORS[index % AGENT_BG_COLORS.length];
  return `${bg}\x1b[30m●${colors.reset}`;
}

/**
 * Strip ANSI escape codes from a string
 */
// oxlint-disable-next-line no-control-regex -- ANSI escape codes require control characters
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Strip carriage returns for cleaner terminal display
 * Tool outputs sometimes contain CRs that cause display issues
 */
export function stripCR(str: string): string {
  return str.replace(/\r/g, '');
}

/**
 * Escape sequences a hostile string could use to drive the terminal:
 * OSC (window title, clipboard), CSI including private modes, and two-byte ESC sequences (e.g. ESC c reset).
 */
const TERMINAL_ESCAPE_REGEX =
  // oxlint-disable-next-line no-control-regex -- matching terminal control sequences requires control characters
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[0-~]?/g;
// oxlint-disable-next-line no-control-regex -- C0/C1 control characters
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f-\x9f]+/g;

/**
 * Make an untrusted string safe to print on one terminal line: drop escape
 * sequences, then collapse remaining control characters (newlines, tabs) to a space.
 */
export function sanitizeForTerminal(str: string): string {
  return str.replace(TERMINAL_ESCAPE_REGEX, '').replace(CONTROL_CHARS_REGEX, ' ');
}

/**
 * Terminal columns a code point occupies: 0 for combining marks and
 * zero-width characters, 2 for East Asian wide and emoji, 1 otherwise.
 */
function codePointWidth(cp: number): number {
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  ) {
    return 0;
  }
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Display width of a string in terminal columns (no ANSI codes expected)
 */
export function stringWidth(str: string): number {
  let width = 0;
  for (const ch of str) {
    width += codePointWidth(ch.codePointAt(0) ?? 0);
  }
  return width;
}

const ELLIPSIS = '...';

/**
 * Keep the first characters of `str` so the result, ellipsis included, fits
 * in `width` columns. Never splits a surrogate pair.
 */
export function truncateToWidth(str: string, width: number): string {
  if (stringWidth(str) <= width) return str;
  const budget = width - ELLIPSIS.length;
  let used = 0;
  let out = '';
  for (const ch of str) {
    const w = codePointWidth(ch.codePointAt(0) ?? 0);
    if (used + w > budget) break;
    used += w;
    out += ch;
  }
  return out + ELLIPSIS;
}

/**
 * Keep the last characters of `str` so the result, ellipsis included, fits
 * in `width` columns. Used for paths, where the filename is the useful part.
 */
export function truncateStartToWidth(str: string, width: number): string {
  if (stringWidth(str) <= width) return str;
  const budget = width - ELLIPSIS.length;
  const chars = Array.from(str);
  let used = 0;
  let start = chars.length;
  while (start > 0) {
    const w = codePointWidth(chars[start - 1]?.codePointAt(0) ?? 0);
    if (used + w > budget) break;
    used += w;
    start--;
  }
  return ELLIPSIS + chars.slice(start).join('');
}

/**
 * Log to terminal with CR stripping for clean display
 * Use this for all terminal output in the formatter
 *
 * @param line - Text to log
 * @param state - Optional formatter state; if provided and currentStatusText is non-null, re-renders status line
 */
export function terminalLog(line: string, state?: FormatterState): void {
  const effectiveState = state ?? boundFormatterState;

  // Clear status line before logging to prevent ghost lines in scrollback
  if (effectiveState !== null && effectiveState.currentStatusText !== null) {
    clearStatusLine(process.stderr);
  }

  console.log(stripCR(line));

  // Re-render status line below new cursor position
  if (effectiveState !== null && effectiveState.currentStatusText !== null) {
    renderStatusLine(statusDisplayText(effectiveState), process.stderr);
  }
}

/**
 * Apply color to a string
 */
export function colorize(text: string, color: ColorName): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, len: number): string {
  if (str.length <= len) {
    return str;
  }
  return str.slice(0, len) + '...';
}

/**
 * Format elapsed milliseconds as hh:mm:ss
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Shorten a model ID to Anthropic's alias shorthand without the claude- prefix.
 * Current-generation IDs are dateless ("claude-opus-5" → "opus-5"); older IDs
 * carry a date suffix that gets stripped ("claude-sonnet-4-5-20250929" → "sonnet-4-5").
 * A trailing "[1m]" is dropped too ("claude-sonnet-4-5-20250929[1m]" → "sonnet-4-5").
 */
export function shortModelName(model: string): string {
  // The [1m] beta suffix is dropped for display; ctx % already reflects the window
  return model
    .replace(/\[1m\]$/, '')
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '');
}

/**
 * Context window in tokens for a model ID.
 * 1M for the current large-context families, 200k otherwise (and when unknown).
 */
export function contextWindowForModel(model: string | null): number {
  if (model === null) return CONTEXT_WINDOW_DEFAULT_TOKENS;
  // Explicit 1M-context beta suffix (e.g. "sonnet-4-5[1m]")
  if (model.includes('[1m]')) return CONTEXT_WINDOW_1M_TOKENS;
  const short = shortModelName(model);
  return CONTEXT_WINDOW_1M_MODEL_PREFIXES.some((prefix) => short.startsWith(prefix))
    ? CONTEXT_WINDOW_1M_TOKENS
    : CONTEXT_WINDOW_DEFAULT_TOKENS;
}

/**
 * Build the "[model · ctx N%]" status segment.
 * Returns null when neither model nor context info is available.
 */
export function statusInfoSegment(state: FormatterState): string | null {
  const parts: string[] = [];
  if (state.currentModel !== null) {
    parts.push(shortModelName(state.currentModel));
  }
  if (state.contextTokens !== null) {
    const window = contextWindowForModel(state.currentModel);
    const pct = Math.min(100, Math.round((state.contextTokens / window) * 100));
    parts.push(`ctx ${pct}%`);
  }
  if (parts.length === 0) return null;
  return `[${parts.join(' · ')}]`;
}

/**
 * Active runtime as of `now`: accumulated ticks plus the delta since the
 * last tick. Excludes gaps where the process was not running (crash/resume).
 */
export function getActiveElapsedMs(
  state: Pick<FormatterState, 'elapsedMs' | 'lastTickTime'>,
  now: number
): number {
  return state.elapsedMs + (state.lastTickTime !== null ? now - state.lastTickTime : 0);
}

/**
 * Build display text for the status line, prepending accumulated runtime
 * and model/context info when available.
 * Example: "[00:12:34] [opus-4-5 · ctx 42%] reviewing implementation"
 * Returns null when there is no active status text.
 */
export function statusDisplayText(state: FormatterState): string | null {
  if (state.currentStatusText === null) return null;
  const segments = [`[${formatElapsed(getActiveElapsedMs(state, Date.now()))}]`];
  const info = statusInfoSegment(state);
  if (info !== null) {
    segments.push(info);
  }
  segments.push(state.currentStatusText);
  return segments.join(' ');
}

/**
 * Current terminal width for display truncation.
 * Falls back to a fixed width when stdout is not a TTY (piped/CI).
 */
export function displayWidth(): number {
  // Types claim columns is always defined, but it's undefined when not a TTY
  const columns = process.stdout.columns as number | undefined;
  return columns ?? DISPLAY_FALLBACK_WIDTH;
}

/**
 * Format duration in human-readable form
 * Examples: 450ms, 2.5s, 1m 30s, 1h 2m 3s
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.round(totalSeconds % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

/**
 * Shorten file paths by removing common prefixes
 */
export function shortenPath(filePath: string): string {
  return filePath
    .replace(/.*\/apps\//, 'apps/')
    .replace(/.*\/packages\//, 'packages/')
    .replace(/.*\/scripts\//, 'scripts/')
    .replace(/.*\/\.claude\//, '.claude/')
    .replace(/.*\/infra\//, 'infra/');
}

/**
 * Format current timestamp as HH:MM:SS.mmm
 */
export function formatTimestamp(date: Date = new Date()): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Get a timestamped prefix for output lines
 */
export function timestampPrefix(): string {
  return `${colors.dim}${formatTimestamp()}${colors.reset} `;
}

/**
 * ANSI escape sequence: clear entire line + carriage return to column 0
 */
const ANSI_CLEAR_LINE_CR = '\x1b[2K\r';

/** The parts of a TTY stream the status line uses; process.stderr satisfies it */
export interface StatusStream {
  isTTY?: boolean | undefined;
  columns?: number | undefined;
  write(chunk: string): unknown;
}

/**
 * Render a status line on the current cursor line.
 * Uses \r to park cursor at column 0 so the next console.log overwrites it.
 * When text is null or empty, clears the status line.
 *
 * @param text - Status text to display, or null to clear
 * @param stream - Output stream (expected: process.stderr)
 */
export function renderStatusLine(text: string | null, stream: StatusStream): void {
  // No-op when not a TTY
  if (!stream.isTTY) {
    return;
  }

  // Get terminal width with fallback to 80 for misconfigured TTYs (EC-5)
  // TypeScript types guarantee columns is defined when isTTY is true,
  // but handle edge case where it might be undefined at runtime
  const terminalWidth = stream.columns ?? 80;

  // Suppress display if terminal too narrow
  if (terminalWidth < STATUS_LINE_MIN_WIDTH) {
    return;
  }

  try {
    // Clear current line
    stream.write(ANSI_CLEAR_LINE_CR);

    // If text provided, sanitize and render on current line
    if (text?.trim()) {
      // Strip ANSI codes for security (IC-2)
      let sanitized = stripAnsi(text);

      // Strip newlines to keep single line
      sanitized = sanitized.replace(/[\r\n]+/g, ' ');

      // Truncate if exceeds terminal width
      if (sanitized.length > terminalWidth) {
        sanitized =
          sanitized.slice(0, terminalWidth - STATUS_LINE_ELLIPSIS.length) + STATUS_LINE_ELLIPSIS;
      }

      // Write dim text, then \r to park cursor at column 0
      stream.write(`${colors.dim}${sanitized}${colors.reset}\r`);
    }
  } catch {
    // Ignore write errors (broken pipe)
  }
}

/**
 * Clear the status line from terminal display.
 *
 * @param stream - Output stream (expected: process.stderr)
 */
export function clearStatusLine(stream: StatusStream): void {
  // No-op when not a TTY
  if (!stream.isTTY) {
    return;
  }

  try {
    stream.write(ANSI_CLEAR_LINE_CR);
  } catch {
    // Ignore write errors
  }
}

/**
 * Deaddrop user type
 */
export type DeadDropUser = 'Runner' | 'Claude Code';

/**
 * Deaddrop send function type (to avoid circular imports)
 */
export type DeadDropSender = (content: string, user: DeadDropUser) => Promise<void>;

/**
 * Print a [RUNNER] operational message with timestamp
 * Automatically sends to Deaddrop if configured (without prefix)
 */
export function printRunner(message: string): void {
  terminalLog(`${timestampPrefix()}${colors.magenta}[runner]${colors.reset} ${message}`);
  sendToDeadDrop(stripAnsi(message), 'Runner');
}

/**
 * Print a [RUNNER] informational message with timestamp
 * Does NOT send to Deaddrop (used for startup config, debug info)
 */
export function printRunnerInfo(message: string): void {
  terminalLog(`${timestampPrefix()}${colors.magenta}[runner]${colors.reset} ${message}`);
}

/**
 * Print a [CLAUDE] message with timestamp
 * Automatically sends to Deaddrop if configured (without prefix)
 * @param message - Display message (may be truncated/formatted for console)
 * @param rawForDeaddrop - Original unmodified text to send to deaddrop (preserves newlines)
 */
export function printClaude(message: string, rawForDeaddrop?: string): void {
  terminalLog(`${timestampPrefix()}${colors.green}[claude]${colors.reset} ${message}`);
  sendToDeadDrop(stripAnsi(rawForDeaddrop ?? message), 'Claude Code');
}
