/**
 * Shared mock factories for tests
 */

import { vi } from 'vitest';

import type { FormatterState } from '../../src/output/formatter.js';
import type { Logger } from '../../src/output/logger.js';
import { createRunStats } from '../../src/output/stats.js';
import type {
  AssistantMessage,
  ResultMessage,
  SystemInitMessage,
  UserMessage,
} from '../../src/types/claude.js';
import type { RunnerConfig } from '../../src/types/runner.js';
import { DEFAULT_INACTIVITY_TIMEOUT_MS } from '../../src/utils/constants.js';

/**
 * Read one argument of a recorded mock call as a string.
 * Throws when the call is missing or the argument is not a string, so the test fails clearly.
 */
export function callArg(call: readonly unknown[] | undefined, index = 0): string {
  const value = call?.[index];
  if (typeof value !== 'string') {
    throw new TypeError(`Expected string mock-call argument ${index}, got ${typeof value}`);
  }
  return value;
}

/**
 * Create a mock logger
 */
export function createMockLogger(): Logger {
  return {
    log: vi.fn(),
    logEvent: vi.fn(),
    close: vi.fn(),
    filePath: null,
  };
}

/**
 * Create a default formatter state
 */
export function createMockFormatterState(): FormatterState {
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

/**
 * Create a mock runner config with optional overrides
 */
export function createMockConfig(overrides?: Partial<RunnerConfig>): RunnerConfig {
  return {
    verbosity: 'normal',
    enableLog: false,
    logDir: 'logs',
    parallelThresholdMs: 100,
    model: null,
    effort: null,
    deaddrop: false,
    inactivityTimeoutMs: DEFAULT_INACTIVITY_TIMEOUT_MS,
    ...overrides,
  };
}

/**
 * Create a SystemInitMessage
 */
export function createSystemInitMessage(
  model = 'claude-3',
  tools: string[] = ['Read', 'Write', 'Bash']
): SystemInitMessage {
  return {
    type: 'system',
    subtype: 'init',
    model,
    tools,
  };
}

/**
 * Create an AssistantMessage with a text block
 */
export function createTextMessage(text: string): AssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  };
}

/**
 * Create an AssistantMessage with a tool use block
 */
export function createToolUseMessage(
  name: string,
  input: Record<string, unknown>,
  id = 'tool-1'
): AssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id, name, input }],
    },
  };
}

/**
 * Create a UserMessage with a tool result block
 */
export function createToolResultMessage(
  toolUseId: string,
  content: string,
  isError = false
): UserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
          is_error: isError,
        },
      ],
    },
  };
}

/**
 * Create a ResultMessage
 */
export function createResultMessage(durationMs = 5000): ResultMessage {
  return {
    type: 'result',
    duration_ms: durationMs,
  };
}
