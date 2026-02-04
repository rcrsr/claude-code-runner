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
  TRUNCATE_BASH_CMD,
  TRUNCATE_ERROR,
  TRUNCATE_GREP_PATTERN,
  TRUNCATE_MESSAGE,
  TRUNCATE_TASK_DESC,
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
  /** Multiple active tasks keyed by tool_use_id */
  activeTasks: Map<string, ActiveTask>;
  /** Maps tool_use_id to parent task id for attribution */
  toolToTaskId: Map<string, string>;
  /** Counter for generating task labels (A, B, C...) */
  nextLabelIndex: number;
  /** Most recently started task id (for tool attribution) */
  currentTaskId: string | null;
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
  /** Task statistics keyed by task id */
  taskStatsMap: Map<string, RunStats>;
  /** Task start times keyed by task id */
  taskStartTimes: Map<string, number>;
}

export function createFormatterState(): FormatterState {
  return {
    pendingTools: [],
    lastToolTime: null,
    activeTasks: new Map(),
    toolToTaskId: new Map(),
    nextLabelIndex: 0,
    currentTaskId: null,
    toolStartTimes: new Map(),
    currentStep: 1,
    suppressStepCompletion: true,
    lastStepDurationMs: null,
    stats: createRunStats(),
    runStats: createRunStats(),
    stepStartTime: null,
    taskStatsMap: new Map(),
    taskStartTimes: new Map(),
  };
}

