/**
 * Centralized constants for the runner codebase
 * Replaces magic numbers with descriptive names
 */

// === Size Thresholds ===
/** Threshold for displaying size in K (1000 chars) */
export const SIZE_THRESHOLD_K = 1000;
/** Threshold for displaying size in M (1000000 chars) */
export const SIZE_THRESHOLD_M = 1000000;

// === Display Limits ===
/** Maximum lines shown in tool result output */
export const MAX_RESULT_LINES = 10;
/** Truncation length for Task description */
export const TRUNCATE_TASK_DESC = 40;
/** Truncation length for preview text */
export const TRUNCATE_PREVIEW = 50;
/** Truncation length for error messages */
export const TRUNCATE_ERROR = 100;
/** Truncation length for generic messages */
export const TRUNCATE_MESSAGE = 100;
/** Truncation length for verbose tool result lines */
export const TRUNCATE_VERBOSE_LINE = 150;
/** Truncation length for terminal output lines (Claude messages, runner messages) */
export const TRUNCATE_TERMINAL_LINE = 150;
/** Truncation length for normal task result summary */
export const TRUNCATE_TASK_SUMMARY = 200;
/** Truncation length for quiet mode answer display */
export const TRUNCATE_ANSWER = 500;
/** Truncation length for verbose task result summary */
export const TRUNCATE_TASK_VERBOSE = 500;
/** Minimum width for tool summary display (floor when terminal is narrow) */
export const TOOL_SUMMARY_MIN_WIDTH = 40;
/** Fallback display width when stdout is not a TTY */
export const DISPLAY_FALLBACK_WIDTH = 120;

// === PTY Configuration ===
/** Terminal column width */
export const PTY_COLS = 200;
/** Terminal row count */
export const PTY_ROWS = 50;

// === Time Constants ===
/** Milliseconds per second */
export const MS_PER_SECOND = 1000;
/** Seconds per minute */
export const SECONDS_PER_MINUTE = 60;
/** Seconds per hour */
export const SECONDS_PER_HOUR = 3600;
/** Default inactivity timeout in ms (10 minutes) — kills the process when no output is received */
export const DEFAULT_INACTIVITY_TIMEOUT_MS = 600_000;

// === Default Configuration ===
/** Default parallel tool detection threshold in ms */
export const DEFAULT_PARALLEL_THRESHOLD_MS = 100;

// === Context Tracking ===
/** Default context window in tokens when the model is unknown (200k) */
export const CONTEXT_WINDOW_DEFAULT_TOKENS = 200_000;
/** Context window in tokens for 1M-context models */
export const CONTEXT_WINDOW_1M_TOKENS = 1_000_000;
/**
 * Model families with a 1M-token context window, matched by shortened model
 * name prefix (see shortModelName). All other models use the 200k default.
 * Verified against platform.claude.com/docs/en/about-claude/models/overview
 * (July 2026): Fable 5, Mythos 5, Opus 5/4.8/4.7/4.6, and Sonnet 5/4.6 are 1M;
 * Haiku 4.5, Sonnet 4.5, Opus 4.5/4.1 and older are 200k.
 */
export const CONTEXT_WINDOW_1M_MODEL_PREFIXES = [
  'fable-5',
  'mythos-5',
  'mythos-preview',
  'opus-5',
  'opus-4-8',
  'opus-4-7',
  'opus-4-6',
  'sonnet-5',
  'sonnet-4-6',
] as const;

// === Status Line ===
/** Interval in ms for re-rendering the status line timer */
export const STATUS_TIMER_INTERVAL_MS = 250;
/** Truncation suffix for overflow in status line */
export const STATUS_LINE_ELLIPSIS = '...';
/** Minimum terminal width for status line display */
export const STATUS_LINE_MIN_WIDTH = 20;

// === Result XML Patterns ===
/** Regex pattern for self-closing ccr:result tags */
export const CCR_RESULT_SELF_CLOSING_PATTERN = /<ccr:result\s+([^>]*?)\/>/;
/** Regex pattern for ccr:result tags with content */
export const CCR_RESULT_WITH_CONTENT_PATTERN =
  /<ccr:result\s+([^>]*[^>/])>([\s\S]*?)<\/ccr:result>/;
