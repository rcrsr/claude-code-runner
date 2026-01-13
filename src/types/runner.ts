/**
 * Runner configuration and state types
 */

import {
  DEFAULT_ITERATION_PAUSE_MS,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_PARALLEL_THRESHOLD_MS,
} from '../utils/constants.js';

export type Verbosity = 'quiet' | 'normal' | 'verbose';

export type Subcommand = 'prompt' | 'command' | 'script';

/**
 * Runner signals for iteration control
 * Claude outputs these to control the runner loop
 */
export type RunnerSignal = 'repeat_step' | 'blocked' | 'error';

export const RUNNER_SIGNALS = {
  REPEAT_STEP: ':::RUNNER::REPEAT_STEP:::',
  BLOCKED: ':::RUNNER::BLOCKED:::',
  ERROR: ':::RUNNER::ERROR:::',
} as const;

/**
 * Result of running a single Claude invocation
 */
export interface RunResult {
  exitCode: number;
  duration: number;
  claudeText: string;
}

/**
 * Result of running with signal support (may involve multiple iterations)
 */
export type SignalResult = 'ok' | 'blocked' | 'error';

/**
 * Extended result from runWithSignals including output text
 */
export interface SignalRunResult {
  status: SignalResult;
  claudeText: string;
}

/**
 * Runner configuration
 */
export interface RunnerConfig {
  verbosity: Verbosity;
  enableLog: boolean;
  logDir: string;
  maxIterations: number;
  parallelThresholdMs: number;
  iterationPauseMs: number;
  model: string | null;
  deaddrop: boolean;
}

/**
 * Default runner configuration
 */
export const DEFAULT_CONFIG: RunnerConfig = {
  verbosity: 'normal',
  enableLog: true,
  logDir: 'logs',
  maxIterations: DEFAULT_MAX_ITERATIONS,
  parallelThresholdMs: DEFAULT_PARALLEL_THRESHOLD_MS,
  iterationPauseMs: DEFAULT_ITERATION_PAUSE_MS,
  model: null,
  deaddrop: false,
};

/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
  subcommand: Subcommand;
  prompt: string;
  displayCommand: string; // Original command for display (e.g., "command increment /tmp/counter.txt 3")
  /** Display strings for script lines (for logging) */
  scriptLines: string[];
  scriptMode: boolean;
  config: Partial<RunnerConfig>;
  /** Script file path (when scriptMode is true) */
  scriptFile: string | null;
  /** Script arguments (passed to script file for variable substitution) */
  scriptArgs: string[];
}

/**
 * Tool call tracking
 */
export interface PendingTool {
  name: string;
  input: Record<string, unknown>;
  id: string;
}

/**
 * Active task (subagent) tracking
 */
export interface ActiveTask {
  name: string;
  description: string;
  id: string;
}

/**
 * Noise patterns to filter from output
 */
export const NOISE_PATTERNS: RegExp[] = [
  /\.venv\//,
  /node_modules\//,
  /\.pnpm\//,
  /__pycache__\//,
  /\.pyc$/,
];
