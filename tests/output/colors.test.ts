import { describe, it, expect } from 'vitest';
import {
  stripAnsi,
  truncate,
  formatDuration,
  shortenPath,
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
    expect(formatDuration(125000)).toBe('2m5s');
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
