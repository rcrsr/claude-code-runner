#!/usr/bin/env node
/**
 * Claude Code Runner - executes claude CLI with proper TTY handling
 * Shows intermediate tool calls and responses in real-time
 */

import { VERSION as RILL_VERSION } from '@rcrsr/rill';
import { randomBytes } from 'crypto';
import { createRequire } from 'module';

import { generateDocs, parseArgs } from './cli/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
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
  getActiveElapsedMs,
  getRunStatsSummary,
} from './output/formatter.js';
import { createLogger } from './output/logger.js';
import { cloneStats, mergeStats } from './output/stats.js';
import { spawnClaude } from './process/pty.js';
import { runRillScript } from './rill/index.js';
import { DEFAULT_CONFIG, type RunnerConfig } from './types/runner.js';
import {
  clearRunState,
  generateStableId,
  loadRunState,
  type PersistedRunState,
  type PersistedRunStats,
  saveRunState,
} from './utils/run-state.js';

/**
 * Generate a short unique run ID (8 chars, uppercase)
 */
function generateRunId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

async function main(): Promise<void> {
  let totalStart = Date.now();
  const args = process.argv.slice(2);
  const stableId = generateStableId(process.cwd(), args);
  const parsed = parseArgs(args);

  // Handle docs subcommand (exits immediately, no PTY)
  if (parsed.subcommand === 'docs' && parsed.docsOptions) {
    const docs = generateDocs(parsed.docsOptions);
    console.log(docs);
    process.exit(0);
  }

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

  // Restore accumulated stats from a prior crashed run, if any
  const priorState = loadRunState(stableId);
  if (priorState) {
    formatterState.runStats.messageCount = priorState.runStats.messageCount;
    formatterState.runStats.tokens = { ...priorState.runStats.tokens };
    formatterState.runStats.toolsUsed = new Set(priorState.runStats.toolsUsed);
    formatterState.runStats.toolUseCount = priorState.runStats.toolUseCount;
    formatterState.runStats.outputChars = priorState.runStats.outputChars;
    formatterState.elapsedMs = priorState.elapsedMs;
    totalStart = Date.parse(priorState.startedAt);
    printRunnerInfo(`Resuming state from step ${priorState.currentStep}`);
  }

  // Start tick clock regardless of whether we recovered prior state
  formatterState.lastTickTime = Date.now();

  // Persist state after every processed message for crash recovery
  const startedAt = priorState?.startedAt ?? new Date().toISOString();
  formatterState.onUpdate = () => {
    // Accumulate active runtime
    const now = Date.now();
    if (formatterState.lastTickTime !== null) {
      formatterState.elapsedMs += now - formatterState.lastTickTime;
    }
    formatterState.lastTickTime = now;

    const snapshot = cloneStats(formatterState.runStats);
    mergeStats(snapshot, formatterState.stats);
    const persistedStats: PersistedRunStats = {
      messageCount: snapshot.messageCount,
      tokens: { ...snapshot.tokens },
      toolsUsed: Array.from(snapshot.toolsUsed),
      toolUseCount: snapshot.toolUseCount,
      outputChars: snapshot.outputChars,
    };
    const state: PersistedRunState = {
      version: 1,
      pid: process.pid,
      startedAt,
      currentStep: formatterState.currentStep,
      elapsedMs: formatterState.elapsedMs,
      runStats: persistedStats,
    };
    saveRunState(stableId, state);
  };

  // Print version info
  printRunnerInfo(`v${pkg.version} (rill v${RILL_VERSION})`);

  // Emit starting run message (operational, sent to deaddrop)
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
    const now = Date.now();
    const runSummary = getRunStatsSummary(
      formatterState,
      now - totalStart,
      getActiveElapsedMs(formatterState, now)
    );
    printRunner(`Run ${runId} complete: ${runSummary}`);

    logger.close();
    await flushDeadDrop();
    if (result.success) clearRunState(stableId);
    process.exit(result.success ? 0 : 1);
  }

  // Handle prompt, command, and skill subcommands (single execution)
  const promptText = parsed.prompt;
  if (
    (parsed.subcommand === 'command' || parsed.subcommand === 'skill') &&
    !promptText
  ) {
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
    effort: config.effort,
    inactivityTimeoutMs: config.inactivityTimeoutMs,
  });

  // Finalize step stats
  const stepDurationMs = formatterState.stepStartTime
    ? Date.now() - formatterState.stepStartTime
    : 0;
  const stepSummary = finalizeStepStats(formatterState, stepDurationMs);
  printRunner(`Step 1 complete: ${stepSummary}`);

  // Print run completion
  const now = Date.now();
  const runSummary = getRunStatsSummary(
    formatterState,
    now - totalStart,
    getActiveElapsedMs(formatterState, now)
  );
  printRunner(`Run ${runId} complete: ${runSummary}`);

  logger.logEvent({ event: 'run_complete', runId, exit: result.exitCode });
  logger.close();
  await flushDeadDrop();
  if (result.exitCode === 0) clearRunState(stableId);
  process.exit(result.exitCode === 0 ? 0 : 1);
}

// Run main
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
