import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunnerContext } from '../../src/core/runner.js';
import { runWithSignals } from '../../src/core/runner.js';
import {
  createMockConfig,
  createMockFormatterState,
  createMockLogger,
  createMockRunResult,
} from '../helpers/mocks.js';

// Mock spawnClaude
vi.mock('../../src/process/pty.js', () => ({
  spawnClaude: vi.fn(),
}));

// Mock detectRunnerSignal
vi.mock('../../src/parsers/signals.js', () => ({
  detectRunnerSignal: vi.fn(),
}));

import { spawnClaude } from '../../src/process/pty.js';
import { detectRunnerSignal } from '../../src/parsers/signals.js';

describe('runWithSignals', () => {
  let context: RunnerContext;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    context = {
      config: createMockConfig({ iterationPauseMs: 100 }),
      logger: createMockLogger(),
      formatterState: createMockFormatterState(),
      cwd: '/test/dir',
      runId: 'TEST1234',
    };

    // Default mock: successful run with no signal
    vi.mocked(spawnClaude).mockResolvedValue(createMockRunResult());
    vi.mocked(detectRunnerSignal).mockReturnValue(null);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  describe('signal detection', () => {
    it('returns ok when Claude outputs DONE signal', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      const result = await runWithSignals('test', 'test', Date.now(), context);

      expect(result).toBe('ok');
    });

    it('returns blocked when Claude outputs BLOCKED signal', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue('blocked');

      const result = await runWithSignals('test', 'test', Date.now(), context);

      expect(result).toBe('blocked');
    });

    it('returns error when Claude outputs ERROR signal', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue('error');

      const result = await runWithSignals('test', 'test', Date.now(), context);

      expect(result).toBe('error');
    });

    it('continues iteration when Claude outputs REPEAT_STEP signal', async () => {
      vi.mocked(detectRunnerSignal)
        .mockReturnValueOnce('repeat_step')
        .mockReturnValueOnce(null);

      const promise = runWithSignals('test', 'test', Date.now(), context);
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe('ok');
      expect(spawnClaude).toHaveBeenCalledTimes(2);
    });

    it('returns ok on exitCode 0 without signal', async () => {
      vi.mocked(spawnClaude).mockResolvedValue(
        createMockRunResult({ exitCode: 0 })
      );
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      const result = await runWithSignals('test', 'test', Date.now(), context);

      expect(result).toBe('ok');
    });

    it('returns error on non-zero exitCode without signal', async () => {
      vi.mocked(spawnClaude).mockResolvedValue(
        createMockRunResult({ exitCode: 1 })
      );
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      const result = await runWithSignals('test', 'test', Date.now(), context);

      expect(result).toBe('error');
    });
  });

  describe('iteration control', () => {
    it('stops after maxIterations with error result', async () => {
      context.config.maxIterations = 2;
      vi.mocked(detectRunnerSignal).mockReturnValue('repeat_step');

      const promise = runWithSignals('test', 'test', Date.now(), context);

      // Advance through iterations
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe('error');
      expect(spawnClaude).toHaveBeenCalledTimes(2);
    });

    it('prints iteration header for iterations > 1', async () => {
      vi.mocked(detectRunnerSignal)
        .mockReturnValueOnce('repeat_step')
        .mockReturnValueOnce(null);

      const promise = runWithSignals('test', 'test', Date.now(), context);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasIterationMsg = calls.some((c) =>
        c.includes('Claude requested to repeat the step')
      );

      expect(hasIterationMsg).toBe(true);
    });

    it('does not print iteration message for first iteration', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasIterationMsg = calls.some((c) =>
        c.includes('Claude requested to repeat the step')
      );

      expect(hasIterationMsg).toBe(false);
    });

    it('pauses between iterations using iterationPauseMs', async () => {
      context.config.iterationPauseMs = 500;
      vi.mocked(detectRunnerSignal)
        .mockReturnValueOnce('repeat_step')
        .mockReturnValueOnce(null);

      const startTime = Date.now();
      const promise = runWithSignals('test', 'test', startTime, context);

      // First iteration completes immediately
      expect(spawnClaude).toHaveBeenCalledTimes(1);

      // Advance partial time - should not trigger second iteration
      await vi.advanceTimersByTimeAsync(200);
      expect(spawnClaude).toHaveBeenCalledTimes(1);

      // Advance remaining time - should trigger second iteration
      await vi.advanceTimersByTimeAsync(300);
      expect(spawnClaude).toHaveBeenCalledTimes(2);

      await promise;
    });
  });

  describe('context passing', () => {
    it('passes prompt to spawnClaude', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals(
        'my test prompt',
        'my test prompt',
        Date.now(),
        context
      );

      expect(spawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'my test prompt' })
      );
    });

    it('passes cwd to spawnClaude', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      expect(spawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/test/dir' })
      );
    });

    it('passes verbosity to spawnClaude', async () => {
      context.config.verbosity = 'verbose';
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      expect(spawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({ verbosity: 'verbose' })
      );
    });

    it('passes logger to spawnClaude', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      expect(spawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({ logger: context.logger })
      );
    });

    it('passes formatterState to spawnClaude', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      expect(spawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({ formatterState: context.formatterState })
      );
    });

    it('passes parallelThresholdMs to spawnClaude', async () => {
      context.config.parallelThresholdMs = 200;
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      expect(spawnClaude).toHaveBeenCalledWith(
        expect.objectContaining({ parallelThresholdMs: 200 })
      );
    });
  });

  describe('output formatting', () => {
    it('prints Completed run on done signal', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasComplete = calls.some((c) => c.includes('Completed run'));

      expect(hasComplete).toBe(true);
    });

    it('prints Blocked run on blocked signal', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue('blocked');

      await runWithSignals('test', 'test', Date.now(), context);

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasBlocked = calls.some((c) => c.includes('Blocked run'));

      expect(hasBlocked).toBe(true);
    });

    it('prints Failed run on error signal', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue('error');

      await runWithSignals('test', 'test', Date.now(), context);

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasError = calls.some((c) => c.includes('Failed run'));

      expect(hasError).toBe(true);
    });

    it('prints Max iterations when exceeded', async () => {
      context.config.maxIterations = 1;
      vi.mocked(detectRunnerSignal).mockReturnValue('repeat_step');

      const promise = runWithSignals('test', 'test', Date.now(), context);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasMaxIter = calls.some((c) => c.includes('max iterations'));

      expect(hasMaxIter).toBe(true);
    });

    it('logs to logger', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      await runWithSignals('test', 'test', Date.now(), context);

      expect(context.logger.log).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles immediate completion on first iteration', async () => {
      vi.mocked(detectRunnerSignal).mockReturnValue(null);

      const result = await runWithSignals('test', 'test', Date.now(), context);

      expect(result).toBe('ok');
      expect(spawnClaude).toHaveBeenCalledTimes(1);
    });

    it('handles multiple REPEAT_STEP then completion', async () => {
      vi.mocked(detectRunnerSignal)
        .mockReturnValueOnce('repeat_step')
        .mockReturnValueOnce('repeat_step')
        .mockReturnValueOnce(null);

      const promise = runWithSignals('test', 'test', Date.now(), context);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe('ok');
      expect(spawnClaude).toHaveBeenCalledTimes(3);
    });

    it('handles BLOCKED on second iteration', async () => {
      vi.mocked(detectRunnerSignal)
        .mockReturnValueOnce('repeat_step')
        .mockReturnValueOnce('blocked');

      const promise = runWithSignals('test', 'test', Date.now(), context);
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe('blocked');
      expect(spawnClaude).toHaveBeenCalledTimes(2);
    });

    it('handles maxIterations = 1', async () => {
      context.config.maxIterations = 1;
      vi.mocked(detectRunnerSignal).mockReturnValue('repeat_step');

      const promise = runWithSignals('test', 'test', Date.now(), context);
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      expect(result).toBe('error');
      expect(spawnClaude).toHaveBeenCalledTimes(1);
    });

    it('uses claudeText from spawnClaude for signal detection', async () => {
      vi.mocked(spawnClaude).mockResolvedValue(
        createMockRunResult({ claudeText: ':::RUNNER::BLOCKED:::' })
      );

      await runWithSignals('test', 'test', Date.now(), context);

      expect(detectRunnerSignal).toHaveBeenCalledWith(':::RUNNER::BLOCKED:::');
    });
  });
});
