/**
 * Claude Code Runner - Rill Runtime Context
 * Provides prompt, command, and exec functions for orchestrating Claude workflows
 */

import {
  type CallableFn,
  createRuntimeContext,
  type RillValue,
  type RuntimeCallbacks,
  type RuntimeContext,
} from '@rcrsr/rill';
import * as fs from 'fs';
import * as path from 'path';

import { printRunner } from '../output/colors.js';
import { parseFrontmatter } from '../templates/command.js';
import { RUNNER_SIGNALS, type RunnerSignal } from '../types/runner.js';

// ============================================================
// TYPES
// ============================================================

/** Result of executing a prompt or command */
export interface ExecutionResult {
  /** Output text from Claude */
  output: string;
  /** Detected signal (if any) */
  signal: RunnerSignal | null;
  /** Exit code from Claude CLI */
  exitCode: number;
}

/** Function to execute Claude CLI */
export type ClaudeExecutor = (
  prompt: string,
  model?: string
) => Promise<ExecutionResult>;

/** Function to execute shell commands */
export type ShellExecutor = (command: string) => Promise<string>;

/** Options for creating runner context */
export interface RunnerContextOptions {
  /** Execute Claude CLI */
  executeClause: ClaudeExecutor;
  /** Execute shell command */
  executeShell?: ShellExecutor | undefined;
  /** Named variables (mapped from CLI args by caller) */
  namedArgs?: Record<string, RillValue> | undefined;
  /** Raw CLI args tuple ($ARGS) */
  rawArgs?: string[] | undefined;
  /** Environment variables ($ENV) */
  env?: Record<string, string> | undefined;
  /** Commands directory (for command() function) */
  commandsDir?: string | undefined;
  /** Default model for prompts */
  defaultModel?: string | undefined;
  /** Logging callbacks */
  callbacks?: Partial<RuntimeCallbacks> | undefined;
  /** Callback when signal detected */
  onSignal?: ((signal: RunnerSignal, output: string) => void) | undefined;
}

// ============================================================
// SIGNAL DETECTION
// ============================================================

function detectSignal(text: string): RunnerSignal | null {
  if (text.includes(RUNNER_SIGNALS.REPEAT_STEP)) {
    return 'repeat_step';
  }
  if (text.includes(RUNNER_SIGNALS.BLOCKED)) {
    return 'blocked';
  }
  if (text.includes(RUNNER_SIGNALS.ERROR)) {
    return 'error';
  }
  return null;
}

// ============================================================
// COMMAND LOADING
// ============================================================

interface CommandTemplate {
  content: string;
  model?: string | undefined;
}

function loadCommandTemplate(
  name: string,
  commandsDir: string
): CommandTemplate {
  const filePath = path.join(commandsDir, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Command not found: ${name} (looked in ${filePath})`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    content: body,
    model: frontmatter.model,
  };
}

function substituteArgs(template: string, args: RillValue[]): string {
  let result = template;

  // Substitute positional args: $1, $2, etc.
  for (let i = 0; i < args.length; i++) {
    const value = formatValue(args[i] ?? null);
    result = result.replace(new RegExp(`\\$${i + 1}`, 'g'), value);
  }

  // Substitute $ARGUMENTS with all args joined
  result = result.replace(/\$ARGUMENTS/g, args.map(formatValue).join(' '));

  // Remove unmatched $N placeholders
  result = result.replace(/\$\d+/g, '');

  return result;
}

function formatValue(value: RillValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

// ============================================================
// RUNTIME CONTEXT FACTORY
// ============================================================

/**
 * Create a Rill runtime context for Claude Code Runner workflows
 */
export function createRunnerContext(
  options: RunnerContextOptions
): RuntimeContext {
  const {
    executeClause,
    executeShell,
    namedArgs = {},
    rawArgs = [],
    env = process.env as Record<string, string>,
    commandsDir = '.claude/commands',
    defaultModel,
    callbacks = {},
    onSignal,
  } = options;

  // Track last signal for control flow
  let lastSignal: RunnerSignal | null = null;

  // Built-in functions for runner
  const functions: Record<string, CallableFn> = {
    /**
     * Execute a prompt with Claude
     * Usage: "analyze this code" -> prompt
     */
    prompt: async (args: RillValue[]) => {
      const text = formatValue(args[0] ?? null);
      const model = typeof args[1] === 'string' ? args[1] : defaultModel;

      const result = await executeClause(text, model);
      lastSignal = result.signal;

      if (result.signal && onSignal) {
        onSignal(result.signal, result.output);
      }

      return result.output;
    },

    /**
     * Execute a command template
     * Usage: "create-spec" -> command  OR  command("create-spec", $arg1, $arg2)
     */
    command: async (args: RillValue[], ctx) => {
      const name = formatValue(args[0] ?? null);
      const cmdArgs = args.slice(1);

      const template = loadCommandTemplate(name, commandsDir);
      const promptText = substituteArgs(template.content, cmdArgs);
      const model = template.model ?? defaultModel;

      const result = await executeClause(promptText, model);
      lastSignal = result.signal;

      if (result.signal && onSignal) {
        onSignal(result.signal, result.output);
      }

      // Update pipe value
      ctx.pipeValue = result.output;

      return result.output;
    },

    /**
     * Execute a shell command
     * Usage: "npm test" -> exec
     */
    exec: async (args: RillValue[]) => {
      if (!executeShell) {
        throw new Error('Shell execution not configured');
      }

      const cmd = formatValue(args[0] ?? null);
      return executeShell(cmd);
    },

    /**
     * Get the last detected signal
     * Usage: signal() -> ?(.eq("repeat_step")) { ... }
     */
    signal: () => lastSignal,

    /**
     * Clear the last signal
     */
    clearSignal: () => {
      lastSignal = null;
      return null;
    },

    /**
     * Check if last execution should repeat
     */
    shouldRepeat: () => lastSignal === 'repeat_step',

    /**
     * Check if last execution was blocked
     */
    isBlocked: () => lastSignal === 'blocked',

    /**
     * Check if last execution had an error
     */
    hasError: () => lastSignal === 'error',

    /**
     * Pause execution (placeholder - actual implementation in runner)
     */
    pause: (args: RillValue[]) => {
      const message = formatValue(args[0] ?? 'Paused');
      // The actual pause behavior is handled by the runner
      return `[PAUSE] ${message}`;
    },

    /**
     * Stop execution with error
     */
    error: (args: RillValue[]) => {
      const message = formatValue(args[0] ?? 'Error');
      throw new Error(message);
    },
  };

  // Create initial variables
  const variables: Record<string, RillValue> = {
    ARGS: rawArgs,
    ENV: env,
    ...namedArgs,
  };

  return createRuntimeContext({
    variables,
    functions,
    callbacks: {
      onLog:
        callbacks.onLog ??
        ((v) => {
          printRunner(formatValue(v));
        }),
    },
  });
}

// ============================================================
// EXPORTS
// ============================================================

export { detectSignal };
