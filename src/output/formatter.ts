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
  colors,
  formatDuration,
  printRunner,
  shortenPath,
  timestampPrefix,
  truncate,
} from './colors.js';
import type { Logger } from './logger.js';

/**
 * State for tracking parallel tool calls and active tasks
 */
export interface FormatterState {
  pendingTools: PendingTool[];
  lastToolTime: number | null;
  activeTask: ActiveTask | null;
  toolStartTimes: Map<string, number>;
}

export function createFormatterState(): FormatterState {
  return {
    pendingTools: [],
    lastToolTime: null,
    activeTask: null,
    toolStartTimes: new Map(),
  };
}

export function resetFormatterState(state: FormatterState): void {
  state.pendingTools = [];
  state.lastToolTime = null;
  state.activeTask = null;
  state.toolStartTimes.clear();
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
  const indent = inTask ? '  │ ' : '';
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
    summary = `"${truncate((input['pattern'] as string | undefined) ?? '', 30)}"`;
  } else if (name === 'Bash') {
    summary = truncate((input['command'] as string | undefined) ?? '', 50);
  } else if (name === 'Task') {
    const taskType = (input['subagent_type'] as string | undefined) ?? 'agent';
    const taskDesc = truncate(
      (input['description'] as string | undefined) ??
        (input['prompt'] as string | undefined) ??
        '',
      40
    );
    summary = `${colors.magenta}${taskType}${colors.reset}: ${taskDesc}`;

    // Mark task as active and print task header
    state.activeTask = { name: taskType, description: taskDesc, id: tool.id };
    console.log(
      `${timestampPrefix()}${colors.yellow}[TASK]${colors.reset} ${colors.magenta}${taskType}${colors.reset} ${taskDesc}`
    );
    console.log(
      `${timestampPrefix()}  ${colors.dim}┌─────────────────────────────────────────────────${colors.reset}`
    );
    return;
  } else if (name === 'Write' || name === 'Edit') {
    summary = shortenPath((input['file_path'] as string | undefined) ?? '');
  } else {
    summary = truncate(JSON.stringify(input), 60);
  }

  console.log(`${prefix}${colors.cyan}${name}${colors.reset} ${summary}`);
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
    console.log(
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
  const indent = inTask ? '  │ ' : '';

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

  const maxLines = 10;
  const showLines = lines.slice(0, maxLines);
  for (const line of showLines) {
    console.log(
      `${timestampPrefix()}${indent}  ${colors.dim}${truncate(line, 150)}${colors.reset}`
    );
  }
  if (lines.length > maxLines) {
    console.log(
      `${timestampPrefix()}${indent}  ${colors.dim}... (${lines.length - maxLines} more lines)${colors.reset}${durationStr}`
    );
  } else if (durationStr) {
    console.log(`${timestampPrefix()}${indent}  ${durationStr}`);
  }
}

/**
 * Print a task result
 */
function printTaskResult(
  result: ToolResultBlock,
  durationStr: string,
  verbosity: Verbosity,
  state: FormatterState
): void {
  const content =
    typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

  // Close the task visual box with duration
  console.log(
    `${timestampPrefix()}  ${colors.dim}└─────────────────────────────────────────────────${colors.reset}${durationStr}`
  );

  // Extract the text part of task result, skip agentId line
  const lines = content
    .split('\n')
    .filter((l) => l.trim() && !l.includes('agentId:'));

  // Show task result summary
  if (lines.length > 0) {
    const maxLen = verbosity === 'verbose' ? 500 : 200;
    const summary = lines.join(' ').replace(/\s+/g, ' ');
    console.log(
      `${timestampPrefix()}  ${colors.green}→ ${truncate(summary, maxLen)}${colors.reset}`
    );
  }

  // Clear active task
  state.activeTask = null;
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

    for (const block of msg.message.content) {
      if (isTextBlock(block)) {
        claudeText += block.text + '\n';

        if (verbosity === 'quiet') {
          // Show answers but not thinking/status updates
          if (
            !block.text.startsWith("I'll ") &&
            !block.text.startsWith('Let me ')
          ) {
            const text = block.text.replace(/[\r\n]+/g, ' ').trim();
            console.log(
              `${timestampPrefix()}${colors.green}[ANSWER]${colors.reset} ${truncate(text, 500)}`
            );
          }
        } else {
          const text = block.text.replace(/[\r\n]+/g, ' ').trim();
          console.log(
            `${timestampPrefix()}${colors.green}[CLAUDE]${colors.reset} ${text}`
          );
        }
      } else if (isToolUseBlock(block)) {
        const now = Date.now();
        // Record start time
        state.toolStartTimes.set(block.id, now);

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
          console.log(
            `${timestampPrefix()}  ${colors.red}ERROR: ${truncate(content, 100)}${colors.reset}${durationStr}`
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
    if (verbosity !== 'quiet') {
      const duration = msg.duration_ms
        ? `${(msg.duration_ms / 1000).toFixed(1)}s`
        : '?';
      printRunner(`Claude completed step in ${duration}`);
    }
  } else {
    if (verbosity === 'verbose') {
      console.log(
        `${timestampPrefix()}${colors.dim}[${msg.type.toUpperCase()}] ${truncate(JSON.stringify(msg), 100)}${colors.reset}`
      );
    }
  }

  return claudeText;
}
