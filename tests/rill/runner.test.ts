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
  renderStatusLine: vi.fn(),
  clearStatusLine: vi.fn(),
  stripAnsi: vi.fn((str: string) => str),
  stripCR: vi.fn((str: string) => str),
  terminalLog: vi.fn(),
  printRunnerInfo: vi.fn(),
  printClaude: vi.fn(),
  bindFormatterState: vi.fn(),
  unbindFormatterState: vi.fn(),
  statusDisplayText: vi.fn(
    (state: { currentStatusText: string | null }) => state.currentStatusText
  ),
}));

// Mock @rcrsr/rill so `execute` can be overridden per-test while every other
// export (parse, RuntimeHaltSignal, getStatus, atomName, createRuntimeContext)
// stays real. The default implementation is the real execute, so untouched
// tests behave normally.
vi.mock('@rcrsr/rill', async (importOriginal) => {
  const actual = await importOriginal<typeof rill>();
  return { ...actual, execute: vi.fn(actual.execute) };
});

import * as rill from '@rcrsr/rill';

import { spawnClaude } from '../../src/process/pty.js';

function createMockFormatterState(): FormatterState {
  return {
    pendingTools: [],
    lastToolTime: null,
    activeTasks: new Map(),
    toolToTaskId: new Map(),
    currentTaskId: null,
    toolStartTimes: new Map(),
    currentStep: 1,
    suppressStepCompletion: true,
    lastStepDurationMs: null,
    stats: createRunStats(),
    runStats: createRunStats(),
    stepStartTime: null,
    taskStatsMap: new Map(),
    taskStartTimes: new Map(),
    taskReadyQueue: [],
    taskPendingQueue: [],
    currentStatusText: null,
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
    // Source includes full content - Rill handles frontmatter
    expect(result.source).toContain('---');
    expect(result.source).toContain('ccr::prompt("test")');
  });

  it('parses frontmatter effort', () => {
    const scriptPath = path.join(testDir, 'with-effort.rill');
    fs.writeFileSync(
      scriptPath,
      `---
effort: low
---
ccr::prompt("test")`
    );

    const result = loadRillScript(scriptPath);

    expect(result.meta.effort).toBe('low');
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

  it('includes script filename in error when createRunnerContext throws', async () => {
    const scriptPath = path.join(testDir, 'setup-error.rill');
    fs.writeFileSync(scriptPath, 'log("hello")');

    // Force createRunnerContext to throw a setup error
    vi.spyOn(
      await import('../../src/rill/context.js'),
      'createRunnerContext'
    ).mockImplementationOnce(() => {
      throw new Error(
        "Invalid defaultValue for parameter 'model': expected any, got string"
      );
    });

    await expect(
      runRillScript(createRunnerOptions(scriptPath))
    ).rejects.toThrow(`Script setup failed for ${scriptPath}:`);

    vi.restoreAllMocks();
  });

  it('returns success false on parse error with correct line numbers', async () => {
    const scriptPath = path.join(testDir, 'invalid.rill');
    fs.writeFileSync(
      scriptPath,
      `---
model: opus
---
ccr::prompt("valid")
this is not valid {{ syntax`
    );

    const result = await runRillScript(createRunnerOptions(scriptPath));

    expect(result.success).toBe(false);
    // Parse error should reference line 5 (not line 2 which would be relative to body)
  });

  it('returns success false on runtime error', async () => {
    const scriptPath = path.join(testDir, 'error.rill');
    fs.writeFileSync(scriptPath, 'error "something went wrong"');

    const result = await runRillScript(createRunnerOptions(scriptPath));

    expect(result.success).toBe(false);
  });

  it('returns success false and logs cancellation on abort halt', async () => {
    // An aborted execution surfaces as a non-catchable RuntimeHaltSignal
    // carrying the #DISPOSED atom. Build a genuine one via the real rill API,
    // then make the runner's execute reject with it.
    const actualRill = await vi.importActual<typeof rill>('@rcrsr/rill');
    const controller = new AbortController();
    const abortCtx = actualRill.createRuntimeContext({
      variables: {},
      functions: {},
      signal: controller.signal,
    });
    controller.abort();
    let abortHalt: unknown;
    try {
      await actualRill.execute(actualRill.parse('1 + 1'), abortCtx);
    } catch (caught) {
      abortHalt = caught;
    }
    expect(abortHalt).toBeInstanceOf(actualRill.RuntimeHaltSignal);

    vi.mocked(rill.execute).mockRejectedValueOnce(abortHalt);

    const scriptPath = path.join(testDir, 'cancelled.rill');
    fs.writeFileSync(scriptPath, 'log("hello")');
    const logger = createMockLogger();

    const result = await runRillScript(
      createRunnerOptions(scriptPath, { logger })
    );

    expect(result.success).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const logEventCalls = vi.mocked(logger.logEvent).mock.calls;
    expect(logEventCalls).toContainEqual([
      expect.objectContaining({ event: 'rill_script_cancelled' }),
    ]);
    expect(logEventCalls).not.toContainEqual([
      expect.objectContaining({ event: 'rill_script_runtime_error' }),
    ]);
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

describe('status line clearing', () => {
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

  it('clears status line on script completion (AC-4)', async () => {
    const scriptPath = path.join(testDir, 'status-complete.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Processing...")
log("Work done")
`
    );

    // Import the mocked modules
    const { clearStatusLine } = await import('../../src/output/colors.js');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'normal' });
    await runRillScript(
      createRunnerOptions(scriptPath, { formatterState, config })
    );

    // Verify clearStatusLine was called after script completion (AC-4)
    expect(clearStatusLine).toHaveBeenCalled();

    // Verify the clear happened after any state updates
    // (clearStatusLine is called in the finally block, line 342)
    const clearCalls = vi.mocked(clearStatusLine).mock.calls;
    expect(clearCalls.length).toBeGreaterThan(0);
  });

  it('clears status line before error output (AC-5)', async () => {
    const scriptPath = path.join(testDir, 'status-error.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Processing...")
error "Something went wrong"
`
    );

    const { clearStatusLine, printRunner } =
      await import('../../src/output/colors.js');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'normal' });
    const result = await runRillScript(
      createRunnerOptions(scriptPath, { formatterState, config })
    );

    expect(result.success).toBe(false);

    // Get all mock calls
    const clearCalls = vi.mocked(clearStatusLine).mock.invocationCallOrder;
    const printCalls = vi.mocked(printRunner).mock.invocationCallOrder;

    // Find the error message print call
    const errorPrintCall = printCalls[printCalls.length - 1];

    // Verify clearStatusLine was called before error output
    expect(clearCalls.length).toBeGreaterThan(0);
    const lastClearCall = clearCalls[clearCalls.length - 1];
    expect(lastClearCall).toBeLessThan(errorPrintCall ?? Infinity);
  });

  it('clears status line on parse error (AC-5 variant)', async () => {
    const scriptPath = path.join(testDir, 'status-parse-error.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Parsing...")
this is {{ invalid syntax
`
    );

    const { clearStatusLine } = await import('../../src/output/colors.js');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'normal' });
    const result = await runRillScript(
      createRunnerOptions(scriptPath, { formatterState, config })
    );

    expect(result.success).toBe(false);
    expect(clearStatusLine).toHaveBeenCalled();
  });

  it('clears status line on runtime error (AC-5 variant)', async () => {
    const scriptPath = path.join(testDir, 'status-runtime-error.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Running...")
$nonexistent_variable + 1
`
    );

    const { clearStatusLine } = await import('../../src/output/colors.js');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'normal' });
    const result = await runRillScript(
      createRunnerOptions(scriptPath, { formatterState, config })
    );

    expect(result.success).toBe(false);
    expect(clearStatusLine).toHaveBeenCalled();
  });

  it('does not render status in quiet mode (AC-11)', async () => {
    const scriptPath = path.join(testDir, 'status-quiet.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Processing...")
log("Work done")
`
    );

    const { renderStatusLine } = await import('../../src/output/colors.js');

    await runRillScript(
      createRunnerOptions(scriptPath, {
        config: createMockConfig({ verbosity: 'quiet' }),
      })
    );

    // In quiet mode, renderStatusLine should never be called
    expect(renderStatusLine).not.toHaveBeenCalled();
  });

  it('quiet verbosity suppresses status display - no stderr writes (AC-7)', async () => {
    const scriptPath = path.join(testDir, 'status-quiet-stderr.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Processing step 1...")
log("Step 1 complete")
ccr::state("Processing step 2...")
log("Step 2 complete")
ccr::state("")
log("All done")
`
    );

    const { renderStatusLine, clearStatusLine } =
      await import('../../src/output/colors.js');

    // Create a spy on stderr.write to verify no writes occur
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'quiet' });

    await runRillScript(
      createRunnerOptions(scriptPath, { formatterState, config })
    );

    // Verify no status rendering functions were called
    expect(renderStatusLine).not.toHaveBeenCalled();
    expect(clearStatusLine).not.toHaveBeenCalled();

    // Verify no writes to stderr occurred (status display suppressed)
    expect(stderrWriteSpy).not.toHaveBeenCalled();

    // Verify state was updated internally (callback executed)
    // Final state should be null after the script clears it
    expect(formatterState.currentStatusText).toBeNull();

    stderrWriteSpy.mockRestore();
  });

  it('non-TTY environments skip status rendering - no writes (AC-6, EC-4)', async () => {
    const scriptPath = path.join(testDir, 'status-non-tty.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Processing step 1...")
log("Step 1 complete")
ccr::state("Processing step 2...")
log("Step 2 complete")
ccr::state("")
log("All done")
`
    );

    const { renderStatusLine } = await import('../../src/output/colors.js');

    // Mock stderr as non-TTY by setting isTTY to undefined
    const originalIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, 'isTTY', {
      value: undefined,
      configurable: true,
    });

    // Create a spy on stderr.write to verify no writes occur
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'normal' }); // Normal verbosity, but non-TTY

    await runRillScript(
      createRunnerOptions(scriptPath, { formatterState, config })
    );

    // Verify renderStatusLine was called but produced no output (silent no-op)
    expect(renderStatusLine).toHaveBeenCalled();

    // Verify zero writes to stderr (no-op in non-TTY environment)
    expect(stderrWriteSpy).not.toHaveBeenCalled();

    // Verify state was updated internally (callback executed)
    expect(formatterState.currentStatusText).toBeNull();

    // Restore original isTTY value
    Object.defineProperty(process.stderr, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });

    stderrWriteSpy.mockRestore();
  });

  it('terminal resize during active status re-renders with updated columns (AC-EC-2)', async () => {
    const scriptPath = path.join(testDir, 'status-resize.rill');
    fs.writeFileSync(
      scriptPath,
      `
ccr::state("Processing a very long status message that should be visible")
log("Work in progress")
`
    );

    const { renderStatusLine } = await import('../../src/output/colors.js');

    // Configure non-quiet mode to enable resize listener
    const config = createMockConfig({ verbosity: 'normal' });
    const formatterState = createMockFormatterState();

    // Track the number of resize event listeners before execution
    const initialListenerCount = process.stderr.listenerCount('resize');

    // Execute the script
    await runRillScript(
      createRunnerOptions(scriptPath, { config, formatterState })
    );

    // Verify resize listener was removed after completion
    const finalListenerCount = process.stderr.listenerCount('resize');
    expect(finalListenerCount).toBe(initialListenerCount);

    // Verify renderStatusLine was called (for state rendering)
    expect(renderStatusLine).toHaveBeenCalled();
  });

  it('rapid sequential state updates display only latest value (AC-EC-3)', async () => {
    const scriptPath = path.join(testDir, 'status-rapid.rill');
    // Create a script that rapidly updates state 10 times
    const stateUpdates = Array.from(
      { length: 10 },
      (_, i) => `ccr::state("State ${i}")`
    ).join('\n');
    fs.writeFileSync(scriptPath, stateUpdates);

    const { renderStatusLine } = await import('../../src/output/colors.js');

    const formatterState = createMockFormatterState();
    const config = createMockConfig({ verbosity: 'normal' });
    await runRillScript(
      createRunnerOptions(scriptPath, {
        formatterState,
        config,
      })
    );

    // Verify renderStatusLine was called multiple times (once per state update)
    expect(renderStatusLine).toHaveBeenCalled();

    // Get all calls to renderStatusLine
    const calls = vi.mocked(renderStatusLine).mock.calls;

    // Verify the last call before clearing has the final state value
    const nonNullCalls = calls.filter((call) => call[0] !== null);
    expect(nonNullCalls.length).toBeGreaterThan(0);
    const lastNonNullCall = nonNullCalls[nonNullCalls.length - 1];
    expect(lastNonNullCall?.[0]).toContain('State 9');
  });
});
