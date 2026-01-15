/**
 * Console output formatting for tool calls and messages
 */

import {
  type ClaudeMessage,
  isAssistantMessage,
  isResultMessage,
  isSystemInitMessage,
  isTextBlock,
  isToolResultBlock,
  isToolUseBlock,
  isUserMessage,
  type ToolResultBlock,
} from '../types/claude.js';
import {
  type ActiveTask,
  NOISE_PATTERNS,
  type PendingTool,
  type Verbosity,
} from '../types/runner.js';
import {
  MAX_RESULT_LINES,
  TRUNCATE_ANSWER,
  TRUNCATE_BASH_CMD,
  TRUNCATE_ERROR,
  TRUNCATE_GREP_PATTERN,
  TRUNCATE_MESSAGE,
  TRUNCATE_TASK_DESC,
  TRUNCATE_TERMINAL_LINE,
  TRUNCATE_TOOL_JSON,
  TRUNCATE_VERBOSE_LINE,
} from '../utils/constants.js';
import {
  colors,
  formatDuration,
  printClaude,
  printRunner,
  shortenPath,
  terminalLog,
  timestampPrefix,
  truncate,
} from './colors.js';
import type { Logger } from './logger.js';
import {
  createRunStats,
  formatStatsSummary,
  incrementMessageCount,
  mergeStats,
  recordOutput,
  recordToolUse,
  resetRunStats,
  type RunStats,
  updateTokenStats,
} from './stats.js';

/**
 * State for tracking parallel tool calls and active tasks
 */
export interface FormatterState {
  pendingTools: PendingTool[];
  lastToolTime: number | null;
  activeTask: ActiveTask | null;
  toolStartTimes: Map<string, number>;
  currentStep: number;
  /** When true, step completion is not printed (caller handles it) */
  suppressStepCompletion: boolean;
  /** Duration from last result message (for caller to use) */
  lastStepDurationMs: number | null;
  /** Run statistics for current step */
  stats: RunStats;
  /** Overall run statistics (accumulated across steps) */
  runStats: RunStats;
  /** Step start time */
  stepStartTime: number | null;
  /** Task statistics (for nested task tracking) */
  taskStats: RunStats | null;
  /** Task start time */
  taskStartTime: number | null;
}

export function createFormatterState(): FormatterState {
  return {
    pendingTools: [],
    lastToolTime: null,
    activeTask: null,
    toolStartTimes: new Map(),
    currentStep: 1,
    suppressStepCompletion: true,
    lastStepDurationMs: null,
    stats: createRunStats(),
    runStats: createRunStats(),
    stepStartTime: null,
    taskStats: null,
    taskStartTime: null,
  };
}

export function resetFormatterState(state: FormatterState): void {
  state.pendingTools = [];
  state.lastToolTime = null;
  state.activeTask = null;
  state.toolStartTimes.clear();
  resetRunStats(state.stats);
  state.stepStartTime = null;
  state.taskStats = null;
  state.taskStartTime = null;
  // Note: runStats is NOT reset - it accumulates across steps
}

/**
 * Finalize step stats: merge into runStats and return step summary
 */
export function finalizeStepStats(
  state: FormatterState,
  stepDurationMs: number
): string {
  // Merge step stats into run stats
  mergeStats(state.runStats, state.stats);
  // Format and return the step summary
  return formatStatsSummary(state.stats, stepDurationMs);
}

/**
 * Get the overall run stats summary
 */
export function getRunStatsSummary(
  state: FormatterState,
  runDurationMs: number
): string {
  return formatStatsSummary(state.runStats, runDurationMs);
}

/**
 * Check if a line contains noise patterns (node_modules, venv, etc.)
 */
function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(text));
}

/**
 * Filter noise lines from output
 */
function filterNoiseLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isNoise(line))
    .join('\n');
}

/**
 * Format a single tool use for display
 */
