#!/usr/bin/env node
/**
 * Claude Code Runner - executes claude CLI with proper TTY handling
 * Shows intermediate tool calls and responses in real-time
 */

import { randomBytes } from 'crypto';

import { parseArgs } from './cli/args.js';
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
} from './output/formatter.js';
import { createLogger } from './output/logger.js';
import { spawnClaude } from './process/pty.js';
import { runRillScript } from './rill/index.js';
import { DEFAULT_CONFIG, type RunnerConfig } from './types/runner.js';

/**
 * Generate a short unique run ID (8 chars, uppercase)
 */
function generateRunId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
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
  const logger = createLogger(
    config.enableLog,
    config.logDir,
    parsed.subcommand
  );

  // Create formatter state
  const formatterState = createFormatterState();

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

  // Handle script subcommand (Rill scripts only)
  if (parsed.subcommand === 'script' && parsed.scriptFile) {
    const result = await runRillScript({
      scriptFile: parsed.scriptFile,
      args: parsed.scriptArgs,
      config,
      logger,
      formatterState,
      cwd: process.cwd(),
      runId,
    });

    // Print run completion
    const totalDuration = Date.now() - totalStart;
    const runSummary = getRunStatsSummary(formatterState, totalDuration);
    printRunner(`Run ${runId} complete: ${runSummary}`);

    logger.close();
    await flushDeadDrop();
    process.exit(result.success ? 0 : 1);
  }

  // Handle prompt and command subcommands (single execution)
  const promptText = parsed.prompt;
  if (parsed.subcommand === 'command' && !promptText) {
    // This shouldn't happen - parseArgs should have handled it
    console.error('Error: no prompt text');
    process.exit(1);
  }

  // Set step info for formatter
  formatterState.currentStep = 1;
  formatterState.stepStartTime = Date.now();

  if (config.verbosity !== 'quiet') {
    printRunner(`Running: ${parsed.displayCommand}`);
  }

  // Execute via PTY
  const result = await spawnClaude({
    prompt: promptText,
    cwd: process.cwd(),
    verbosity: config.verbosity,
    logger,
    formatterState,
    parallelThresholdMs: config.parallelThresholdMs,
    model: config.model,
  });

  // Finalize step stats
  const stepDurationMs = formatterState.stepStartTime
    ? Date.now() - formatterState.stepStartTime
    : 0;
  const stepSummary = finalizeStepStats(formatterState, stepDurationMs);
  printRunner(`Step 1 complete: ${stepSummary}`);

  // Print run completion
  const totalDuration = Date.now() - totalStart;
  const runSummary = getRunStatsSummary(formatterState, totalDuration);
  printRunner(`Run ${runId} complete: ${runSummary}`);

  logger.logEvent({ event: 'run_complete', runId, exit: result.exitCode });
  logger.close();
  await flushDeadDrop();
  process.exit(result.exitCode === 0 ? 0 : 1);
}

// Run main
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
