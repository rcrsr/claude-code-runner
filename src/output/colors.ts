/**
 * ANSI color codes for terminal output
 */

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
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
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
