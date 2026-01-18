/**
 * Rill Script Runner
 *
 * Executes .rill scripts using the Rill parser and runtime,
 * integrated with the existing Claude runner infrastructure.
 */

import type { RillValue, RuntimeCallbacks } from '@rcrsr/rill';
import { execute, parse } from '@rcrsr/rill';
import * as fs from 'fs';

import { colors, printRunner } from '../output/colors.js';
import type { FormatterState } from '../output/formatter.js';
import type { Logger } from '../output/logger.js';
import { detectRunnerSignal } from '../parsers/signals.js';
import { spawnClaude } from '../process/pty.js';
import { parseFrontmatter } from '../templates/command.js';
import type { RunnerConfig, RunnerSignal } from '../types/runner.js';
import { createRunnerContext, type ExecutionResult } from './context.js';

// ============================================================
// TYPES
// ============================================================

export interface RillRunnerOptions {
  /** Path to .rill script file */
  scriptFile: string;
  /** Script arguments */
  args: string[];
  /** Runner configuration */
  config: RunnerConfig;
  /** Logger instance */
  logger: Logger;
  /** Formatter state for output */
  formatterState: FormatterState;
  /** Working directory */
  cwd: string;
  /** Run ID for logging */
  runId: string;
}

export interface RillRunResult {
  /** Whether the script completed successfully */
  success: boolean;
  /** Last output from Claude (for capture) */
  lastOutput: string;
  /** Final signal detected (if any) */
  signal: RunnerSignal | null;
}

/** Parsed argument definition from frontmatter */
export interface RillArgDef {
  name: string;
  type: 'string' | 'number' | 'bool';
  required: boolean;
  defaultValue?: string | number | boolean | undefined;
}

export interface RillScriptMeta {
  /** Model from frontmatter */
  model?: string | undefined;
  /** Description from frontmatter */
  description?: string | undefined;
  /** Named argument definitions */
  args?: RillArgDef[] | undefined;
}

// ============================================================
// SCRIPT LOADING
// ============================================================

/**
 * Parse args definition from frontmatter
 * Format: "file: string, retries: number = 3"
 */
