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

import {
  bindFormatterState,
  clearStatusLine,
  colors,
  printRunner,
  renderStatusLine,
  statusDisplayText,
  unbindFormatterState,
} from '../output/colors.js';
import { finalizeStepStats, type FormatterState } from '../output/formatter.js';
import type { Logger } from '../output/logger.js';
import { spawnClaude } from '../process/pty.js';
import { parseFrontmatter } from '../templates/command.js';
import type { RunnerConfig } from '../types/runner.js';
import { STATUS_TIMER_INTERVAL_MS } from '../utils/constants.js';
import { formatRillValue } from '../utils/formatting.js';
import {
  createRunnerContext,
  type ExecutionResult,
  type InvocationContext,
} from './context.js';

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
 * Load a .rill script file, extracting metadata from frontmatter
 * Returns full content (Rill parser handles frontmatter natively)
 */
export function loadRillScript(scriptFile: string): {
  source: string;
  meta: RillScriptMeta;
} {
  if (!fs.existsSync(scriptFile)) {
    throw new Error(`Script not found: ${scriptFile}`);
  }

  const content = fs.readFileSync(scriptFile, 'utf-8');

  // Extract frontmatter metadata for our use (model, args)
  // Rill parser will handle the full content including frontmatter
  const { frontmatter } = parseFrontmatter(content);

  // Parse args definition if present
  let argsDefs: RillArgDef[] | undefined;
  if (frontmatter.args) {
    argsDefs = parseArgsDefinition(frontmatter.args);
  }

  return {
    source: content, // Pass full content - Rill handles frontmatter
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

  // Track execution state (use object to allow mutation in closures)
  const state = {
    lastOutput: '',
    stepNum: 0,
  };

  // Create Claude executor that uses the existing infrastructure
  const executeClause = async (
    prompt: string,
    model?: string,
    invocation?: InvocationContext
  ): Promise<ExecutionResult> => {
    state.stepNum++;
    formatterState.currentStep = state.stepNum;
    formatterState.stepStartTime = Date.now();

    // Log step start
    const preview = prompt.replace(/[\r\n]+/g, ' ').trim();
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
      inactivityTimeoutMs: invocation?.timeoutMs ?? config.inactivityTimeoutMs,
    });

    // Finalize step stats (merge into runStats for final summary)
    const stepDurationMs = formatterState.stepStartTime
      ? Date.now() - formatterState.stepStartTime
      : 0;
    finalizeStepStats(formatterState, stepDurationMs);

    if (result.timedOut) {
      // Build timeout result tag with invocation details (exclude internal timeoutMs)
      const { timeoutMs: _, ...reportFields } = invocation ?? {
        method: 'ccr::prompt',
      };
      const escapeXml = (s: string): string =>
        s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      const attrsStr = Object.entries(reportFields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
        .join(' ');
      const timeoutTag = `<ccr:result type="timeout"${attrsStr ? ` ${attrsStr}` : ''}/>`;

      const effectiveTimeoutMs =
        invocation?.timeoutMs ?? config.inactivityTimeoutMs;
      logger.logEvent({
        event: 'step_timeout',
        step: state.stepNum,
        ...reportFields,
      });

      printRunner(
        `${colors.red}Step ${state.stepNum} timed out (no output for ${Math.round(effectiveTimeoutMs / 60_000)}m)${colors.reset}`
      );

      return { output: timeoutTag, exitCode: 1 };
    }

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

  // Interval handle for periodic status line re-renders
  let statusInterval: NodeJS.Timeout | null = null;

  const clearStatusInterval = (): void => {
    if (statusInterval !== null) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
  };

  // State change callback for ccr::state host function
  const onStateChange = (text: string | null): void => {
    // Update formatter state
    formatterState.currentStatusText = text;

    // Skip rendering in quiet mode
    if (config.verbosity === 'quiet') {
      return;
    }

    // Render or clear status line
    if (text !== null) {
      renderStatusLine(
        statusDisplayText(formatterState) ?? text,
        process.stderr
      );
      // Start interval to keep the elapsed timer ticking
      statusInterval ??= setInterval(() => {
        if (formatterState.currentStatusText !== null) {
          renderStatusLine(statusDisplayText(formatterState), process.stderr);
        }
      }, STATUS_TIMER_INTERVAL_MS);
    } else {
      if (statusInterval !== null) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
      clearStatusLine(process.stderr);
    }
  };

  // Terminal resize handler - re-renders status line with updated columns
  const handleResize = (): void => {
    if (formatterState.currentStatusText !== null) {
      renderStatusLine(statusDisplayText(formatterState), process.stderr);
    }
  };

  // Attach resize listener if not in quiet mode
  if (config.verbosity !== 'quiet') {
    process.stderr.on('resize', handleResize);
  }

  // Create Rill runtime context — wrap in try/catch so setup errors include the script filename
  let ctx: ReturnType<typeof createRunnerContext>;
  try {
    ctx = createRunnerContext({
      executeClause,
      namedArgs,
      rawArgs: args,
      env: process.env as Record<string, string>,
      commandsDir: '.claude/commands',
      defaultModel: effectiveModel ?? undefined,
      callbacks,
      onStateChange,
    });

    // Bind formatter state so terminalLog re-renders the status line
    bindFormatterState(formatterState);
  } catch (setupError) {
    // Clean up before re-throwing
    unbindFormatterState();
    if (config.verbosity !== 'quiet') {
      process.stderr.off('resize', handleResize);
      clearStatusInterval();
    }
    const msg =
      setupError instanceof Error ? setupError.message : String(setupError);
    throw new Error(`Script setup failed for ${scriptFile}: ${msg}`);
  }

  // Parse and execute the script
  try {
    logger.logEvent({ event: 'rill_script_start', runId, file: scriptFile });

    // Parse the Rill script inside try/catch to handle parse errors
    const ast = parse(source);
    const result = await execute(ast, ctx);

    // Update last output from final result
    if (result.result !== null) {
      state.lastOutput = formatRillValue(result.result);
    }

    logger.logEvent({
      event: 'rill_script_complete',
      runId,
      success: true,
    });

    // Remove resize listener and unbind state before exit
    unbindFormatterState();
    if (config.verbosity !== 'quiet') {
      process.stderr.off('resize', handleResize);
      clearStatusInterval();
      clearStatusLine(process.stderr);
    }

    return {
      success: true,
      lastOutput: state.lastOutput,
    };
  } catch (error) {
    // Remove resize listener and unbind state before error handling
    unbindFormatterState();
    if (config.verbosity !== 'quiet') {
      process.stderr.off('resize', handleResize);
    }

    // Handle specific Rill error types
    if (error instanceof AbortError) {
      if (config.verbosity !== 'quiet') {
        clearStatusInterval();
        clearStatusLine(process.stderr);
      }
      printRunner(`${colors.yellow}Script cancelled${colors.reset}`);
      logger.logEvent({ event: 'rill_script_cancelled', runId });
      return {
        success: false,
        lastOutput: state.lastOutput,
      };
    }

    if (error instanceof TimeoutError) {
      if (config.verbosity !== 'quiet') {
        clearStatusInterval();
        clearStatusLine(process.stderr);
      }
      const msg = `Timeout: ${error.message}`;
      printRunner(`${colors.red}${msg}${colors.reset}`);
      logger.logEvent({ event: 'rill_script_timeout', runId, error: msg });
      return { success: false, lastOutput: state.lastOutput };
    }

    if (error instanceof ParseError) {
      if (config.verbosity !== 'quiet') {
        clearStatusInterval();
        clearStatusLine(process.stderr);
      }
      const location = error.location
        ? ` at ${scriptFile}:${error.location.line}:${error.location.column}`
        : '';
      const msg = `Parse error${location}: ${error.toString()}`;
      printRunner(`${colors.red}${msg}${colors.reset}`);
      logger.logEvent({ event: 'rill_script_parse_error', runId, error: msg });
      return { success: false, lastOutput: state.lastOutput };
    }

    if (error instanceof RuntimeError) {
      if (config.verbosity !== 'quiet') {
        clearStatusInterval();
        clearStatusLine(process.stderr);
      }
      const location = error.location
        ? ` at ${scriptFile}:${error.location.line}:${error.location.column}`
        : '';
      const msg = `Runtime error${location}: ${error.toString()}`;
      printRunner(`${colors.red}${msg}${colors.reset}`);
      logger.logEvent({
        event: 'rill_script_runtime_error',
        runId,
        error: msg,
      });
      return { success: false, lastOutput: state.lastOutput };
    }

    // Generic error fallback
    if (config.verbosity !== 'quiet') {
      clearStatusInterval();
      clearStatusLine(process.stderr);
    }
    const msg = error instanceof Error ? error.message : String(error);
    printRunner(
      `${colors.red}Script error${colors.reset} [${scriptFile}]: ${msg}`
    );
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
