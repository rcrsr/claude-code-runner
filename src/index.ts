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
import { createFormatterState } from './output/formatter.js';
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
import { formatSize } from './utils/formatting.js';

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
  logger.log(`Started: ${new Date().toISOString()}`);

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
    const preview =
      line.text.length > 50 ? line.text.slice(0, 50) + '...' : line.text;
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
  let completedSteps = 0;

  for (const [i, line] of lines.entries()) {
    const stepNum = i + 1;
    const displayLine = getDisplayLine(line);

    context.logger.log(`\n=== Step ${stepNum}: ${displayLine} ===\n`);

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

    // Set step number for formatter output
    context.formatterState.currentStep = stepNum;

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

    // Print step completion with result size
    const durationMs = context.formatterState.lastStepDurationMs;
    const duration = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '?';
    const size = formatSize(result.claudeText.length);
    const captureLabel = line.capture ? `$${line.capture}` : 'result';
    printRunner(
      `Completed step ${stepNum} in ${duration}, ${captureLabel} = ${size}`
    );

    // Handle failure (runWithSignals already printed the error)
    if (result.status !== 'ok') {
      return false;
    }

    completedSteps++;
  }

  // Print completion with run ID, step count, and duration
  const totalDuration = Date.now() - startTime;
  const stepWord = completedSteps === 1 ? 'step' : 'steps';
  const durationSec = (totalDuration / 1000).toFixed(1);
  printRunner(
    `Completed run ${context.runId} (${completedSteps} ${stepWord}) in ${durationSec}s`
  );
  return true;
}

// Run main
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
