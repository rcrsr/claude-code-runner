/**
 * ANSI color codes for terminal output
 */

import {
  configureDeadDrop,
  flushDeadDrop,
  sendToDeadDrop,
} from './deaddrop-queue.js';

// Re-export deaddrop functions for backward compatibility
export { configureDeadDrop, flushDeadDrop };

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
 */
export function terminalLog(line: string): void {
  console.log(stripCR(line));
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