function formatToolUse(
  tool: PendingTool,
  indented: boolean,
  state: FormatterState
): void {
  const inTask = state.activeTask !== null;
  const indent = inTask ? '│' : '';
  const prefix = indented
    ? `${timestampPrefix()}${indent}  → `
    : `${timestampPrefix()}${indent}${colors.yellow}[TOOL]${colors.reset} `;
  const name = tool.name;
  const input = tool.input;

  let summary = '';
  if (name === 'Read') {
    summary = shortenPath((input['file_path'] as string | undefined) ?? '');
  } else if (name === 'Glob') {
    summary = (input['pattern'] as string | undefined) ?? '';
  } else if (name === 'Grep') {
    summary = `"${truncate((input['pattern'] as string | undefined) ?? '', TRUNCATE_GREP_PATTERN)}"`;
  } else if (name === 'Bash') {
    summary = truncate(
      (input['command'] as string | undefined) ?? '',
      TRUNCATE_BASH_CMD
    );
  } else if (name === 'Task') {
    const taskType = (input['subagent_type'] as string | undefined) ?? 'agent';
    const taskDesc = truncate(
      (input['description'] as string | undefined) ??
        (input['prompt'] as string | undefined) ??
        '',
      TRUNCATE_TASK_DESC
    );
    summary = `${colors.magenta}${taskType}${colors.reset}: ${taskDesc}`;

    // Mark task as active and print task header (no divider)
    state.activeTask = { name: taskType, description: taskDesc, id: tool.id };
    // Initialize task stats tracking
    state.taskStats = createRunStats();
    state.taskStartTime = Date.now();
    terminalLog(
      `${timestampPrefix()}${colors.yellow}[TASK]${colors.reset} ${colors.magenta}${taskType}${colors.reset} ${taskDesc}`
    );
    return;
  } else if (name === 'Write' || name === 'Edit') {
    summary = shortenPath((input['file_path'] as string | undefined) ?? '');
  } else {
    summary = truncate(JSON.stringify(input), TRUNCATE_TOOL_JSON);
  }

  terminalLog(`${prefix}${colors.cyan}${name}${colors.reset} ${summary}`);
}

/**
 * Flush pending tools, grouping parallel calls
 */
export function flushPendingTools(
  state: FormatterState,
  verbosity: Verbosity
): void {
  if (state.pendingTools.length === 0) {
    return;
  }

  if (verbosity === 'quiet') {
    state.pendingTools = [];
    return;
  }

  const firstTool = state.pendingTools[0];
  if (state.pendingTools.length === 1 && firstTool) {
    formatToolUse(firstTool, false, state);
  } else {
    // Group parallel tools
    terminalLog(
      `${timestampPrefix()}${colors.yellow}[TOOL ×${state.pendingTools.length}]${colors.reset} ${colors.dim}(parallel)${colors.reset}`
    );
    for (const tool of state.pendingTools) {
      formatToolUse(tool, true, state);
    }
  }
  state.pendingTools = [];
}

/**
 * Print a tool result
 */
function printToolResult(
  result: ToolResultBlock,
  durationStr: string,
  verbosity: Verbosity,
  state: FormatterState
): void {
  if (verbosity === 'quiet') {
    return;
  }

  const inTask = state.activeTask !== null;
  const indent = inTask ? '│' : '';

  if (verbosity === 'normal') {
    // In normal mode, suppress per-tool timing
    return;
  }

  // Verbose only: show detailed results
  const content =
    typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);
  const filtered = filterNoiseLines(content);
  const lines = filtered.split('\n').filter((l) => l.trim());

  const showLines = lines.slice(0, MAX_RESULT_LINES);
  for (const line of showLines) {
    terminalLog(
      `${timestampPrefix()}${indent} ${colors.dim}${truncate(line, TRUNCATE_VERBOSE_LINE)}${colors.reset}`
    );
  }
  if (lines.length > MAX_RESULT_LINES) {
    terminalLog(
      `${timestampPrefix()}${indent} ${colors.dim}... (${lines.length - MAX_RESULT_LINES} more lines)${colors.reset}${durationStr}`
    );
  } else if (durationStr) {
    terminalLog(`${timestampPrefix()}${indent} ${durationStr}`);
  }
}

/**
 * Print a task result
 */
function printTaskResult(
  _result: ToolResultBlock,
  _durationStr: string,
  _verbosity: Verbosity,
  state: FormatterState
): void {
  // Calculate task duration and format stats summary
  const taskDuration = state.taskStartTime
    ? Date.now() - state.taskStartTime
    : 0;
  const statsSummary = state.taskStats
    ? formatStatsSummary(state.taskStats, taskDuration)
    : formatDuration(taskDuration);

  // Print task completion with stats
  terminalLog(
    `${timestampPrefix()}└─${colors.yellow}[TASK]${colors.reset} Complete: ${statsSummary}`
  );

  // Clear active task and stats
  state.activeTask = null;
  state.taskStats = null;
  state.taskStartTime = null;
}

