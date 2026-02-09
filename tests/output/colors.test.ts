import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindFormatterState,
  clearStatusLine,
  formatDuration,
  formatTimestamp,
  printRunner,
  renderStatusLine,
  shortenPath,
  stripAnsi,
  terminalLog,
  timestampPrefix,
  truncate,
  unbindFormatterState,
} from '../../src/output/colors.js';
import type { FormatterState } from '../../src/output/formatter.js';
import { STATUS_LINE_MIN_WIDTH } from '../../src/utils/constants.js';

describe('stripAnsi', () => {
  it('removes ANSI color codes', () => {
    const colored = '\x1b[31mRed Text\x1b[0m';
    expect(stripAnsi(colored)).toBe('Red Text');
  });

  it('handles multiple color codes', () => {
    const colored = '\x1b[1m\x1b[34mBold Blue\x1b[0m';
    expect(stripAnsi(colored)).toBe('Bold Blue');
  });

  it('returns plain text unchanged', () => {
    const plain = 'Plain text';
    expect(stripAnsi(plain)).toBe('Plain text');
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello wo...');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(2500)).toBe('2.5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });
});

describe('shortenPath', () => {
  it('shortens apps paths', () => {
    expect(shortenPath('/home/user/project/apps/web/src/file.ts')).toBe(
      'apps/web/src/file.ts'
    );
  });

  it('shortens packages paths', () => {
    expect(shortenPath('/home/user/project/packages/core/index.ts')).toBe(
      'packages/core/index.ts'
    );
  });

  it('shortens .claude paths', () => {
    expect(shortenPath('/home/user/project/.claude/commands/test.md')).toBe(
      '.claude/commands/test.md'
    );
  });

  it('returns short paths unchanged', () => {
    expect(shortenPath('src/file.ts')).toBe('src/file.ts');
  });
});

