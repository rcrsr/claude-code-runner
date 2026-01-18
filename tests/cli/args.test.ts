import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock template loaders
vi.mock('../../src/templates/command.js', () => ({
  loadCommandTemplate: vi.fn(),
}));

// Mock script loader
vi.mock('../../src/script/index.js', () => ({
  loadScript: vi.fn(),
}));

import { parseArgs, parseCommandLine, printUsage } from '../../src/cli/args.js';
import { loadScript } from '../../src/script/index.js';
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

    it('parses script subcommand', () => {
      vi.mocked(loadScript).mockReturnValue({
        lines: [
          { type: 'prompt', text: 'hello' },
          { type: 'prompt', text: 'world' },
        ],
        frontmatter: {},
      });

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
  });

  describe('script subcommand', () => {
    it('loads script with file path', () => {
      vi.mocked(loadScript).mockReturnValue({
        lines: [
          { type: 'prompt', text: 'line1' },
          { type: 'prompt', text: 'line2' },
        ],
        frontmatter: {},
      });

      const result = parseArgs(['script', 'test.script']);

      expect(loadScript).toHaveBeenCalledWith('test.script', []);
      expect(result.scriptMode).toBe(true);
      expect(result.scriptFile).toBe('test.script');
    });

    it('passes arguments to script loader', () => {
      vi.mocked(loadScript).mockReturnValue({
        lines: [{ type: 'prompt', text: 'with arg1' }],
        frontmatter: {},
      });

      const result = parseArgs(['script', 'test.script', 'arg1', 'arg2']);

      expect(loadScript).toHaveBeenCalledWith('test.script', ['arg1', 'arg2']);
      expect(result.scriptArgs).toEqual(['arg1', 'arg2']);
    });

    it('uses frontmatter model from script', () => {
      vi.mocked(loadScript).mockReturnValue({
        lines: [{ type: 'prompt', text: 'test' }],
        frontmatter: { model: 'opus' },
      });

      const result = parseArgs(['script', 'test.script']);

      expect(result.config.model).toBe('opus');
    });

    it('exits with error when file missing', () => {
      expect(() => parseArgs(['script'])).toThrow('process.exit(1)');
      expect(errorSpy).toHaveBeenCalledWith('Error: script file required');
    });

    it('propagates error when script not found', () => {
      vi.mocked(loadScript).mockImplementation(() => {
        throw new Error('Script not found: missing.script');
      });

      expect(() => parseArgs(['script', 'missing.script'])).toThrow(
        'Script not found: missing.script'
      );
    });

    it('sets scriptMode to true', () => {
      vi.mocked(loadScript).mockReturnValue({
        lines: [{ type: 'prompt', text: 'test' }],
        frontmatter: {},
      });

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

    it('parses --log flag', () => {
      const result = parseArgs(['--log', 'prompt', 'test']);

      expect(result.config.enableLog).toBe(true);
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
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'loaded',
        frontmatter: {},
      });

      const result = parseCommandLine('command my-cmd');

      expect(loadCommandTemplate).toHaveBeenCalledWith('my-cmd', []);
      expect(result.prompt).toBe('loaded');
    });

    it('passes arguments to template', () => {
      vi.mocked(loadCommandTemplate).mockReturnValue({
        prompt: 'loaded',
        frontmatter: {},
      });

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
    expect(output).toContain('--log');
  });

  it('includes signal documentation', () => {
    printUsage();

    const output = logSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('RUNNER::REPEAT_STEP');
    expect(output).toContain('RUNNER::BLOCKED');
    expect(output).toContain('RUNNER::ERROR');
  });
});
