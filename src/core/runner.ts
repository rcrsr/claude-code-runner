/**
 * Core runner with iteration control and signal detection
 */

import { colors, formatDuration } from '../output/colors.js';
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
  startTime: number,
  context: RunnerContext
): Promise<SignalResult> {
  const { config, logger, formatterState, cwd } = context;
  const { verbosity, maxIterations, parallelThresholdMs, iterationPauseMs } =
    config;

  let iteration = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with internal exits
  while (true) {
    iteration++;

    // Check max iterations
    if (iteration > maxIterations) {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      console.log('');
      printSeparator();
      console.log(
        `${colors.red}MAX ITERATIONS (${maxIterations})${colors.reset} | Total: ${formatDuration(totalDuration * 1000)}`
      );
      printSeparator();
      logger.log(`\nMAX ITERATIONS reached after ${maxIterations}`);
      return 'error';
    }

    // Print iteration header for subsequent iterations
    if (iteration > 1) {
      console.log('');
      printIterationHeader(iteration);
      logger.log(`\n--- Iteration ${iteration} ---\n`);
    }

    // Run Claude
    const { exitCode, duration, claudeText } = await spawnClaude({
      prompt: promptText,
      cwd,
      verbosity,
      logger,
      formatterState,
      parallelThresholdMs,
    });

    const status = detectRunnerSignal(claudeText);
    const totalDuration = Math.round((Date.now() - startTime) / 1000);

    console.log('');
    printSeparator();

    if (status === 'done') {
      console.log(
        `${colors.green}COMPLETE${colors.reset} | Iterations: ${iteration} | Total: ${formatDuration(totalDuration * 1000)}`
      );
      printSeparator();
      logger.log(
        `\nCOMPLETE after ${iteration} iterations, ${totalDuration}s total`
      );
      return 'ok';
    } else if (status === 'blocked') {
      console.log(
        `${colors.red}BLOCKED${colors.reset} | Iterations: ${iteration} | Total: ${formatDuration(totalDuration * 1000)}`
      );
      printSeparator();
      logger.log(
        `\nBLOCKED after ${iteration} iterations, ${totalDuration}s total`
      );
      return 'blocked';
    } else if (status === 'error') {
      console.log(
        `${colors.red}ERROR${colors.reset} | Iterations: ${iteration} | Total: ${formatDuration(totalDuration * 1000)}`
      );
      printSeparator();
      logger.log(
        `\nERROR after ${iteration} iterations, ${totalDuration}s total`
      );
      return 'error';
    } else if (status === 'continue') {
      console.log(
        `${colors.yellow}CONTINUE${colors.reset} | Iteration ${iteration} done (${duration}s), continuing...`
      );
      printSeparator();
      logger.log(`Iteration ${iteration} complete, continuing...`);
      await sleep(iterationPauseMs);
    } else {
      // No status signal - treat as successful single run
      const exitStatus: SignalResult = exitCode === 0 ? 'ok' : 'error';
      if (iteration === 1) {
        console.log(
          `Exit: ${exitCode === 0 ? colors.green : colors.red}${exitCode}${colors.reset} | Duration: ${duration}s`
        );
      } else {
        console.log(
          `${exitCode === 0 ? colors.green + 'COMPLETE' : colors.red + 'FAILED'}${colors.reset} | Iterations: ${iteration} | Total: ${formatDuration(totalDuration * 1000)}`
        );
      }
      printSeparator();
      logger.log(
        `\nCompleted after ${iteration} iteration(s), exit=${exitCode}`
      );
      return exitStatus;
    }
  }
}

/**
 * Print a separator line
 */
function printSeparator(): void {
  console.log(
    `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
  );
}

/**
 * Print iteration header
 */
function printIterationHeader(iteration: number): void {
  console.log(
    `${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.blue}Iteration ${iteration}${colors.reset}`);
  console.log(
    `${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log('');
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
