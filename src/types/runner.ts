/**
 * Runner configuration and state types
 */

import { DEFAULT_PARALLEL_THRESHOLD_MS } from '../utils/constants.js';

export type Verbosity = 'quiet' | 'normal' | 'verbose';

export type Subcommand = 'prompt' | 'command' | 'script';

/**
 * Result of running a single Claude invocation
 */
export interface RunResult {
  exitCode: number;
  duration: number;
  claudeText: string;
}

/**
 * Runner configuration
 */
export interface RunnerConfig {
  verbosity: Verbosity;
  enableLog: boolean;
  logDir: string;
  parallelThresholdMs: number;
  model: string | null;
  deaddrop: boolean;
}

/**
 * Default runner configuration
 */
export const DEFAULT_CONFIG: RunnerConfig = {
  verbosity: 'normal',
  enableLog: false,
  logDir: 'logs',
  parallelThresholdMs: DEFAULT_PARALLEL_THRESHOLD_MS,
  model: null,
  deaddrop: false,
};

/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
  subcommand: Subcommand;
  prompt: string;
  displayCommand: string;
  config: Partial<RunnerConfig>;
  /** Script file path (for script subcommand) */
  scriptFile: string | null;
  /** Script arguments */
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
