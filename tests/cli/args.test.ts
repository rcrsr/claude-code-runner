import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock template loaders
vi.mock('../../src/templates/command.js', () => ({
  loadCommandTemplate: vi.fn(),
}));

// Mock rill script detection
vi.mock('../../src/rill/index.js', () => ({
  isRillScript: vi.fn((file: string) => file.endsWith('.rill')),
}));

import { parseArgs, printUsage } from '../../src/cli/args.js';
import { loadCommandTemplate } from '../../src/templates/command.js';

describe('parseArgs', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process.exit to throw
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('subcommand parsing', () => {
    it('exits with error when no subcommand given', () => {
      expect(() => parseArgs([])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: subcommand required');
    });

    it('exits with error for unknown subcommand', () => {
      expect(() => parseArgs(['--invalid'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith(
        "Error: unknown subcommand '--invalid'"
      );
    });

    it('parses prompt subcommand', () => {
      const result = parseArgs(['prompt', 'hello', 'world']);

      expect(result.subcommand).toBe('prompt');
      expect(result.prompt).toBe('hello world');
    });

    it('parses command subcommand', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'template content',
        frontmatter: {},
      });

      const result = parseArgs(['command', 'test-cmd']);

      expect(result.subcommand).toBe('command');
      expect(loadCommandTemplate).toHaveBeenCalledWith('test-cmd', []);
    });

    it('parses script subcommand with .rill file', () => {
      const result = parseArgs(['script', 'test.rill']);

      expect(result.subcommand).toBe('script');
      expect(result.scriptFile).toBe('test.rill');
    });

    it('rejects non-.rill script files', () => {
      expect(() => parseArgs(['script', 'test.txt'])).toThrow(
        'process.exit(1)'
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'Error: script must be a .rill file'
      );
    });
  });

  describe('prompt subcommand', () => {
    it('joins multiple words into prompt', () => {
      const result = parseArgs(['prompt', 'hello', 'world', 'test']);

      expect(result.prompt).toBe('hello world test');
    });

    it('exits with error when no text provided', () => {
      expect(() => parseArgs(['prompt'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: prompt text required');
    });
  });

  describe('command subcommand', () => {
    it('loads command template with name', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'loaded template',
        frontmatter: {},
      });

      const result = parseArgs(['command', 'my-cmd']);

      expect(loadCommandTemplate).toHaveBeenCalledWith('my-cmd', []);
      expect(result.prompt).toBe('loaded template');
    });

    it('passes additional args to template', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'template with args',
        frontmatter: {},
      });

      parseArgs(['command', 'my-cmd', 'arg1', 'arg2']);

      expect(loadCommandTemplate).toHaveBeenCalledWith('my-cmd', [
        'arg1',
        'arg2',
      ]);
    });

    it('exits with error when name missing', () => {
      expect(() => parseArgs(['command'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: command name required');
    });

    it('uses frontmatter model from command', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'test',
        frontmatter: { model: 'opus' },
      });

      const result = parseArgs(['command', 'my-cmd']);

      expect(result.config.model).toBe('opus');
    });
  });

  describe('script subcommand', () => {
    it('sets scriptFile and scriptArgs', () => {
      const result = parseArgs(['script', 'test.rill', 'arg1', 'arg2']);

      expect(result.scriptFile).toBe('test.rill');
      expect(result.scriptArgs).toEqual(['arg1', 'arg2']);
    });

    it('exits with error when file missing', () => {
      expect(() => parseArgs(['script'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: script file required');
    });
  });

  describe('skill subcommand', () => {
    it('constructs slash command without args', () => {
      const result = parseArgs(['skill', 'commit']);

      expect(result.subcommand).toBe('skill');
      expect(result.prompt).toBe('/commit');
    });

    it('constructs slash command with single arg', () => {
      const result = parseArgs(['skill', 'review', 'file.ts']);

      expect(result.subcommand).toBe('skill');
      expect(result.prompt).toBe('/review file.ts');
    });

    it('constructs slash command with multiple args', () => {
      const result = parseArgs(['skill', 'review', '--strict', 'file.ts']);

      expect(result.subcommand).toBe('skill');
      expect(result.prompt).toBe('/review --strict file.ts');
    });

    it('handles skill args with spaces', () => {
      const result = parseArgs(['skill', 'search', 'query', 'with', 'spaces']);

      expect(result.prompt).toBe('/search query with spaces');
    });

    it('exits with error when skill name missing', () => {
      expect(() => parseArgs(['skill'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: skill name required');
    });

    it('sets displayCommand to skill name only', () => {
      const result = parseArgs(['skill', 'commit']);

      expect(result.displayCommand).toBe('commit');
    });

    it('sets displayCommand to skill name with args', () => {
      const result = parseArgs(['skill', 'commit', '--amend']);

      expect(result.displayCommand).toBe('commit --amend');
    });

    it('sets displayCommand for multiple args', () => {
      const result = parseArgs(['skill', 'review', '--strict', 'src/']);

      expect(result.displayCommand).toBe('review --strict src/');
    });

    it('works with options before subcommand', () => {
      const result = parseArgs(['--verbose', 'skill', 'commit']);

      expect(result.config.verbosity).toBe('verbose');
      expect(result.prompt).toBe('/commit');
    });

    it('works with options after subcommand', () => {
      const result = parseArgs(['skill', '--quiet', 'commit']);

      expect(result.config.verbosity).toBe('quiet');
      expect(result.prompt).toBe('/commit');
    });

    it('works with model option', () => {
      const result = parseArgs(['--model', 'opus', 'skill', 'review']);

      expect(result.config.model).toBe('opus');
      expect(result.prompt).toBe('/review');
    });

    it('does not set scriptFile or scriptArgs', () => {
      const result = parseArgs(['skill', 'commit', 'arg1']);

      expect(result.scriptFile).toBeNull();
      expect(result.scriptArgs).toEqual([]);
    });
  });

  describe('option parsing', () => {
    it('parses --quiet flag', () => {
      const result = parseArgs(['--quiet', 'prompt', 'test']);

      expect(result.config.verbosity).toBe('quiet');
    });

    it('parses --normal flag', () => {
      const result = parseArgs(['--normal', 'prompt', 'test']);

      expect(result.config.verbosity).toBe('normal');
    });

    it('parses --verbose flag', () => {
      const result = parseArgs(['--verbose', 'prompt', 'test']);

      expect(result.config.verbosity).toBe('verbose');
    });

    it('parses --log flag', () => {
      const result = parseArgs(['--log', 'prompt', 'test']);

      expect(result.config.enableLog).toBe(true);
    });

    it('parses --model flag', () => {
      const result = parseArgs(['--model', 'opus', 'prompt', 'test']);

      expect(result.config.model).toBe('opus');
    });

    it('parses -m flag', () => {
      const result = parseArgs(['-m', 'haiku', 'prompt', 'test']);

      expect(result.config.model).toBe('haiku');
    });

    it('parses --model=value format', () => {
      const result = parseArgs(['--model=sonnet', 'prompt', 'test']);

      expect(result.config.model).toBe('sonnet');
    });

    it('parses --deaddrop flag', () => {
      const result = parseArgs(['--deaddrop', 'prompt', 'test']);

      expect(result.config.deaddrop).toBe(true);
    });

    it('handles multiple options', () => {
      const result = parseArgs(['--quiet', '--log', 'prompt', 'test']);

      expect(result.config.verbosity).toBe('quiet');
      expect(result.config.enableLog).toBe(true);
    });

    it('options can appear in any position', () => {
      const result = parseArgs(['prompt', '--quiet', 'test', '--log']);

      expect(result.config.verbosity).toBe('quiet');
      expect(result.config.enableLog).toBe(true);
      expect(result.prompt).toBe('test');
    });

    it('CLI model overrides frontmatter model', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'test',
        frontmatter: { model: 'opus' },
      });

      const result = parseArgs(['--model', 'haiku', 'command', 'my-cmd']);

      expect(result.config.model).toBe('haiku');
    });
  });

  describe('config output', () => {
    it('returns verbosity in config', () => {
      const result = parseArgs(['--verbose', 'prompt', 'test']);

      expect(result.config).toHaveProperty('verbosity', 'verbose');
    });

    it('returns enableLog in config', () => {
      const result = parseArgs(['--log', 'prompt', 'test']);

      expect(result.config).toHaveProperty('enableLog', true);
    });

    it('defaults enableLog to false when not specified', () => {
      const result = parseArgs(['prompt', 'test']);

      expect(result.config.enableLog).toBe(false);
    });
  });
});

describe('printUsage', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints usage information to console', () => {
    printUsage();

    expect(logSpy).toHaveBeenCalled();
  });

  it('includes all subcommands', () => {
    printUsage();

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('prompt');
    expect(output).toContain('command');
    expect(output).toContain('skill');
    expect(output).toContain('script');
  });

  it('includes all options', () => {
    printUsage();

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('--quiet');
    expect(output).toContain('--verbose');
    expect(output).toContain('--log');
    expect(output).toContain('--model');
    expect(output).toContain('--deaddrop');
  });

  it('mentions .rill files for script subcommand', () => {
    printUsage();

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('.rill');
  });
});
