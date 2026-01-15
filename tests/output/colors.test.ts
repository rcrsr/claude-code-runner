import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  printRunner,
  stripAnsi,
  truncate,
  formatDuration,
  shortenPath,
  formatTimestamp,
  timestampPrefix,
} from '../../src/output/colors.js';

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
  let consoleSpy: ReturnType<typeof vi.spyOn>;

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
