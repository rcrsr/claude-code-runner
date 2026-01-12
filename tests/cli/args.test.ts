import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock command template loader
vi.mock('../../src/templates/command.js', () => ({
  loadCommandTemplate: vi.fn(),
}));

import * as fs from 'fs';

import { parseArgs, parseCommandLine, printUsage } from '../../src/cli/args.js';
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
    it('defaults to prompt when no subcommand given', () => {
      const result = parseArgs([]);

      expect(result.subcommand).toBe('prompt');
    });

    it('parses prompt subcommand', () => {
      const result = parseArgs(['prompt', 'hello', 'world']);

      expect(result.subcommand).toBe('prompt');
      expect(result.prompt).toBe('hello world');
    });

    it('parses command subcommand', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue('template content');

      const result = parseArgs(['command', 'test-cmd']);

      expect(result.subcommand).toBe('command');
      expect(loadCommandTemplate).toHaveBeenCalledWith('test-cmd', []);
    });

    it('parses script subcommand', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('prompt hello\nprompt world');

      const result = parseArgs(['script', 'test.script']);

      expect(result.subcommand).toBe('script');
      expect(result.scriptMode).toBe(true);
    });
  });

  describe('prompt subcommand', () => {
    it('joins multiple words into prompt', () => {
      const result = parseArgs(['prompt', 'hello', 'world', 'test']);

      expect(result.prompt).toBe('hello world test');
    });

    it('uses default prompt when no text provided', () => {
      const result = parseArgs(['prompt']);

      expect(result.prompt).toBe('Tell me about this project');
    });

    it('uses default prompt when only options given', () => {
      const result = parseArgs(['--quiet']);

      expect(result.prompt).toBe('Tell me about this project');
    });
  });

  describe('command subcommand', () => {
    it('loads command template with name', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue('loaded template');

      const result = parseArgs(['command', 'my-cmd']);

      expect(loadCommandTemplate).toHaveBeenCalledWith('my-cmd', []);
      expect(result.prompt).toBe('loaded template');
    });

    it('passes additional args to template', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue('template with args');

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
  });

  describe('script subcommand', () => {
    it('reads script file and parses lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('prompt line1\nprompt line2');

      const result = parseArgs(['script', 'test.script']);

      expect(result.scriptLines).toEqual(['prompt line1', 'prompt line2']);
      expect(result.scriptMode).toBe(true);
    });

    it('filters empty lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        'prompt line1\n\nprompt line2\n'
      );

      const result = parseArgs(['script', 'test.script']);

      expect(result.scriptLines).toEqual(['prompt line1', 'prompt line2']);
    });

    it('filters comments', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        '# comment\nprompt line1\n# another comment\nprompt line2'
      );

      const result = parseArgs(['script', 'test.script']);

      expect(result.scriptLines).toEqual(['prompt line1', 'prompt line2']);
    });

    it('exits with error when file missing', () => {
      expect(() => parseArgs(['script'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: script file required');
    });

    it('exits with error when file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => parseArgs(['script', 'missing.script'])).toThrow(
        'process.exit(1)'
      );
      expect(errorSpy).toHaveBeenCalledWith(
        'Error: script file not found: missing.script'
      );
    });

    it('sets scriptMode to true', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('prompt test');

      const result = parseArgs(['script', 'test.script']);

      expect(result.scriptMode).toBe(true);
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

    it('parses --no-log flag', () => {
      const result = parseArgs(['--no-log', 'prompt', 'test']);

      expect(result.config.enableLog).toBe(false);
    });

    it('handles multiple options', () => {
      const result = parseArgs(['--quiet', '--no-log', 'prompt', 'test']);

      expect(result.config.verbosity).toBe('quiet');
      expect(result.config.enableLog).toBe(false);
    });

    it('options can appear in any position', () => {
      const result = parseArgs(['prompt', '--quiet', 'test', '--no-log']);

      expect(result.config.verbosity).toBe('quiet');
      expect(result.config.enableLog).toBe(false);
      expect(result.prompt).toBe('test');
    });
  });

  describe('config output', () => {
    it('returns verbosity in config', () => {
      const result = parseArgs(['--verbose']);

      expect(result.config).toHaveProperty('verbosity', 'verbose');
    });

    it('returns enableLog in config', () => {
      const result = parseArgs(['--no-log']);

      expect(result.config).toHaveProperty('enableLog', false);
    });

    it('defaults enableLog to undefined when not specified', () => {
      const result = parseArgs(['prompt', 'test']);

      expect(result.config.enableLog).toBe(true);
    });
  });
});

describe('parseCommandLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('prompt command', () => {
    it('returns prompt text after prompt keyword', () => {
      const result = parseCommandLine('prompt hello world');

      expect(result.prompt).toBe('hello world');
    });

    it('handles multi-word prompts', () => {
      const result = parseCommandLine('prompt this is a longer prompt');

      expect(result.prompt).toBe('this is a longer prompt');
    });
  });

  describe('command command', () => {
    it('loads template for command name', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue('loaded');

      const result = parseCommandLine('command my-cmd');

      expect(loadCommandTemplate).toHaveBeenCalledWith('my-cmd', []);
      expect(result.prompt).toBe('loaded');
    });

    it('passes arguments to template', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue('loaded');

      parseCommandLine('command my-cmd arg1 arg2');

      expect(loadCommandTemplate).toHaveBeenCalledWith('my-cmd', [
        'arg1',
        'arg2',
      ]);
    });

    it('throws when command name missing', () => {
      expect(() => parseCommandLine('command')).toThrow(
        'command requires a name'
      );
    });
  });

  describe('script command', () => {
    it('throws error for nested script', () => {
      expect(() => parseCommandLine('script nested.script')).toThrow(
        'script cannot be nested'
      );
    });
  });

  describe('raw prompt', () => {
    it('treats unknown commands as raw prompt', () => {
      const result = parseCommandLine('do something');

      expect(result.prompt).toBe('do something');
    });

    it('trims whitespace from raw prompt', () => {
      const result = parseCommandLine('  do something  ');

      expect(result.prompt).toBe('do something');
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
    expect(output).toContain('script');
  });

  it('includes all options', () => {
    printUsage();

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('--quiet');
    expect(output).toContain('--verbose');
    expect(output).toContain('--no-log');
  });

  it('includes signal documentation', () => {
    printUsage();

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('RUNNER::DONE');
    expect(output).toContain('RUNNER::CONTINUE');
    expect(output).toContain('RUNNER::BLOCKED');
    expect(output).toContain('RUNNER::ERROR');
  });
});
