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
  agentMarker,
  colors,
  formatDuration,
  hashAgentId,
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
  /** Queue of task IDs ready to act (just received a tool result) */
  taskReadyQueue: string[];
  /** Queue of task IDs awaiting first action (in creation order) */
  taskPendingQueue: string[];
  /** Current state text from ccr::state() */
  currentStatusText: string | null;
  /** Called after each processed message; used for state persistence */
  onUpdate?: () => void;
  /** Accumulated active runtime in ms (excludes crash gaps) */
  elapsedMs: number;
  /** Timestamp of last onUpdate tick (for computing deltas) */
  lastTickTime: number | null;
}

export function createFormatterState(): FormatterState {
  return {
    pendingTools: [],
    lastToolTime: null,
    activeTasks: new Map(),
    toolToTaskId: new Map(),
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
    taskReadyQueue: [],
    taskPendingQueue: [],
    currentStatusText: null,
    elapsedMs: 0,
    lastTickTime: null,
  };
}

export function resetFormatterState(state: FormatterState): void {
  state.pendingTools = [];
  state.lastToolTime = null;
  state.activeTasks.clear();
  state.toolToTaskId.clear();
  state.currentTaskId = null;
  state.toolStartTimes.clear();
  resetRunStats(state.stats);
  state.stepStartTime = null;
  state.taskStatsMap.clear();
  state.taskStartTimes.clear();
  state.taskReadyQueue = [];
  state.taskPendingQueue = [];
  // Note: currentStatusText is NOT reset - it persists across steps (set by ccr::state)
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
  runDurationMs: number,
  activeMs?: number
): string {
  return formatStatsSummary(state.runStats, runDurationMs, activeMs);
}

/**
 * Active runtime as of `now`: accumulated ticks plus the delta since the
 * last tick. Excludes gaps where the process was not running (crash/resume).
 */