describe('formatTimestamp', () => {
  it('formats time as HH:MM:SS.mmm', () => {
    const date = new Date('2024-01-15T09:05:03.042Z');
    const result = formatTimestamp(date);
    // Note: result depends on timezone, so just check format
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('pads single digit values with zeros', () => {
    const date = new Date('2024-01-15T01:02:03.004Z');
    const result = formatTimestamp(date);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('uses current time when no date provided', () => {
    const result = formatTimestamp();
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});

describe('timestampPrefix', () => {
  it('returns timestamp with ANSI dim codes and trailing space', () => {
    const result = timestampPrefix();
    // Should contain dim code, timestamp, reset code, and space
    expect(result).toContain('\x1b[2m'); // dim
    expect(result).toContain('\x1b[0m'); // reset
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/); // timestamp
    expect(result.endsWith(' ')).toBe(true); // trailing space
  });

  it('stripping ANSI leaves just timestamp and space', () => {
    const result = timestampPrefix();
    const stripped = stripAnsi(result);
    expect(stripped).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} $/);
  });
});

describe('printRunner', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prints message with [runner] prefix and timestamp', () => {
    printRunner('Test message');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('[runner]');
    expect(output).toContain('Test message');
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it('uses magenta color for [RUNNER] label', () => {
    printRunner('Test');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('\x1b[35m'); // magenta
  });
});

describe('renderStatusLine', () => {
  let mockStream: NodeJS.WriteStream;
  let writeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeSpy = vi.fn();
    mockStream = {
      isTTY: true,
      columns: 80,
      write: writeSpy,
    } as unknown as NodeJS.WriteStream;
  });

  it('renders text with dim styling', () => {
    renderStatusLine('Status text', mockStream);

    // Should write: save cursor, newline, clear line, dim text, reset, restore cursor
    expect(writeSpy).toHaveBeenCalled();
    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).toContain('\x1b[2m'); // dim
    expect(allWrites).toContain('Status text');
    expect(allWrites).toContain('\x1b[0m'); // reset
  });

  it('handles null text by clearing status line', () => {
    renderStatusLine(null, mockStream);

    // Should write: clear line + \r (no text)
    expect(writeSpy).toHaveBeenCalled();
    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).toContain('\x1b[2K'); // clear line
    expect(allWrites).toContain('\r'); // carriage return
    expect(allWrites).not.toContain('Status'); // no text
  });

  it('handles empty string by clearing status line', () => {
    renderStatusLine('', mockStream);

    expect(writeSpy).toHaveBeenCalled();
    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).toContain('\x1b[2K'); // clear line
    expect(allWrites).not.toContain('\x1b[2m'); // no dim styling (no text)
  });

  it('no-op when isTTY is false (EC-4)', () => {
    mockStream.isTTY = false;
    renderStatusLine('Status text', mockStream);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('suppresses display when terminal width below minimum (EC-5 variant)', () => {
    mockStream.columns = STATUS_LINE_MIN_WIDTH - 1;
    renderStatusLine('Status text', mockStream);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('displays when terminal width equals minimum', () => {
    mockStream.columns = STATUS_LINE_MIN_WIDTH;
    renderStatusLine('Status', mockStream);

    expect(writeSpy).toHaveBeenCalled();
  });

  it('truncates text exceeding terminal width with ellipsis', () => {
    mockStream.columns = 20;
    const longText = 'This is a very long status message that exceeds width';

    renderStatusLine(longText, mockStream);

    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).toContain('...');
    // Text should be truncated to fit within 20 columns
    // eslint-disable-next-line no-control-regex -- Testing ANSI escape codes
    const dimMatch = /\x1b\[2m(.*?)\x1b\[0m/.exec(allWrites);
    expect(dimMatch).toBeTruthy();
    const renderedText = dimMatch?.[1] ?? '';
    expect(renderedText.length).toBeLessThanOrEqual(20);
  });

  it('strips ANSI codes from input (IC-2)', () => {
    const textWithAnsi = '\x1b[31mRed text\x1b[0m with codes';
    renderStatusLine(textWithAnsi, mockStream);

    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    // Should contain dim styling we add, but not the red color from input
    // eslint-disable-next-line no-control-regex -- Testing ANSI escape codes
    const dimMatch = /\x1b\[2m(.*?)\x1b\[0m/.exec(allWrites);
    expect(dimMatch?.[1]).toBe('Red text with codes');
  });

  it('strips newlines from text (IC-2)', () => {
    const textWithNewlines = 'Line 1\nLine 2\r\nLine 3';
    renderStatusLine(textWithNewlines, mockStream);

    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    // eslint-disable-next-line no-control-regex -- Testing ANSI escape codes
    const dimMatch = /\x1b\[2m(.*?)\x1b\[0m/.exec(allWrites);
    expect(dimMatch?.[1]).toBe('Line 1 Line 2 Line 3');
    expect(dimMatch?.[1]).not.toContain('\n');
    expect(dimMatch?.[1]).not.toContain('\r');
  });

  it('catches and ignores write errors (EC-6)', () => {
    writeSpy.mockImplementation(() => {
      throw new Error('Broken pipe');
    });

    // Should not throw
    expect(() => {
      renderStatusLine('Test', mockStream);
    }).not.toThrow();
  });

  it('handles whitespace-only text as empty', () => {
    renderStatusLine('   ', mockStream);

    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).not.toContain('\x1b[2m'); // no dim styling
  });

  it('falls back to 80 columns when stream.columns is undefined (EC-5)', () => {
    // Create stream with undefined columns (edge case for misconfigured TTY)
    const streamWithUndefinedCols = {
      isTTY: true,
      columns: undefined,
      write: writeSpy,
    } as unknown as NodeJS.WriteStream;

    const text = 'A'.repeat(100); // Text longer than 80 chars
    renderStatusLine(text, streamWithUndefinedCols);

    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    // eslint-disable-next-line no-control-regex -- Testing ANSI escape codes
    const dimMatch = /\x1b\[2m(.*?)\x1b\[0m/.exec(allWrites);
    expect(dimMatch).toBeTruthy();
    const renderedText = dimMatch?.[1] ?? '';
    // Should truncate to 80 (default fallback) - ellipsis length
    expect(renderedText.length).toBeLessThanOrEqual(80);
    expect(renderedText).toContain('...');
  });

  it('handles 10000-char input without performance regression (BC-7, PC-1)', () => {
    const longText = 'A'.repeat(10000);
    const startTime = performance.now();

    renderStatusLine(longText, mockStream);

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should complete in under 10ms
    expect(duration).toBeLessThan(10);
    expect(writeSpy).toHaveBeenCalled();
  });

  it('rapid sequential calls display latest value (PC-2)', () => {
    // Simulate rapid updates (e.g., status text changing quickly)
    renderStatusLine('Status 1', mockStream);
    renderStatusLine('Status 2', mockStream);
    renderStatusLine('Status 3', mockStream);

    // All three calls should write
    expect(writeSpy).toHaveBeenCalled();
    const callCount = writeSpy.mock.calls.length;
    expect(callCount).toBeGreaterThan(0);

    // Last set of writes should contain latest status
    const lastWrites = writeSpy.mock.calls
      .slice(-5) // Get last 5 calls (enough to capture one complete render)
      .map((call) => call[0] as string)
      .join('');
    expect(lastWrites).toContain('Status 3');

    // Verify each call replaces previous by checking all writes contain all statuses
    const allWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).toContain('Status 1');
    expect(allWrites).toContain('Status 2');
    expect(allWrites).toContain('Status 3');
  });
});

describe('clearStatusLine', () => {
  let mockStream: NodeJS.WriteStream;
  let writeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeSpy = vi.fn();
    mockStream = {
      isTTY: true,
      columns: 80,
      write: writeSpy,
    } as unknown as NodeJS.WriteStream;
  });

  it('erases status line using clear-line + carriage return', () => {
    clearStatusLine(mockStream);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith('\x1b[2K\r');
  });

  it('no-op when isTTY is false (EC-7)', () => {
    mockStream.isTTY = false;
    clearStatusLine(mockStream);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('catches and ignores write errors (EC-8)', () => {
    writeSpy.mockImplementation(() => {
      throw new Error('Write failed');
    });

    // Should not throw
    expect(() => {
      clearStatusLine(mockStream);
    }).not.toThrow();
  });

  it('is idempotent - clearing twice produces same result', () => {
    clearStatusLine(mockStream);
    const firstCallCount = writeSpy.mock.calls.length;
    const firstWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');

    writeSpy.mockClear();
    clearStatusLine(mockStream);
    const secondCallCount = writeSpy.mock.calls.length;
    const secondWrites = writeSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');

    expect(firstCallCount).toBe(secondCallCount);
    expect(firstWrites).toBe(secondWrites);
  });
});

describe('terminalLog', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;
  let stderrWriteSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stderrWriteSpy = vi.fn().mockReturnValue(true) as ReturnType<typeof vi.fn>;
    vi.spyOn(process.stderr, 'write').mockImplementation(stderrWriteSpy);
    // Make stderr appear as TTY for testing
    Object.defineProperty(process.stderr, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stderr, 'columns', {
      value: 80,
      configurable: true,
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('logs line without state parameter (backward compatible)', () => {
    terminalLog('Test message');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Test message');
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('strips carriage returns from line', () => {
    terminalLog('Test\rMessage\r\n');

    expect(consoleSpy).toHaveBeenCalledWith('TestMessage\n');
  });

  it('logs without re-rendering when state.currentStatusText is null', () => {
    const state: FormatterState = {
      currentStatusText: null,
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    terminalLog('Test message', state);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Test message');
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('re-renders status line when state.currentStatusText is non-null', () => {
    const state: FormatterState = {
      currentStatusText: 'Current status text',
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    terminalLog('Test message', state);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Test message');
    // Should call renderStatusLine with the status text
    expect(stderrWriteSpy).toHaveBeenCalled();
    const allWrites = stderrWriteSpy.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(allWrites).toContain('Current status text');
  });

  it('does not re-render when state is undefined', () => {
    terminalLog('Test message', undefined);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('clears status line before log and re-renders after', () => {
    const state: FormatterState = {
      currentStatusText: 'Active status',
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    terminalLog('Log line', state);

    // stderr writes happen in order: clear (before log), render (after log)
    // clear = \x1b[2K\r (1 write)
    // render = \x1b[2K\r + dim-text\r (2 writes)
    const calls = stderrWriteSpy.mock.calls.map((call: [string]) => call[0]);

    // First: clearStatusLine (1 write)
    expect(calls[0]).toBe('\x1b[2K\r');

    // console.log happens between clear and render (verified by consoleSpy)
    expect(consoleSpy).toHaveBeenCalledWith('Log line');

    // Second: renderStatusLine (2 writes: clear + text\r)
    expect(calls[1]).toBe('\x1b[2K\r');
    expect(calls[2]).toContain('Active status');
    expect(calls[2]).toMatch(/\r$/); // ends with \r to park cursor
  });
});

describe('bindFormatterState / unbindFormatterState', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;
  let stderrWriteSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stderrWriteSpy = vi.fn().mockReturnValue(true) as ReturnType<typeof vi.fn>;
    vi.spyOn(process.stderr, 'write').mockImplementation(stderrWriteSpy);
    Object.defineProperty(process.stderr, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stderr, 'columns', {
      value: 80,
      configurable: true,
    });
  });

  afterEach(() => {
    unbindFormatterState();
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('bound state causes terminalLog to re-render without explicit state param', () => {
    const state: FormatterState = {
      currentStatusText: 'Bound status',
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    bindFormatterState(state);
    terminalLog('Test line');

    expect(consoleSpy).toHaveBeenCalledWith('Test line');
    const allWrites = stderrWriteSpy.mock.calls
      .map((call: [string]) => call[0])
      .join('');
    expect(allWrites).toContain('Bound status');
  });

  it('unbind stops re-rendering on subsequent terminalLog calls', () => {
    const state: FormatterState = {
      currentStatusText: 'Will unbind',
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    bindFormatterState(state);
    unbindFormatterState();
    stderrWriteSpy.mockClear();

    terminalLog('After unbind');

    expect(consoleSpy).toHaveBeenCalledWith('After unbind');
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('explicit state param takes precedence over bound state', () => {
    const boundState: FormatterState = {
      currentStatusText: 'Bound text',
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    const explicitState: FormatterState = {
      ...boundState,
      currentStatusText: 'Explicit text',
    };

    bindFormatterState(boundState);
    terminalLog('Test', explicitState);

    const allWrites = stderrWriteSpy.mock.calls
      .map((call: [string]) => call[0])
      .join('');
    expect(allWrites).toContain('Explicit text');
    expect(allWrites).not.toContain('Bound text');
  });

  it('no-op when bound state has null currentStatusText', () => {
    const state: FormatterState = {
      currentStatusText: null,
      pendingTools: [],
      lastToolTime: null,
      activeTasks: new Map(),
      toolToTaskId: new Map(),
      nextLabelIndex: 0,
      currentTaskId: null,
      toolStartTimes: new Map(),
      currentStep: 1,
      suppressStepCompletion: false,
      lastStepDurationMs: null,
      stats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      runStats: {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        toolUses: 0,
        outputLines: 0,
      },
      stepStartTime: null,
      taskStatsMap: new Map(),
      taskStartTimes: new Map(),
      taskReadyQueue: [],
      taskPendingQueue: [],
    };

    bindFormatterState(state);
    terminalLog('No status');

    expect(consoleSpy).toHaveBeenCalledWith('No status');
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });
});
