import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runWithSignals, type RunnerContext } from '../../src/core/runner.js';
import { createFormatterState } from '../../src/output/formatter.js';
import { createMockConfig, createMockLogger } from '../helpers/mocks.js';

// Mock the pty module
vi.mock('../../src/process/pty.js', () => ({
  spawnClaude: vi.fn(),
}));

// Mock the signals module
vi.mock('../../src/parsers/signals.js', () => ({
  detectRunnerSignal: vi.fn(),
}));

import { spawnClaude } from '../../src/process/pty.js';
import { detectRunnerSignal } from '../../src/parsers/signals.js';

describe('loop integration', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runs 3 iterations when CONTINUE signal is returned twice then DONE', async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    const mockDetect = vi.mocked(detectRunnerSignal);

    // Simulate 3 iterations: continue, continue, done
    let callCount = 0;
    mockSpawn.mockImplementation(async () => {
      callCount++;
      return {
        exitCode: 0,
        duration: 1,
        claudeText: `Iteration ${callCount} complete`,
      };
    });

    // Return continue for first 2, done for 3rd
    mockDetect.mockImplementation(() => {
      if (callCount < 3) return 'continue';
      return 'done';
    });

    const context: RunnerContext = {
      config: createMockConfig({ maxIterations: 10, iterationPauseMs: 0 }),
      logger: createMockLogger(),
      formatterState: createFormatterState(),
      cwd: '/tmp',
    };

    const resultPromise = runWithSignals('test prompt', 'test prompt', Date.now(), context);

    // Advance timers for each iteration
    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it('stops at max iterations when CONTINUE keeps being returned', async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    const mockDetect = vi.mocked(detectRunnerSignal);

    mockSpawn.mockResolvedValue({
      exitCode: 0,
      duration: 1,
      claudeText: 'Still working...',
    });

    // Always return continue
    mockDetect.mockReturnValue('continue');

    const context: RunnerContext = {
      config: createMockConfig({ maxIterations: 3, iterationPauseMs: 0 }),
      logger: createMockLogger(),
      formatterState: createFormatterState(),
      cwd: '/tmp',
    };

    const resultPromise = runWithSignals('test prompt', 'test prompt', Date.now(), context);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('error');
    expect(mockSpawn).toHaveBeenCalledTimes(3);

    // Check that max iterations message was logged
    const outputs = consoleSpy.mock.calls.map((c) => c[0] as string);
    const hasMaxIterMsg = outputs.some((o) => o.includes('max iterations'));
    expect(hasMaxIterMsg).toBe(true);
  });

  it('outputs timestamps on all log lines', async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    const mockDetect = vi.mocked(detectRunnerSignal);

    mockSpawn.mockResolvedValue({
      exitCode: 0,
      duration: 1,
      claudeText: 'Done',
    });

    mockDetect.mockReturnValue('done');

    const context: RunnerContext = {
      config: createMockConfig({ maxIterations: 10, iterationPauseMs: 0 }),
      logger: createMockLogger(),
      formatterState: createFormatterState(),
      cwd: '/tmp',
    };

    await runWithSignals('test prompt', 'test prompt', Date.now(), context);

    // Check that log lines contain timestamp pattern (HH:MM:SS.mmm)
    const outputs = consoleSpy.mock.calls.map((c) => c[0] as string);
    const timestampPattern = /\d{2}:\d{2}:\d{2}\.\d{3}/;

    // Filter out empty lines
    const nonEmptyOutputs = outputs.filter((o) => o.trim().length > 0);

    // All non-empty lines should have timestamps
    for (const output of nonEmptyOutputs) {
      expect(output).toMatch(timestampPattern);
    }
  });

  it('handles blocked signal correctly', async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    const mockDetect = vi.mocked(detectRunnerSignal);

    mockSpawn.mockResolvedValue({
      exitCode: 0,
      duration: 1,
      claudeText: 'Blocked on permission',
    });

    mockDetect.mockReturnValue('blocked');

    const context: RunnerContext = {
      config: createMockConfig({ maxIterations: 10, iterationPauseMs: 0 }),
      logger: createMockLogger(),
      formatterState: createFormatterState(),
      cwd: '/tmp',
    };

    const result = await runWithSignals('test prompt', 'test prompt', Date.now(), context);

    expect(result).toBe('blocked');
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('handles error signal correctly', async () => {
    const mockSpawn = vi.mocked(spawnClaude);
    const mockDetect = vi.mocked(detectRunnerSignal);

    mockSpawn.mockResolvedValue({
      exitCode: 0,
      duration: 1,
      claudeText: 'Error occurred',
    });

    mockDetect.mockReturnValue('error');

    const context: RunnerContext = {
      config: createMockConfig({ maxIterations: 10, iterationPauseMs: 0 }),
      logger: createMockLogger(),
      formatterState: createFormatterState(),
      cwd: '/tmp',
    };

    const result = await runWithSignals('test prompt', 'test prompt', Date.now(), context);

    expect(result).toBe('error');
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