export function getActiveElapsedMs(state: FormatterState, now: number): number {
  return (
    state.elapsedMs +
    (state.lastTickTime !== null ? now - state.lastTickTime : 0)
  );
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
 * Get task color index for a tool, or -1 if not in a task
 */
function getToolTaskColorIndex(toolId: string, state: FormatterState): number {
  const taskId = state.toolToTaskId.get(toolId);
  if (!taskId) return -1;
  const task = state.activeTasks.get(taskId);
  return task?.colorIndex ?? -1;
}

/**
 * Format a task marker (colored dot)
 */
function formatTaskMarker(colorIndex: number): string {
  return agentMarker(colorIndex);
}

/**
 * Format a single tool use for display
 */
function formatToolUse(
  tool: PendingTool,
  indented: boolean,
  state: FormatterState
): void {
  const colorIndex = getToolTaskColorIndex(tool.id, state);
  const inTask = colorIndex >= 0;
  const labelPrefix = inTask ? `${formatTaskMarker(colorIndex)} ` : '';
  const prefix = indented
    ? `${timestampPrefix()}${labelPrefix} → `
    : `${timestampPrefix()}${labelPrefix}`;
  const name = tool.name;
  const input = tool.input;

  let summary: string;
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
  } else if (name === 'Task' || name === 'Agent') {
    // Task state already initialized in pre-scan, just print header
    const task = state.activeTasks.get(tool.id);
    if (task) {
      terminalLog(
        `${timestampPrefix()}${formatTaskMarker(task.colorIndex)} ${colors.yellow}[${task.name}]${colors.reset} ${task.description}`
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

  // Get task marker for this tool's result
  const colorIndex = getToolTaskColorIndex(result.tool_use_id, state);
  const indent = colorIndex >= 0 ? `${formatTaskMarker(colorIndex)} ` : '';

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

  // Print task completion with marker
  terminalLog(
    `${timestampPrefix()}${formatTaskMarker(task.colorIndex)} ${colors.yellow}[${task.name}]${colors.reset} Complete ${statsSummary}`
  );

  // Merge task stats into step stats before clearing
  if (taskStats) {
    mergeStats(state.stats, taskStats);
  }

  // Clean up this task's state
  state.activeTasks.delete(taskId);
  state.taskStatsMap.delete(taskId);
  state.taskStartTimes.delete(taskId);
  state.taskReadyQueue = state.taskReadyQueue.filter((id) => id !== taskId);
  state.taskPendingQueue = state.taskPendingQueue.filter((id) => id !== taskId);

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
    const preTaskCount = state.activeTasks.size;
    for (const block of msg.message.content) {
      if (
        isToolUseBlock(block) &&
        (block.name === 'Task' || block.name === 'Agent')
      ) {
        const input = block.input;
        const taskType =
          (input['subagent_type'] as string | undefined) ?? 'agent';
        const taskDesc = truncate(
          (input['description'] as string | undefined) ??
            (input['prompt'] as string | undefined) ??
            '',
          TRUNCATE_TASK_DESC
        );
        // Assign stable color from agent ID hash
        const colorIndex = hashAgentId(block.id);

        const task: ActiveTask = {
          name: taskType,
          description: taskDesc,
          id: block.id,
          colorIndex,
        };
        state.activeTasks.set(block.id, task);
        state.taskStatsMap.set(block.id, createRunStats());
        state.taskStartTimes.set(block.id, Date.now());
        state.currentTaskId = block.id;
        state.taskPendingQueue.push(block.id);
      }
    }
    const createdTasks = state.activeTasks.size > preTaskCount;

    // Determine message-level task attribution for non-Task tools
    // Each assistant message comes from one agent context
    let messageTaskId: string | null = null;
    if (!createdTasks && state.activeTasks.size > 1) {
      // Multiple concurrent tasks: use queue-based attribution
      // Ready queue = tasks that just got a tool result (conversation continues)
      // Pending queue = tasks awaiting their first action (creation order)
      const candidateId =
        state.taskReadyQueue.shift() ?? state.taskPendingQueue.shift() ?? null;
      if (candidateId && state.activeTasks.has(candidateId)) {
        messageTaskId = candidateId;
      }
    } else if (state.activeTasks.size === 1 && state.currentTaskId) {
      messageTaskId = state.currentTaskId;
    }

    // Track message and token usage in stats
    const statsTaskId = messageTaskId ?? state.currentTaskId;
    const currentTaskStats = statsTaskId
      ? state.taskStatsMap.get(statsTaskId)
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

        // Attribute non-Task/Agent tools using message-level task attribution
        if (block.name !== 'Task' && block.name !== 'Agent' && messageTaskId) {
          state.toolToTaskId.set(block.id, messageTaskId);
          // Track tool use in attributed task's stats
          const taskStats = state.taskStatsMap.get(messageTaskId);
          if (taskStats) {
            recordToolUse(taskStats, block.name);
          }
        } else if (block.name !== 'Task' && block.name !== 'Agent') {
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
          const colorIndex = getToolTaskColorIndex(toolUseId, state);
          const indent =
            colorIndex >= 0 ? `${formatTaskMarker(colorIndex)} ` : '';
          // Strip <tool_use_error> tags for cleaner display
          const cleanError = content
            .replace(/<\/?tool_use_error>/g, '')
            .replace(/[\r\n]+/g, ' ')
            .trim();
          terminalLog(
            `${timestampPrefix()}${indent}${colors.red}[error]${colors.reset} ${truncate(cleanError, TRUNCATE_ERROR)}`
          );

          // Queue parent task for next attribution (conversation continues after error)
          const parentTaskId = state.toolToTaskId.get(toolUseId);
          if (
            parentTaskId &&
            state.activeTasks.has(parentTaskId) &&
            !state.taskReadyQueue.includes(parentTaskId)
          ) {
            state.taskReadyQueue.push(parentTaskId);
          }
        } else if (state.activeTasks.has(toolUseId)) {
          // Task completing
          printTaskResult(toolUseId, verbosity, state);
        } else {
          printToolResult(block, durationStr, verbosity, state);

          // Queue parent task for next attribution (conversation continues)
          const parentTaskId = state.toolToTaskId.get(toolUseId);
          if (
            parentTaskId &&
            state.activeTasks.has(parentTaskId) &&
            !state.taskReadyQueue.includes(parentTaskId)
          ) {
            state.taskReadyQueue.push(parentTaskId);
          }
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

  state.onUpdate?.();
  return claudeText;
}