export function resetFormatterState(state: FormatterState): void {
  state.pendingTools = [];
  state.lastToolTime = null;
  state.activeTasks.clear();
  state.toolToTaskId.clear();
  state.nextLabelIndex = 0;
  state.currentTaskId = null;
  state.toolStartTimes.clear();
  resetRunStats(state.stats);
  state.stepStartTime = null;
  state.taskStatsMap.clear();
  state.taskStartTimes.clear();
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
 * Get task label for a tool, or empty string if not in a task
 */
/**
 * Get task label for a tool, or empty string if not in a task
 */
function getToolTaskLabel(toolId: string, state: FormatterState): string {
  const taskId = state.toolToTaskId.get(toolId);
  if (!taskId) return '';
  const task = state.activeTasks.get(taskId);
  return task?.label ?? '';
}

/**
 * Format a task label with color
 */
function formatTaskLabel(label: string): string {
  return `${colors.magenta}${label}${colors.reset}`;
}

/**
 * Format a single tool use for display
 */
function formatToolUse(
  tool: PendingTool,
  indented: boolean,
  state: FormatterState
): void {
  const taskLabel = getToolTaskLabel(tool.id, state);
  const inTask = taskLabel !== '';
  const labelPrefix = inTask ? `│${formatTaskLabel(taskLabel)} ` : '';
  const prefix = indented
    ? `${timestampPrefix()}${labelPrefix} → `
    : `${timestampPrefix()}${labelPrefix}`;
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
    const cmd = ((input['command'] as string | undefined) ?? '').replace(
      /[\r\n]+/g,
      ' '
    );
    summary = truncate(cmd, TRUNCATE_BASH_CMD);
  } else if (name === 'Task') {
    // Task state already initialized in pre-scan, just print header
    const task = state.activeTasks.get(tool.id);
    if (task) {
      terminalLog(
        `${timestampPrefix()}${colors.yellow}[${task.name}]${colors.reset} ${formatTaskLabel(task.label)}: ${task.description}`
      );
    }
    return;
  } else if (name === 'Write' || name === 'Edit') {
    summary = shortenPath((input['file_path'] as string | undefined) ?? '');
  } else {
    summary = truncate(JSON.stringify(input), TRUNCATE_TOOL_JSON);
  }

  const nameDisplay = indented
    ? `${colors.cyan}${name}${colors.reset}`
    : `${colors.blue}[${name}]${colors.reset}`;
  terminalLog(`${prefix}${nameDisplay} ${summary}`);
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
      `${timestampPrefix()}${colors.blue}[×${state.pendingTools.length}]${colors.reset} ${colors.dim}(parallel)${colors.reset}`
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

  // Get task label for this tool's result
  const taskLabel = getToolTaskLabel(result.tool_use_id, state);
  const indent = taskLabel ? `│${formatTaskLabel(taskLabel)}` : '';

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
 * Print a task result and clean up task state
 */
function printTaskResult(
  taskId: string,
  _verbosity: Verbosity,
  state: FormatterState
): void {
  const task = state.activeTasks.get(taskId);
  if (!task) return;

  // Calculate task duration and format stats summary
  const taskStartTime = state.taskStartTimes.get(taskId);
  const taskDuration = taskStartTime ? Date.now() - taskStartTime : 0;
  const taskStats = state.taskStatsMap.get(taskId);
  const statsSummary = taskStats
    ? formatStatsSummary(taskStats, taskDuration)
    : formatDuration(taskDuration);

  // Print task completion with label
  terminalLog(
    `${timestampPrefix()}└─${formatTaskLabel(task.label)} ${colors.yellow}[${task.name}]${colors.reset} Complete: ${statsSummary}`
  );

  // Merge task stats into step stats before clearing
  if (taskStats) {
    mergeStats(state.stats, taskStats);
  }

  // Clean up this task's state
  state.activeTasks.delete(taskId);
  state.taskStatsMap.delete(taskId);
  state.taskStartTimes.delete(taskId);

  // Update currentTaskId if this was the current task
  if (state.currentTaskId === taskId) {
    // Set to another active task if any, otherwise null
    const remaining = Array.from(state.activeTasks.keys());
    state.currentTaskId = remaining.length > 0 ? (remaining[0] ?? null) : null;
  }
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

    // Check for Task tools first to initialize task tracking
    for (const block of msg.message.content) {
      if (isToolUseBlock(block) && block.name === 'Task') {
        const input = block.input;
        const taskType =
          (input['subagent_type'] as string | undefined) ?? 'agent';
        const taskDesc = truncate(
          (input['description'] as string | undefined) ??
            (input['prompt'] as string | undefined) ??
            '',
          TRUNCATE_TASK_DESC
        );
        // Generate label (A, B, C, ...)
        const label = String.fromCharCode(65 + state.nextLabelIndex);
        state.nextLabelIndex++;

        const task: ActiveTask = {
          name: taskType,
          description: taskDesc,
          id: block.id,
          label,
        };
        state.activeTasks.set(block.id, task);
        state.taskStatsMap.set(block.id, createRunStats());
        state.taskStartTimes.set(block.id, Date.now());
        state.currentTaskId = block.id;
      }
    }

    // Track message and token usage in stats (use current task's stats if in a task)
    const currentTaskStats = state.currentTaskId
      ? state.taskStatsMap.get(state.currentTaskId)
      : null;
    const stats = currentTaskStats ?? state.stats;
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
              `${timestampPrefix()}${colors.green}[answer]${colors.reset} ${displayText}`
            );
          }
        } else {
          const displayText = block.text.replace(/[\r\n]+/g, ' ').trim();
          printClaude(displayText, block.text);
        }
      } else if (isToolUseBlock(block)) {
        const now = Date.now();
        // Record start time
        state.toolStartTimes.set(block.id, now);

        // Attribute non-Task tools to the current task
        if (block.name !== 'Task' && state.currentTaskId) {
          state.toolToTaskId.set(block.id, state.currentTaskId);
          // Track tool use in current task's stats
          const taskStats = state.taskStatsMap.get(state.currentTaskId);
          if (taskStats) {
            recordToolUse(taskStats, block.name);
          }
        } else if (block.name !== 'Task') {
          recordToolUse(stats, block.name);
        }

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

    // Track usage from task results (tool_use_result has aggregated stats)
    if (msg.tool_use_result?.usage) {
      const taskStats = state.currentTaskId
        ? state.taskStatsMap.get(state.currentTaskId)
        : null;
      updateTokenStats(taskStats ?? state.stats, msg.tool_use_result.usage);
    }

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
          const taskLabel = getToolTaskLabel(toolUseId, state);
          const indent = taskLabel ? `│${formatTaskLabel(taskLabel)}` : '';
          // Strip <tool_use_error> tags for cleaner display
          const cleanError = content.replace(/<\/?tool_use_error>/g, '').trim();
          terminalLog(
            `${timestampPrefix()}${indent} ${colors.red}ERROR: ${truncate(cleanError, TRUNCATE_ERROR)}${colors.reset}${durationStr}`
          );
        } else if (state.activeTasks.has(toolUseId)) {
          // Task completing
          printTaskResult(toolUseId, verbosity, state);
        } else {
          printToolResult(block, durationStr, verbosity, state);
        }
      }
    }
  } else if (isResultMessage(msg)) {
    flushPendingTools(state, verbosity);

    // Track usage from result message
    if (msg.usage) {
      const taskStats = state.currentTaskId
        ? state.taskStatsMap.get(state.currentTaskId)
        : null;
      updateTokenStats(taskStats ?? state.stats, msg.usage);
    }

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
