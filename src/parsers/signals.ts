/**
 * Runner signal detection in Claude output
 */

import { RUNNER_SIGNALS, type RunnerSignal } from '../types/runner.js';

/**
 * Detect loop control signals in Claude's text output
 * Returns null if no signal found
 */
export function detectRunnerSignal(text: string): RunnerSignal | null {
  if (text.includes(RUNNER_SIGNALS.DONE)) {
    return 'done';
  }
  if (text.includes(RUNNER_SIGNALS.CONTINUE)) {
    return 'continue';
  }
  if (text.includes(RUNNER_SIGNALS.BLOCKED)) {
    return 'blocked';
  }
  if (text.includes(RUNNER_SIGNALS.ERROR)) {
    return 'error';
  }
  return null;
}
