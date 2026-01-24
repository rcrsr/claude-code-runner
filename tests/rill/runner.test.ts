/**
 * Tests for Rill Script Runner
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormatterState } from '../../src/output/formatter.js';
import { createRunStats } from '../../src/output/stats.js';
import {
  isRillScript,
  loadRillScript,
  type RillRunnerOptions,
  runRillScript,
} from '../../src/rill/runner.js';
import type { RunnerConfig } from '../../src/types/runner.js';
import { createMockLogger } from '../helpers/mocks.js';

// Mock the PTY module
vi.mock('../../src/process/pty.js', () => ({
  spawnClaude: vi.fn(),
}));

// Mock colors to avoid terminal output in tests
vi.mock('../../src/output/colors.js', () => ({
  colors: {
    reset: '',
    red: '',
    yellow: '',
    green: '',
    cyan: '',
    dim: '',
  },
  printRunner: vi.fn(),
  formatDuration: vi.fn((ms: number) => `${ms}ms`),
}));

import { spawnClaude } from '../../src/process/pty.js';

function createMockFormatterState(): FormatterState {
  return {
    pendingTools: [],
    lastToolTime: null,
    activeTask: null,
    toolStartTimes: new Map(),
    currentStep: 1,
    suppressStepCompletion: true,
    lastStepDurationMs: null,
    stats: createRunStats(),
    runStats: createRunStats(),
    stepStartTime: null,
    taskStats: null,
    taskStartTime: null,
  };
}

function createMockConfig(overrides?: Partial<RunnerConfig>): RunnerConfig {
  return {
    verbosity: 'quiet',
    enableLog: false,
    logDir: 'logs',
    maxIterations: 10,
    parallelThresholdMs: 100,
    iterationPauseMs: 0,
    model: null,
    ...overrides,
  };
}

describe('isRillScript', () => {
  it('returns true for .rill files', () => {
    expect(isRillScript('script.rill')).toBe(true);
    expect(isRillScript('path/to/script.rill')).toBe(true);
  });

  it('returns false for non-.rill files', () => {
    expect(isRillScript('script.js')).toBe(false);
    expect(isRillScript('script.md')).toBe(false);
    expect(isRillScript('script.rill.backup')).toBe(false);
  });
});

describe('loadRillScript', () => {
  const testDir = path.join(process.cwd(), 'tests', 'fixtures', 'rill');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('throws error when script file not found', () => {
    expect(() => loadRillScript('/non/existent/file.rill')).toThrow(
      'Script not found'
    );
  });

  it('loads script without frontmatter', () => {
    const scriptPath = path.join(testDir, 'simple.rill');
    fs.writeFileSync(scriptPath, 'ccr::prompt("hello")');

    const result = loadRillScript(scriptPath);

    expect(result.source).toBe('ccr::prompt("hello")');
    expect(result.meta.model).toBeUndefined();
    expect(result.meta.args).toBeUndefined();
  });

  it('parses frontmatter model', () => {
    const scriptPath = path.join(testDir, 'with-model.rill');
    fs.writeFileSync(
      scriptPath,
      `---
model: opus
---
ccr::prompt("test")`
    );

    const result = loadRillScript(scriptPath);

    expect(result.meta.model).toBe('opus');
    expect(result.source).toBe('ccr::prompt("test")');
  });

  it('parses frontmatter args definition', () => {
    const scriptPath = path.join(testDir, 'with-args.rill');
    fs.writeFileSync(
      scriptPath,
      `---
args: file: string, retries: number = 3, verbose: bool = false
---
ccr::prompt($file)`
    );

    const result = loadRillScript(scriptPath);

    expect(result.meta.args).toHaveLength(3);
    expect(result.meta.args?.[0]).toEqual({
      name: 'file',
      type: 'string',
      required: true,
    });
    expect(result.meta.args?.[1]).toEqual({
      name: 'retries',
      type: 'number',
      required: false,
      defaultValue: 3,
    });
    expect(result.meta.args?.[2]).toEqual({
      name: 'verbose',
      type: 'bool',
      required: false,
      defaultValue: false,
    });
  });

  it('parses description from frontmatter', () => {
    const scriptPath = path.join(testDir, 'with-desc.rill');
    fs.writeFileSync(
      scriptPath,
      `---
description: A test script
---
log("test")`
    );

    const result = loadRillScript(scriptPath);

    expect(result.meta.description).toBe('A test script');
  });
});

describe('runRillScript', () => {
  const testDir = path.join(process.cwd(), 'tests', 'fixtures', 'rill');

  beforeEach(() => {
    vi.clearAllMocks();
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createRunnerOptions(
    scriptFile: string,
    overrides?: Partial<RillRunnerOptions>
  ): RillRunnerOptions {
    return {
      scriptFile,
      args: [],
      config: createMockConfig(),
      logger: createMockLogger(),
      formatterState: createMockFormatterState(),
      cwd: process.cwd(),
      runId: 'test-run-1',
      ...overrides,
    };
  }

  it('executes simple script successfully', async () => {
    const scriptPath = path.join(testDir, 'simple.rill');
    fs.writeFileSync(scriptPath, 'log("hello")');

    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      duration: 100,
      claudeText: 'Done',
    });

    const result = await runRillScript(createRunnerOptions(scriptPath));

    expect(result.success).toBe(true);
  });

  it('calls spawnClaude for ccr::prompt', async () => {
    const scriptPath = path.join(testDir, 'prompt.rill');
    fs.writeFileSync(scriptPath, 'ccr::prompt("analyze code")');

    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      duration: 100,
      claudeText: 'Analysis complete',
    });

    const result = await runRillScript(createRunnerOptions(scriptPath));

    expect(spawnClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'analyze code',
      })
    );
    expect(result.success).toBe(true);
    expect(result.lastOutput).toBe('Analysis complete');
  });

  it('uses CLI model over frontmatter model', async () => {
    const scriptPath = path.join(testDir, 'model.rill');
    fs.writeFileSync(
      scriptPath,
      `---
model: opus
---
ccr::prompt("test")`
    );

    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      duration: 100,
      claudeText: 'Done',
    });

    await runRillScript(
      createRunnerOptions(scriptPath, {
        config: createMockConfig({ model: 'haiku' }),
      })
    );

    expect(spawnClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'haiku',
      })
    );
  });

  it('uses frontmatter model when no CLI model', async () => {
    const scriptPath = path.join(testDir, 'model.rill');
    fs.writeFileSync(
      scriptPath,
      `---
model: opus
---
ccr::prompt("test")`
    );

    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      duration: 100,
      claudeText: 'Done',
    });

    await runRillScript(createRunnerOptions(scriptPath));

    expect(spawnClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'opus',
      })
    );
  });

  it('maps named args from CLI to script variables', async () => {
    const scriptPath = path.join(testDir, 'args.rill');
    fs.writeFileSync(
      scriptPath,
      `---
args: file: string, count: number = 5
---
ccr::prompt("Review {$file} with count {$count}")`
    );

    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      duration: 100,
      claudeText: 'Done',
    });

    await runRillScript(
      createRunnerOptions(scriptPath, {
        args: ['src/main.ts', '10'],
      })
    );

    expect(spawnClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Review src/main.ts with count 10',
      })
    );
  });

  it('uses default values for missing args', async () => {
    const scriptPath = path.join(testDir, 'defaults.rill');
    fs.writeFileSync(
      scriptPath,
      `---
args: file: string, count: number = 5
---
ccr::prompt("Review {$file} with count {$count}")`
    );

    vi.mocked(spawnClaude).mockResolvedValue({
      exitCode: 0,
      duration: 100,
      claudeText: 'Done',
    });

    await runRillScript(
      createRunnerOptions(scriptPath, {
        args: ['src/main.ts'],
      })
    );

    expect(spawnClaude).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Review src/main.ts with count 5',
      })
    );
  });

  it('throws error for missing required args', async () => {
    const scriptPath = path.join(testDir, 'required.rill');
    fs.writeFileSync(
      scriptPath,
      `---
args: file: string
---
ccr::prompt($file)`
    );

    await expect(
      runRillScript(createRunnerOptions(scriptPath))
    ).rejects.toThrow('Missing required argument: file');
  });

  it('throws on parse error (parse happens before try/catch)', async () => {
    const scriptPath = path.join(testDir, 'invalid.rill');
    fs.writeFileSync(scriptPath, 'this is not valid {{ syntax');

    // Parse errors throw because parse() is called before the try/catch
    await expect(
      runRillScript(createRunnerOptions(scriptPath))
    ).rejects.toThrow();
  });

  it('returns success false on runtime error', async () => {
    const scriptPath = path.join(testDir, 'error.rill');
    fs.writeFileSync(scriptPath, 'ccr::error("something went wrong")');

    const result = await runRillScript(createRunnerOptions(scriptPath));

    expect(result.success).toBe(false);
  });

  it('logs events to logger', async () => {
    const scriptPath = path.join(testDir, 'logged.rill');
    fs.writeFileSync(scriptPath, 'log("test")');

    const logger = createMockLogger();
    await runRillScript(createRunnerOptions(scriptPath, { logger }));

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const logEventCalls = vi.mocked(logger.logEvent).mock.calls;
    expect(logEventCalls).toContainEqual([
      expect.objectContaining({
        event: 'rill_script_start',
        runId: 'test-run-1',
      }),
    ]);
    expect(logEventCalls).toContainEqual([
      expect.objectContaining({
        event: 'rill_script_complete',
        success: true,
      }),
    ]);
  });
});