function parseArgsDefinition(argsStr: string): RillArgDef[] {
  if (!argsStr.trim()) return [];

  const defs: RillArgDef[] = [];
  // Split by comma, but handle potential commas in default values
  const parts = argsStr.split(/,(?![^[]*])/).map((s) => s.trim());

  for (const part of parts) {
    if (!part) continue;

    // Pattern: name: type or name: type = default
    const match = /^(\w+)\s*:\s*(string|number|bool)(?:\s*=\s*(.+))?$/.exec(
      part
    );
    if (!match) {
      throw new Error(`Invalid arg definition: ${part}`);
    }

    const [, name, type, defaultStr] = match;
    if (!name || !type) continue;

    const def: RillArgDef = {
      name,
      type: type as 'string' | 'number' | 'bool',
      required: defaultStr === undefined,
    };

    // Parse default value
    if (defaultStr !== undefined) {
      const trimmed = defaultStr.trim();
      if (type === 'number') {
        def.defaultValue = Number(trimmed);
      } else if (type === 'bool') {
        def.defaultValue = trimmed === 'true';
      } else {
        // String - remove quotes if present
        def.defaultValue = trimmed.replace(/^["']|["']$/g, '');
      }
    }

    defs.push(def);
  }

  return defs;
}

/**
 * Load a .rill script file, extracting frontmatter and body
 */
export function loadRillScript(scriptFile: string): {
  source: string;
  meta: RillScriptMeta;
} {
  if (!fs.existsSync(scriptFile)) {
    throw new Error(`Script not found: ${scriptFile}`);
  }

  const content = fs.readFileSync(scriptFile, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  // Parse args definition if present
  let argsDefs: RillArgDef[] | undefined;
  if (frontmatter.args) {
    argsDefs = parseArgsDefinition(frontmatter.args);
  }

  return {
    source: body,
    meta: {
      model: frontmatter.model,
      description: frontmatter.description,
      args: argsDefs,
    },
  };
}

// ============================================================
// RUNNER
// ============================================================

/**
 * Execute a Rill script
 */
export async function runRillScript(
  options: RillRunnerOptions
): Promise<RillRunResult> {
  const { scriptFile, args, config, logger, formatterState, cwd, runId } =
    options;

  // Load and parse script
  const { source, meta } = loadRillScript(scriptFile);

  // Use frontmatter model if no CLI override
  const effectiveModel = config.model ?? meta.model ?? null;

  // Map CLI args to named variables based on frontmatter definition
  const namedArgs: Record<string, string | number | boolean> = {};
  if (meta.args) {
    for (let i = 0; i < meta.args.length; i++) {
      const argDef = meta.args[i];
      if (!argDef) continue;

      const cliValue = args[i];
      if (cliValue !== undefined) {
        // Convert CLI string to appropriate type
        if (argDef.type === 'number') {
          namedArgs[argDef.name] = Number(cliValue);
        } else if (argDef.type === 'bool') {
          namedArgs[argDef.name] = cliValue === 'true';
        } else {
          namedArgs[argDef.name] = cliValue;
        }
      } else if (argDef.defaultValue !== undefined) {
        namedArgs[argDef.name] = argDef.defaultValue;
      } else if (argDef.required) {
        throw new Error(`Missing required argument: ${argDef.name}`);
      }
    }
  }

  // Parse the Rill script
  const ast = parse(source);

  // Track execution state (use object to allow mutation in closures)
  const state = {
    lastOutput: '',
    lastSignal: null as RunnerSignal | null,
    stepNum: 0,
  };

  // Create Claude executor that uses the existing infrastructure
  const executeClause = async (
    prompt: string,
    model?: string
  ): Promise<ExecutionResult> => {
    state.stepNum++;
    formatterState.currentStep = state.stepNum;
    formatterState.stepStartTime = Date.now();

    // Log step start
    const preview = prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt;
    logger.logEvent({
      event: 'step_start',
      step: state.stepNum,
      prompt: preview,
    });

    if (config.verbosity !== 'quiet') {
      printRunner(`Running step ${state.stepNum}: "${preview}"`);
    }

    // Execute via existing PTY infrastructure
    const result = await spawnClaude({
      prompt,
      cwd,
      verbosity: config.verbosity,
      logger,
      formatterState,
      parallelThresholdMs: config.parallelThresholdMs,
      model: model ?? effectiveModel,
    });

    // Detect signal from output
    const signal = detectRunnerSignal(result.claudeText);

    // Log completion
    logger.logEvent({
      event: 'step_complete',
      step: state.stepNum,
      exit: result.exitCode,
      signal: signal ?? undefined,
    });

    // Handle signals
    if (signal === 'blocked') {
      printRunner(
        `${colors.red}Blocked${colors.reset} at step ${state.stepNum}`
      );
    } else if (signal === 'error') {
      printRunner(`${colors.red}Error${colors.reset} at step ${state.stepNum}`);
    } else if (signal === 'repeat_step') {
      printRunner(`Step ${state.stepNum} requests repeat`);
    }

    return {
      output: result.claudeText,
      signal,
      exitCode: result.exitCode,
    };
  };

  // Create shell executor
  const executeShell = async (command: string): Promise<string> => {
    const { execSync } = await import('child_process');
    try {
      return execSync(command, { encoding: 'utf-8', cwd });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Shell command failed: ${msg}`);
    }
  };

  // Signal handler
  const onSignal = (signal: RunnerSignal, output: string): void => {
    state.lastSignal = signal;
    state.lastOutput = output;
  };

  // Logging callback
  const callbacks: Partial<RuntimeCallbacks> = {
    onLog: (value: RillValue) => {
      const text = formatValue(value);
      printRunner(text);
      logger.log(`[LOG] ${text}`);
    },
  };

  // Create Rill runtime context
  const ctx = createRunnerContext({
    executeClause,
    executeShell,
    namedArgs,
    rawArgs: args,
    env: process.env as Record<string, string>,
    commandsDir: '.claude/commands',
    defaultModel: effectiveModel ?? undefined,
    callbacks,
    onSignal,
  });

  // Execute the script
  try {
    logger.logEvent({ event: 'rill_script_start', runId, file: scriptFile });

    const result = await execute(ast, ctx);

    // Update last output from final result
    if (result.value !== null) {
      state.lastOutput = formatValue(result.value);
    }

    logger.logEvent({
      event: 'rill_script_complete',
      runId,
      success: true,
      signal: state.lastSignal ?? undefined,
    });

    // Success if no blocking signal
    const success =
      state.lastSignal !== 'blocked' && state.lastSignal !== 'error';
    return {
      success,
      lastOutput: state.lastOutput,
      signal: state.lastSignal,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    printRunner(`${colors.red}Script error:${colors.reset} ${msg}`);
    logger.logEvent({ event: 'rill_script_error', runId, error: msg });
    return { success: false, lastOutput: state.lastOutput, signal: 'error' };
  }
}

// ============================================================
// UTILITIES
// ============================================================

function formatValue(value: RillValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

// ============================================================
// DETECTION
// ============================================================

/**
 * Check if a file is a Rill script
 */
export function isRillScript(filename: string): boolean {
  return filename.endsWith('.rill');
}
