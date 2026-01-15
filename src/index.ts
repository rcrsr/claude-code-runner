#!/usr/bin/env node
/**
 * Claude Code Runner - executes claude CLI with proper TTY handling
 * Shows intermediate tool calls and responses in real-time
 */

import { randomBytes } from 'crypto';

import { parseArgs } from './cli/args.js';
import {
  type RunnerContext,
  runWithSignals,
  type StepContext,
} from './core/runner.js';
import { createDeadDropClientFromEnv } from './deaddrop/index.js';
import {
  configureDeadDrop,
  flushDeadDrop,
  printRunner,
  printRunnerInfo,
} from './output/colors.js';
import {
  createFormatterState,
  finalizeStepStats,
  getRunStatsSummary,
  resetFormatterState,
} from './output/formatter.js';
import { createLogger } from './output/logger.js';
import {
  captureOutput,
  createVariableStore,
  getSubstitutionList,
  loadScript,
  substituteVariables,
} from './script/index.js';
import type { ScriptLine } from './script/types.js';
import { loadCommandTemplate } from './templates/command.js';
import { DEFAULT_CONFIG, type RunnerConfig } from './types/runner.js';

/**
 * Generate a short unique run ID (8 chars, uppercase)
 */
function generateRunId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Format variables used for "with X" clause
 */
function formatVarsUsed(vars: string[]): string {
  if (vars.length === 0) return '';
  // Convert $_ to "last result", keep others as-is
  const labels = vars.map((v) => (v === '$_' ? 'last result' : v));
  return `with ${labels.join(', ')}: `;
}

async function main(): Promise<void> {
  const totalStart = Date.now();
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  // Generate run ID for this session
  const runId = generateRunId();

  // Merge config with defaults
  const config: RunnerConfig = {
    ...DEFAULT_CONFIG,
    ...parsed.config,
  };

  // Configure deaddrop if enabled
  if (config.deaddrop) {
    const client = createDeadDropClientFromEnv(runId);
    if (!client) {
      console.error(
        'Error: --deaddrop requires DEADDROP_API_KEY environment variable'
      );
      process.exit(1);
    }
    configureDeadDrop(client.send.bind(client));
  }

  // Create logger
  const commandName = parsed.scriptMode
    ? 'script'
    : parsed.subcommand === 'command'
      ? (args[1] ?? 'prompt')
      : 'prompt';
  const logger = createLogger(config.enableLog, config.logDir, commandName);

  // Create formatter state
  const formatterState = createFormatterState();

  // Create runner context
  const context: RunnerContext = {
    config,
    logger,
    formatterState,
    cwd: process.cwd(),
    runId,
  };

  // Emit starting run message first (operational, sent to deaddrop)
  printRunner(`Starting run ${runId}`);

  // Print config with [RUNNER] messages (informational, not sent to deaddrop)
  printRunnerInfo(
    `Mode: ${parsed.subcommand} | Verbosity: ${config.verbosity}`
  );
  if (config.model) {
    printRunnerInfo(`Model: ${config.model}`);
  }
  if (config.deaddrop) {
    printRunnerInfo(`Deaddrop: enabled`);
  }
  if (logger.filePath) {
    printRunnerInfo(`Log: ${logger.filePath}`);
  }
  logger.logEvent({ event: 'run_start', runId });

  // Build script lines - single prompt/command becomes a 1-step script
  let lines: ScriptLine[];
  let scriptArgs: string[] = [];

  if (parsed.scriptMode && parsed.scriptFile) {
    const script = loadScript(parsed.scriptFile, parsed.scriptArgs);
    lines = script.lines;
    scriptArgs = parsed.scriptArgs;
  } else {
    // Single prompt or command becomes a 1-step script
    lines = [{ type: 'prompt', text: parsed.prompt }];
  }

  // Run the script
  const success = await runScript(lines, scriptArgs, context, totalStart);
  context.logger.close();
  await flushDeadDrop();
  process.exit(success ? 0 : 1);
}

/**
 * Build display string for a script line
 */
function getDisplayLine(line: ScriptLine): string {
  if (line.type === 'prompt') {
    // Replace newlines with spaces for single-line display
    const cleaned = line.text.replace(/[\r\n]+/g, ' ').trim();
    const preview =
      cleaned.length > 50 ? cleaned.slice(0, 50) + '...' : cleaned;
    return `"${preview}"`;
  }
  return `command("${line.name}")`;
}

/**
 * Run a script (unified execution for single prompts and multi-step scripts)
 */
async function runScript(
  lines: ScriptLine[],
  scriptArgs: string[],
  context: RunnerContext,
  startTime: number
): Promise<boolean> {
  const store = createVariableStore();

  for (const [i, line] of lines.entries()) {
    const stepNum = i + 1;
    const displayLine = getDisplayLine(line);

    context.logger.logEvent({
      event: 'step_start',
      step: stepNum,
      prompt: displayLine,
    });

    // Get the prompt text
    let promptText: string;
    if (line.type === 'prompt') {
      promptText = line.text;
    } else {
      const template = loadCommandTemplate(line.name, line.args);
      promptText = template.prompt;
    }

    // Substitute variables
    const varsUsed = getSubstitutionList(promptText, store);
    const finalPrompt = substituteVariables(promptText, store, scriptArgs);

    // Build display: show substituted prompt and what variables were used
    const substitutedDisplay = getDisplayLine({
      type: 'prompt',
      text: finalPrompt,
    });
    const withClause = formatVarsUsed(varsUsed);

    // Set step number and start time for formatter output
    context.formatterState.currentStep = stepNum;
    context.formatterState.stepStartTime = Date.now();

    // Run via runWithSignals (handles iterations, signals, output)
    const stepContext: StepContext = { stepNum };
    const result = await runWithSignals(
      finalPrompt,
      `${withClause}${substitutedDisplay}`,
      startTime,
      context,
      stepContext
    );

    // Capture output for variable store
    captureOutput(store, result.claudeText, line.capture);

    // Finalize step stats and print completion
    const stepDurationMs = context.formatterState.stepStartTime
      ? Date.now() - context.formatterState.stepStartTime
      : (context.formatterState.lastStepDurationMs ?? 0);
    const stepSummary = finalizeStepStats(
      context.formatterState,
      stepDurationMs
    );
    printRunner(`Step ${stepNum} complete: ${stepSummary}`);

    // Handle failure (runWithSignals already printed the error)
    if (result.status !== 'ok') {
      return false;
    }

    // Reset step stats for next step (preserves runStats)
    resetFormatterState(context.formatterState);
  }

  // Print run completion with overall stats
  const totalDuration = Date.now() - startTime;
  const runSummary = getRunStatsSummary(context.formatterState, totalDuration);
  printRunner(`Run ${context.runId} complete: ${runSummary}`);
  return true;
}

// Run main
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
