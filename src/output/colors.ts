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
 * Examples: 450ms, 2.5s, 1m30s, 1h2m3s
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
    return `${hours}h${mins}m${secs}s`;
  }
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
 * Module-level deaddrop sender, configured once at startup
 */
let deadDropSender: DeadDropSender | null = null;

/**
 * Serial queue for deaddrop messages
 */
interface QueuedMessage {
  content: string;
  user: DeadDropUser;
}
const messageQueue: QueuedMessage[] = [];
let isProcessing = false;
let flushResolve: (() => void) | null = null;

/**
 * Configure the deaddrop sender for all output functions
 * Call once at startup when --deaddrop is enabled
 */
export function configureDeadDrop(sender: DeadDropSender | null): void {
  deadDropSender = sender;
}

/**
 * Process queued messages one at a time
 */
async function processQueue(): Promise<void> {
  if (isProcessing || !deadDropSender) return;
  isProcessing = true;

  while (messageQueue.length > 0) {
    const msg = messageQueue.shift()!;
    await deadDropSender(msg.content, msg.user);
  }

  isProcessing = false;

  // Resolve flush promise if waiting
  if (flushResolve && messageQueue.length === 0) {
    flushResolve();
    flushResolve = null;
  }
}

/**
 * Flush all pending deaddrop sends
 * Call before process.exit to ensure all messages are sent
 */
export async function flushDeadDrop(): Promise<void> {
  if (messageQueue.length === 0 && !isProcessing) return;

  return new Promise<void>((resolve) => {
    flushResolve = resolve;
    // If not already processing, start
    if (!isProcessing) {
      void processQueue();
    }
  });
}

/**
 * Send a message to deaddrop if configured
 */
function sendToDeadDrop(message: string, user: DeadDropUser): void {
  if (deadDropSender) {
    messageQueue.push({ content: message, user });
    void processQueue();
  }
}

/**
 * Print a [RUNNER] operational message with timestamp
 * Automatically sends to Deaddrop if configured (without prefix)
 */
export function printRunner(message: string): void {
  console.log(
    `${timestampPrefix()}${colors.magenta}[RUNNER]${colors.reset} ${message}`
  );
  sendToDeadDrop(stripAnsi(message), 'Runner');
}

/**
 * Print a [RUNNER] informational message with timestamp
 * Does NOT send to Deaddrop (used for startup config, debug info)
 */
export function printRunnerInfo(message: string): void {
  console.log(
    `${timestampPrefix()}${colors.magenta}[RUNNER]${colors.reset} ${message}`
  );
}

/**
 * Print a [CLAUDE] message with timestamp
 * Automatically sends to Deaddrop if configured (without prefix)
 */
export function printClaude(message: string): void {
  console.log(
    `${timestampPrefix()}${colors.green}[CLAUDE]${colors.reset} ${message}`
  );
  sendToDeadDrop(stripAnsi(message), 'Claude Code');
}
