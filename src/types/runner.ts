/**
 * Runner configuration and state types
 */

import {
  DEFAULT_INACTIVITY_TIMEOUT_MS,
  DEFAULT_PARALLEL_THRESHOLD_MS,
} from '../utils/constants.js';

export type Verbosity = 'quiet' | 'normal' | 'verbose';

export type Subcommand = 'prompt' | 'command' | 'script' | 'skill' | 'docs';

/**
 * Result of running a single Claude invocation
 */
export interface RunResult {
  exitCode: number;
  duration: number;
  claudeText: string;
  /** True when the process was killed due to inactivity timeout */
  timedOut?: boolean;
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
  effort: string | null;
  deaddrop: boolean;
  /** Inactivity timeout in ms — kills the process when no output is received */
  inactivityTimeoutMs: number;
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
  effort: null,
  deaddrop: false,
  inactivityTimeoutMs: DEFAULT_INACTIVITY_TIMEOUT_MS,
};

/**
 * Docs subcommand options
 */
export interface DocsOptions {
  functionsOnly: boolean;
  languageOnly: boolean;
}

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
  /** Docs options (for docs subcommand) */
  docsOptions?: DocsOptions | undefined;
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
  /** Index for agent marker color (0-7, cycles) */
  colorIndex: number;
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