/**
 * Format and display a Claude message
 * Returns collected Claude text for signal detection
 */
export function formatMessage(
  msg: ClaudeMessage,
  state: FormatterState,
  verbosity: Verbosity,
  _logger: Logger, // Reserved for future verbose logging
  parallelThresholdMs: number
): string {
  let claudeText = '';

  if (isSystemInitMessage(msg)) {
    // Skip init messages - config is shown by runner
  } else if (isAssistantMessage(msg)) {
    flushPendingTools(state, verbosity);

    // Track message and token usage in stats
    const stats = state.taskStats ?? state.stats;
    incrementMessageCount(stats);
    if (msg.message.usage) {
      updateTokenStats(stats, msg.message.usage);
    }

    for (const block of msg.message.content) {
      if (isTextBlock(block)) {
        claudeText += block.text + '\n';
        // Track output characters for token estimation
        recordOutput(stats, block.text.length);

        if (verbosity === 'quiet') {
          // Show answers but not thinking/status updates
          if (
            !block.text.startsWith("I'll ") &&
            !block.text.startsWith('Let me ')
          ) {
            const displayText = block.text.replace(/[\r\n]+/g, ' ').trim();
            terminalLog(
              `${timestampPrefix()}${colors.green}[ANSWER]${colors.reset} ${truncate(displayText, TRUNCATE_ANSWER)}`
            );
          }
        } else {
          const displayText = block.text.replace(/[\r\n]+/g, ' ').trim();
          printClaude(
            truncate(displayText, TRUNCATE_TERMINAL_LINE),
            block.text
          );
        }
      } else if (isToolUseBlock(block)) {
        const now = Date.now();
        // Record start time
        state.toolStartTimes.set(block.id, now);
        // Track tool use in stats
        recordToolUse(stats, block.name);

        if (
          state.lastToolTime &&
          now - state.lastToolTime < parallelThresholdMs
        ) {
          // Part of parallel batch
          state.pendingTools.push({
            name: block.name,
            input: block.input,
            id: block.id,
          });
        } else {
          // New batch
          flushPendingTools(state, verbosity);
          state.pendingTools.push({
            name: block.name,
            input: block.input,
            id: block.id,
          });
        }
        state.lastToolTime = now;
      }
    }
  } else if (isUserMessage(msg)) {
    flushPendingTools(state, verbosity);

    for (const block of msg.message.content) {
      if (isToolResultBlock(block)) {
        const toolUseId = block.tool_use_id;
        const content =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);

        // Calculate duration
        let durationStr = '';
        const startTime = state.toolStartTimes.get(toolUseId);
        if (startTime !== undefined) {
          const elapsed = Date.now() - startTime;
          durationStr = ` ${colors.dim}(${formatDuration(elapsed)})${colors.reset}`;
          state.toolStartTimes.delete(toolUseId);
        }

        // Check for tool errors
        const isError =
          content.startsWith('<tool_use_error>') ||
          content.startsWith('Error:') ||
          content.startsWith('error:');

        if (isError) {
          const inTask = state.activeTask !== null;
          const indent = inTask ? '│' : '';
          // Strip <tool_use_error> tags for cleaner display
          const cleanError = content.replace(/<\/?tool_use_error>/g, '').trim();
          terminalLog(
            `${timestampPrefix()}${indent} ${colors.red}ERROR: ${truncate(cleanError, TRUNCATE_ERROR)}${colors.reset}${durationStr}`
          );
        } else if (state.activeTask?.id === toolUseId) {
          // Task completing
          printTaskResult(block, durationStr, verbosity, state);
        } else {
          printToolResult(block, durationStr, verbosity, state);
        }
      }
    }
  } else if (isResultMessage(msg)) {
    flushPendingTools(state, verbosity);
    state.lastStepDurationMs = msg.duration_ms ?? null;
    if (!state.suppressStepCompletion && verbosity !== 'quiet') {
      const duration = msg.duration_ms ? formatDuration(msg.duration_ms) : '?';
      printRunner(`Completed step ${state.currentStep} in ${duration}`);
    }
  } else {
    if (verbosity === 'verbose') {
      terminalLog(
        `${timestampPrefix()}${colors.dim}[${msg.type.toUpperCase()}] ${truncate(JSON.stringify(msg), TRUNCATE_MESSAGE)}${colors.reset}`
      );
    }
  }

  return claudeText;
}
