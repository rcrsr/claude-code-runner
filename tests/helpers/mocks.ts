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
import type {
  RunnerConfig,
  RunResult,
  Verbosity,
} from '../../src/types/runner.js';

/**
 * Create a mock logger
 */
export function createMockLogger(): Logger {
  return {
    log: vi.fn(),
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

/**
 * Create a mock runner config with optional overrides
 */
export function createMockConfig(
  overrides?: Partial<RunnerConfig>
): RunnerConfig {
  return {
    verbosity: 'normal',
    enableLog: false,
    logDir: 'logs',
    maxIterations: 10,
    parallelThresholdMs: 100,
    iterationPauseMs: 0,
    model: null,
    ...overrides,
  };
}

/**
 * Create a mock RunResult
 */
export function createMockRunResult(overrides?: Partial<RunResult>): RunResult {
  return {
    exitCode: 0,
    duration: 5,
    claudeText: '',
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

/**
 * Create an AssistantMessage with multiple tool use blocks
 */
export function createMultiToolMessage(
  tools: { name: string; input: Record<string, unknown>; id: string }[]
): AssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: tools.map((t) => ({
        type: 'tool_use' as const,
        id: t.id,
        name: t.name,
        input: t.input,
      })),
    },
  };
}

/**
 * Create a mock verbosity setting
 */
export function createVerbosity(level: Verbosity = 'normal'): Verbosity {
  return level;
}
