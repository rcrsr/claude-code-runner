import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaudeProcessOptions } from '../../src/process/pty.js';
import { spawnClaude } from '../../src/process/pty.js';
import {
  createMockFormatterState,
  createMockLogger,
} from '../helpers/mocks.js';

// Mock node-pty
const mockOnData = vi.fn();
const mockOnExit = vi.fn();

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: mockOnData,
    onExit: mockOnExit,
  })),
}));

// Mock formatter functions
vi.mock('../../src/output/formatter.js', () => ({
  flushPendingTools: vi.fn(),
  formatMessage: vi.fn(() => ''),
  resetFormatterState: vi.fn(),
}));

// Mock stream parser
const mockParserProcess = vi.fn(() => []);
vi.mock('../../src/parsers/stream.js', () => ({
  createStreamParser: vi.fn(() => ({
    process: mockParserProcess,
  })),
}));

// Import mocked modules for assertions
import * as pty from 'node-pty';
import {
  flushPendingTools,
  formatMessage,
  resetFormatterState,
} from '../../src/output/formatter.js';
import { createStreamParser } from '../../src/parsers/stream.js';

describe('spawnClaude', () => {
  let options: ClaudeProcessOptions;
  let onDataCallback: (data: string) => void;
  let onExitCallback: (e: { exitCode: number }) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture callbacks when registered
    mockOnData.mockImplementation((cb: (data: string) => void) => {
      onDataCallback = cb;
    });
    mockOnExit.mockImplementation((cb: (e: { exitCode: number }) => void) => {
      onExitCallback = cb;
    });

    options = {
      prompt: 'test prompt',
      cwd: '/test/dir',
      verbosity: 'normal',
      logger: createMockLogger(),
      formatterState: createMockFormatterState(),
      parallelThresholdMs: 100,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('process spawning', () => {
    it('spawns pty with claude command', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });
      await promise;

      expect(pty.spawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('spawns pty with correct arguments', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });
      await promise;

      expect(pty.spawn).toHaveBeenCalledWith(
        'claude',
        [
          '-p',
          'test prompt',
          '--dangerously-skip-permissions',
          '--verbose',
          '--output-format',
          'stream-json',
        ],
        expect.any(Object)
      );
    });

    it('spawns pty with correct options', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });
      await promise;

      expect(pty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 200,
          rows: 50,
          cwd: '/test/dir',
        })
      );
    });

    it('resets formatter state before run', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });
      await promise;

      expect(resetFormatterState).toHaveBeenCalledWith(options.formatterState);
    });

    it('creates stream parser', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });
      await promise;

      expect(createStreamParser).toHaveBeenCalled();
    });
  });

  describe('data handling', () => {
    it('processes incoming data through stream parser', async () => {
      const promise = spawnClaude(options);

      onDataCallback('{"type":"system"}\n');
      onExitCallback({ exitCode: 0 });

      await promise;

      expect(mockParserProcess).toHaveBeenCalledWith('{"type":"system"}\n');
    });

    it('formats parsed messages', async () => {
      mockParserProcess.mockReturnValueOnce([
        { type: 'system', subtype: 'init' },
      ]);

      const promise = spawnClaude(options);

      onDataCallback('{"type":"system"}\n');
      onExitCallback({ exitCode: 0 });

      await promise;

      expect(formatMessage).toHaveBeenCalledWith(
        { type: 'system', subtype: 'init' },
        options.formatterState,
        'normal',
        options.logger,
        100
      );
    });

    it('logs raw JSON messages to logger', async () => {
      const msg = { type: 'system', subtype: 'init' };
      mockParserProcess.mockReturnValueOnce([msg]);

      const promise = spawnClaude(options);

      onDataCallback('{"type":"system"}\n');
      onExitCallback({ exitCode: 0 });

      await promise;

      expect(options.logger.log).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('accumulates claudeText from formatMessage', async () => {
      vi.mocked(formatMessage)
        .mockReturnValueOnce('Hello ')
        .mockReturnValueOnce('world');
      mockParserProcess
        .mockReturnValueOnce([{ type: 'assistant' }])
        .mockReturnValueOnce([{ type: 'assistant' }]);

      const promise = spawnClaude(options);

      onDataCallback('msg1\n');
      onDataCallback('msg2\n');
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(result.claudeText).toBe('Hello world');
    });

    it('handles empty data chunks', async () => {
      mockParserProcess.mockReturnValue([]);

      const promise = spawnClaude(options);

      onDataCallback('');
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(result.claudeText).toBe('');
    });
  });

  describe('exit handling', () => {
    it('resolves with exitCode 0 on success', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(result.exitCode).toBe(0);
    });

    it('resolves with non-zero exitCode on failure', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 1 });

      const result = await promise;

      expect(result.exitCode).toBe(1);
    });

    it('calculates duration in seconds', async () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call is runStart, subsequent calls during exit
        return callCount === 1 ? 1000 : 6000;
      });

      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(result.duration).toBe(5); // (6000 - 1000) / 1000 = 5
    });

    it('flushes pending tools on exit', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });
      await promise;

      expect(flushPendingTools).toHaveBeenCalledWith(
        options.formatterState,
        'normal'
      );
    });

    it('returns accumulated claudeText', async () => {
      vi.mocked(formatMessage).mockReturnValue('test output');
      mockParserProcess.mockReturnValue([{ type: 'assistant' }]);

      const promise = spawnClaude(options);

      onDataCallback('data\n');
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(result.claudeText).toBe('test output');
    });
  });

  describe('edge cases', () => {
    it('handles parser returning empty array', async () => {
      mockParserProcess.mockReturnValue([]);

      const promise = spawnClaude(options);

      onDataCallback('invalid\n');
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(formatMessage).not.toHaveBeenCalled();
      expect(result.claudeText).toBe('');
    });

    it('handles immediate exit', async () => {
      const promise = spawnClaude(options);
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(result.exitCode).toBe(0);
      expect(result.claudeText).toBe('');
    });

    it('handles multiple messages in one data chunk', async () => {
      mockParserProcess.mockReturnValueOnce([
        { type: 'system' },
        { type: 'assistant' },
      ]);
      vi.mocked(formatMessage)
        .mockReturnValueOnce('')
        .mockReturnValueOnce('text');

      const promise = spawnClaude(options);

      onDataCallback('{"type":"system"}\n{"type":"assistant"}\n');
      onExitCallback({ exitCode: 0 });

      const result = await promise;

      expect(formatMessage).toHaveBeenCalledTimes(2);
      expect(result.claudeText).toBe('text');
    });
  });
});
