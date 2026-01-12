/**
 * Core runner with iteration control and signal detection
 */

import { colors, formatElapsed, printRunner } from '../output/colors.js';
import type { FormatterState } from '../output/formatter.js';
import type { Logger } from '../output/logger.js';
import { detectRunnerSignal } from '../parsers/signals.js';
import { spawnClaude } from '../process/pty.js';
import type { RunnerConfig, SignalResult } from '../types/runner.js';

export interface RunnerContext {
  config: RunnerConfig;
  logger: Logger;
  formatterState: FormatterState;
  cwd: string;
}

/**
 * Run a command with RUNNER signal support
 * Handles iteration loop and signal detection
 */
export async function runWithSignals(
  promptText: string,
  displayCommand: string,
  startTime: number,
  context: RunnerContext
): Promise<SignalResult> {
  const { config, logger, formatterState, cwd } = context;
  const {
    verbosity,
    maxIterations,
    parallelThresholdMs,
    iterationPauseMs,
    model,
  } = config;

  let iteration = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with internal exits
  while (true) {
    iteration++;

    // Check max iterations
    if (iteration > maxIterations) {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      printRunner(
        `${colors.red}Run stopped${colors.reset} max iterations (${maxIterations}) in ${formatElapsed(totalDuration)}`
      );
      logger.log(`\nMAX ITERATIONS reached after ${maxIterations}`);
      return 'error';
    }

    // Log iteration for subsequent iterations
    if (iteration > 1) {
      logger.log(`\n--- Iteration ${iteration} ---\n`);
    }

    // Print running message
    if (verbosity !== 'quiet') {
      printRunner(`Running step [${iteration}]: ${displayCommand}`);
    }

    // Run Claude
    const { exitCode, claudeText } = await spawnClaude({
      prompt: promptText,
      cwd,
      verbosity,
      logger,
      formatterState,
      parallelThresholdMs,
      model,
    });

    const status = detectRunnerSignal(claudeText);
    const totalDuration = Math.round((Date.now() - startTime) / 1000);

    if (status === 'done') {
      printRunner(
        `${colors.green}Run completed${colors.reset} [${iteration}] steps in ${formatElapsed(totalDuration)}`
      );
      logger.log(
        `\nCOMPLETE after ${iteration} iterations, ${totalDuration}s total`
      );
      return 'ok';
    } else if (status === 'blocked') {
      printRunner(
        `${colors.red}Run blocked${colors.reset} [${iteration}] steps in ${formatElapsed(totalDuration)}`
      );
      logger.log(
        `\nBLOCKED after ${iteration} iterations, ${totalDuration}s total`
      );
      return 'blocked';
    } else if (status === 'error') {
      printRunner(
        `${colors.red}Run failed${colors.reset} [${iteration}] steps in ${formatElapsed(totalDuration)}`
      );
      logger.log(
        `\nERROR after ${iteration} iterations, ${totalDuration}s total`
      );
      return 'error';
    } else if (status === 'continue') {
      printRunner(`Claude requested iteration ${iteration + 1}`);
      logger.log(`Iteration ${iteration} complete, continuing...`);
      await sleep(iterationPauseMs);
    } else {
      // No status signal - treat as successful single run
      const exitStatus: SignalResult = exitCode === 0 ? 'ok' : 'error';
      printRunner(
        `${exitCode === 0 ? colors.green + 'Run completed' : colors.red + 'Run failed'}${colors.reset} [${iteration}] steps in ${formatElapsed(totalDuration)}`
      );
      logger.log(
        `\nCompleted after ${iteration} iteration(s), exit=${exitCode}`
      );
      return exitStatus;
    }
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
