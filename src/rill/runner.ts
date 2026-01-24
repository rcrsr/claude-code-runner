/**
 * Rill Script Runner
 *
 * Executes .rill scripts using the Rill parser and runtime,
 * integrated with the existing Claude runner infrastructure.
 */

import type { RillValue, RuntimeCallbacks } from '@rcrsr/rill';
import {
  AbortError,
  execute,
  parse,
  ParseError,
  RuntimeError,
  TimeoutError,
} from '@rcrsr/rill';
import * as fs from 'fs';

import { colors, printRunner } from '../output/colors.js';
import { finalizeStepStats, type FormatterState } from '../output/formatter.js';
import type { Logger } from '../output/logger.js';
import { spawnClaude } from '../process/pty.js';
import { parseFrontmatter } from '../templates/command.js';
import type { RunnerConfig } from '../types/runner.js';
import { formatRillValue } from '../utils/formatting.js';
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

    // Finalize step stats (merge into runStats for final summary)
    const stepDurationMs = formatterState.stepStartTime
      ? Date.now() - formatterState.stepStartTime
      : 0;
    finalizeStepStats(formatterState, stepDurationMs);

    // Log completion
    logger.logEvent({
      event: 'step_complete',
      step: state.stepNum,
      exit: result.exitCode,
    });

    return {
      output: result.claudeText,
      exitCode: result.exitCode,
    };
  };

  // Logging callback
  const callbacks: Partial<RuntimeCallbacks> = {
    onLog: (value: RillValue) => {
      const text = formatRillValue(value);
      printRunner(text);
      logger.log(`[LOG] ${text}`);
    },
  };

  // Create Rill runtime context
  const ctx = createRunnerContext({
    executeClause,
    namedArgs,
    rawArgs: args,
    env: process.env as Record<string, string>,
    commandsDir: '.claude/commands',
    defaultModel: effectiveModel ?? undefined,
    callbacks,
  });

  // Execute the script
  try {
    logger.logEvent({ event: 'rill_script_start', runId, file: scriptFile });

    const result = await execute(ast, ctx);

    // Update last output from final result
    if (result.value !== null) {
      state.lastOutput = formatRillValue(result.value);
    }

    logger.logEvent({
      event: 'rill_script_complete',
      runId,
      success: true,
    });

    return {
      success: true,
      lastOutput: state.lastOutput,
    };
  } catch (error) {
    // Handle specific Rill error types
    if (error instanceof AbortError) {
      printRunner(`${colors.yellow}Script cancelled${colors.reset}`);
      logger.logEvent({ event: 'rill_script_cancelled', runId });
      return {
        success: false,
        lastOutput: state.lastOutput,
      };
    }

    if (error instanceof TimeoutError) {
      const msg = `Timeout: ${error.message}`;
      printRunner(`${colors.red}${msg}${colors.reset}`);
      logger.logEvent({ event: 'rill_script_timeout', runId, error: msg });
      return { success: false, lastOutput: state.lastOutput };
    }

    if (error instanceof ParseError) {
      const location = error.location
        ? ` at line ${error.location.line}:${error.location.column}`
        : '';
      const msg = `Parse error${location}: ${error.message}`;
      printRunner(`${colors.red}${msg}${colors.reset}`);
      logger.logEvent({ event: 'rill_script_parse_error', runId, error: msg });
      return { success: false, lastOutput: state.lastOutput };
    }

    if (error instanceof RuntimeError) {
      const location = error.location
        ? ` at line ${error.location.line}:${error.location.column}`
        : '';
      const msg = `Runtime error${location}: ${error.message}`;
      printRunner(`${colors.red}${msg}${colors.reset}`);
      logger.logEvent({
        event: 'rill_script_runtime_error',
        runId,
        error: msg,
      });
      return { success: false, lastOutput: state.lastOutput };
    }

    // Generic error fallback
    const msg = error instanceof Error ? error.message : String(error);
    printRunner(`${colors.red}Script error:${colors.reset} ${msg}`);
    logger.logEvent({ event: 'rill_script_error', runId, error: msg });
    return { success: false, lastOutput: state.lastOutput };
  }
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
