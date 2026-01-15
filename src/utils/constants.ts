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
/** Truncation length for Grep pattern display */
export const TRUNCATE_GREP_PATTERN = 30;
/** Truncation length for Task description */
export const TRUNCATE_TASK_DESC = 40;
/** Truncation length for Bash command display */
export const TRUNCATE_BASH_CMD = 50;
/** Truncation length for preview text */
export const TRUNCATE_PREVIEW = 50;
/** Truncation length for unknown tool JSON */
export const TRUNCATE_TOOL_JSON = 60;
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

// === Default Configuration ===
/** Default max iterations before stopping */
export const DEFAULT_MAX_ITERATIONS = 10;
/** Default parallel tool detection threshold in ms */
export const DEFAULT_PARALLEL_THRESHOLD_MS = 100;
/** Default pause between iterations in ms */
export const DEFAULT_ITERATION_PAUSE_MS = 2000;
