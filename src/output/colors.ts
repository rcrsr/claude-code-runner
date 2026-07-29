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
import {
  configureDeadDrop,
  flushDeadDrop,
  sendToDeadDrop,
} from './deaddrop-queue.js';
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
// eslint-disable-next-line no-control-regex -- ANSI escape codes require control characters
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
 */
export function shortModelName(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
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
  return CONTEXT_WINDOW_1M_MODEL_PREFIXES.some((prefix) =>
    short.startsWith(prefix)
  )
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
 * Build display text for the status line, prepending accumulated runtime
 * and model/context info when available.
 * Example: "[00:12:34] [opus-4-5 · ctx 42%] reviewing implementation"
 * Returns null when there is no active status text.
 */
export function statusDisplayText(state: FormatterState): string | null {
  if (state.currentStatusText === null) return null;
  const liveElapsed =
    state.lastTickTime !== null
      ? state.elapsedMs + (Date.now() - state.lastTickTime)
      : state.elapsedMs;
  const segments = [`[${formatElapsed(liveElapsed)}]`];
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

/**
 * Render a status line on the current cursor line.
 * Uses \r to park cursor at column 0 so the next console.log overwrites it.
 * When text is null or empty, clears the status line.
 *
 * @param text - Status text to display, or null to clear
 * @param stream - Output stream (expected: process.stderr)
 */
export function renderStatusLine(
  text: string | null,
  stream: NodeJS.WriteStream
): void {
  // No-op when not a TTY
  if (!stream.isTTY) {
    return;
  }

  // Get terminal width with fallback to 80 for misconfigured TTYs (EC-5)
  // TypeScript types guarantee columns is defined when isTTY is true,
  // but handle edge case where it might be undefined at runtime
  const terminalWidth = (stream.columns as number | undefined) ?? 80;

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
          sanitized.slice(0, terminalWidth - STATUS_LINE_ELLIPSIS.length) +
          STATUS_LINE_ELLIPSIS;
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
export function clearStatusLine(stream: NodeJS.WriteStream): void {
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
export type DeadDropSender = (
  content: string,
  user: DeadDropUser
) => Promise<void>;

/**
 * Print a [RUNNER] operational message with timestamp
 * Automatically sends to Deaddrop if configured (without prefix)
 */
export function printRunner(message: string): void {
  terminalLog(
    `${timestampPrefix()}${colors.magenta}[runner]${colors.reset} ${message}`
  );
  sendToDeadDrop(stripAnsi(message), 'Runner');
}

/**
 * Print a [RUNNER] informational message with timestamp
 * Does NOT send to Deaddrop (used for startup config, debug info)
 */
export function printRunnerInfo(message: string): void {
  terminalLog(
    `${timestampPrefix()}${colors.magenta}[runner]${colors.reset} ${message}`
  );
}

/**
 * Print a [CLAUDE] message with timestamp
 * Automatically sends to Deaddrop if configured (without prefix)
 * @param message - Display message (may be truncated/formatted for console)
 * @param rawForDeaddrop - Original unmodified text to send to deaddrop (preserves newlines)
 */
export function printClaude(message: string, rawForDeaddrop?: string): void {
  terminalLog(
    `${timestampPrefix()}${colors.green}[claude]${colors.reset} ${message}`
  );
  sendToDeadDrop(stripAnsi(rawForDeaddrop ?? message), 'Claude Code');
}
