/**
 * Runner configuration and state types
 */

export type Verbosity = 'quiet' | 'normal' | 'verbose';

export type Subcommand = 'prompt' | 'command' | 'script';

/**
 * Runner signals for iteration control
 * Claude outputs these to control the runner loop
 */
export type RunnerSignal = 'done' | 'continue' | 'blocked' | 'error';

export const RUNNER_SIGNALS = {
  DONE: ':::RUNNER::DONE:::',
  CONTINUE: ':::RUNNER::CONTINUE:::',
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
 * Runner configuration
 */
export interface RunnerConfig {
  verbosity: Verbosity;
  enableLog: boolean;
  logDir: string;
  maxIterations: number;
  parallelThresholdMs: number;
  iterationPauseMs: number;
}

/**
 * Default runner configuration
 */
export const DEFAULT_CONFIG: RunnerConfig = {
  verbosity: 'normal',
  enableLog: true,
  logDir: 'logs',
  maxIterations: 10,
  parallelThresholdMs: 100,
  iterationPauseMs: 2000,
};

/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
  subcommand: Subcommand;
  prompt: string;
  scriptLines: string[];
  scriptMode: boolean;
  config: Partial<RunnerConfig>;
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
