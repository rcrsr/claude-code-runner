/**
 * Core runner with iteration control and signal detection
 */

import { colors, formatDuration, printRunner } from '../output/colors.js';
import type { FormatterState } from '../output/formatter.js';
import type { Logger } from '../output/logger.js';
import { detectRunnerSignal } from '../parsers/signals.js';
import { spawnClaude } from '../process/pty.js';
import type {
  RunnerConfig,
  SignalResult,
  SignalRunResult,
} from '../types/runner.js';

export interface RunnerContext {
  config: RunnerConfig;
  logger: Logger;
  formatterState: FormatterState;
  cwd: string;
  runId: string | null;
}

export interface StepContext {
  stepNum: number;
}

/**
 * Run a command with RUNNER signal support
 * Handles iteration loop and signal detection
 */
export async function runWithSignals(
  promptText: string,
  displayCommand: string,
  startTime: number,
  context: RunnerContext,
  step: StepContext = { stepNum: 1 }
): Promise<SignalRunResult> {
  const { config, logger, formatterState, cwd } = context;
  const {
    verbosity,
    maxIterations,
    parallelThresholdMs,
    iterationPauseMs,
    model,
  } = config;

  let iteration = 0;
  let lastClaudeText = '';

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with internal exits
  while (true) {
    iteration++;

    // Check max iterations
    if (iteration > maxIterations) {
      const totalDuration = Date.now() - startTime;
      printRunner(
        `${colors.red}Run stopped${colors.reset} max iterations (${maxIterations}) in ${formatDuration(totalDuration)}`
      );
      logger.log(`\nMAX ITERATIONS reached after ${maxIterations}`);
      return { status: 'error', claudeText: lastClaudeText };
    }

    // Log iteration for subsequent iterations
    if (iteration > 1) {
      logger.log(`\n--- Iteration ${iteration} ---\n`);
    }

    // Print running message
    if (verbosity !== 'quiet') {
      const iterLabel = iteration > 1 ? ` (iter ${iteration})` : '';
      const separator = displayCommand.startsWith('with ') ? ' ' : ': ';
      printRunner(
        `Running step ${step.stepNum}${iterLabel}${separator}${displayCommand}`
      );
    }

    // Update formatter with current step
    formatterState.currentStep = iteration;

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

    lastClaudeText = claudeText;
    const signal = detectRunnerSignal(claudeText);
    const stepDuration = Date.now() - startTime;

    if (signal === 'blocked') {
      printRunner(
        `${colors.red}Blocked${colors.reset} step ${step.stepNum} in ${formatDuration(stepDuration)}`
      );
      logger.log(`\nBLOCKED at step ${step.stepNum}`);
      return { status: 'blocked', claudeText };
    } else if (signal === 'error') {
      printRunner(
        `${colors.red}Failed${colors.reset} step ${step.stepNum} in ${formatDuration(stepDuration)}`
      );
      logger.log(`\nERROR at step ${step.stepNum}`);
      return { status: 'error', claudeText };
    } else if (signal === 'repeat_step') {
      printRunner(`Repeating step ${step.stepNum}`);
      logger.log(`Iteration ${iteration} complete, repeating...`);
      await sleep(iterationPauseMs);
    } else {
      // No signal - step completed
      const exitStatus: SignalResult = exitCode === 0 ? 'ok' : 'error';
      if (exitCode !== 0) {
        printRunner(
          `${colors.red}Failed${colors.reset} step ${step.stepNum} in ${formatDuration(stepDuration)}`
        );
      }
      logger.log(`\nStep ${step.stepNum} complete, exit=${exitCode}`);
      return { status: exitStatus, claudeText };
    }
  }
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
