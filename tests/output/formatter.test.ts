import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantMessage } from '../../src/types/claude.js';
import {
  createFormatterState,
  flushPendingTools,
  formatMessage,
  resetFormatterState,
} from '../../src/output/formatter.js';
import {
  createMockFormatterState,
  createMockLogger,
  createResultMessage,
  createSystemInitMessage,
  createTextMessage,
  createToolResultMessage,
  createToolUseMessage,
} from '../helpers/mocks.js';

describe('createFormatterState', () => {
  it('returns empty pendingTools array', () => {
    const state = createFormatterState();
    expect(state.pendingTools).toEqual([]);
  });

  it('returns null lastToolTime', () => {
    const state = createFormatterState();
    expect(state.lastToolTime).toBeNull();
  });

  it('returns null activeTask', () => {
    const state = createFormatterState();
    expect(state.activeTask).toBeNull();
  });

  it('returns empty toolStartTimes map', () => {
    const state = createFormatterState();
    expect(state.toolStartTimes.size).toBe(0);
  });
});

describe('resetFormatterState', () => {
  it('clears pendingTools array', () => {
    const state = createMockFormatterState();
    state.pendingTools = [{ name: 'Read', input: {}, id: 'tool-1' }];

    resetFormatterState(state);

    expect(state.pendingTools).toEqual([]);
  });

  it('resets lastToolTime to null', () => {
    const state = createMockFormatterState();
    state.lastToolTime = 1000;

    resetFormatterState(state);

    expect(state.lastToolTime).toBeNull();
  });

  it('resets activeTask to null', () => {
    const state = createMockFormatterState();
    state.activeTask = { name: 'test', description: 'test', id: 'task-1' };

    resetFormatterState(state);

    expect(state.activeTask).toBeNull();
  });

  it('clears toolStartTimes map', () => {
    const state = createMockFormatterState();
    state.toolStartTimes.set('tool-1', 1000);

    resetFormatterState(state);

    expect(state.toolStartTimes.size).toBe(0);
  });
});

describe('flushPendingTools', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('does nothing when no pending tools', () => {
    const state = createMockFormatterState();

    flushPendingTools(state, 'normal');

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('clears pending tools without output in quiet mode', () => {
    const state = createMockFormatterState();
    state.pendingTools = [{ name: 'Read', input: {}, id: 'tool-1' }];

    flushPendingTools(state, 'quiet');

    expect(state.pendingTools).toEqual([]);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('prints single tool with name', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      { name: 'Read', input: { file_path: '/path/to/file.ts' }, id: 'tool-1' },
    ];

    flushPendingTools(state, 'normal');

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('[TOOL]');
    expect(output).toContain('Read');
  });

  it('formats Read tool with shortened path', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      {
        name: 'Read',
        input: { file_path: '/home/user/project/src/file.ts' },
        id: 'tool-1',
      },
    ];

    flushPendingTools(state, 'normal');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('src/file.ts');
  });

  it('formats Glob tool with pattern', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      { name: 'Glob', input: { pattern: '**/*.ts' }, id: 'tool-1' },
    ];

    flushPendingTools(state, 'normal');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('**/*.ts');
  });

  it('formats Grep tool with quoted pattern', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      { name: 'Grep', input: { pattern: 'searchTerm' }, id: 'tool-1' },
    ];

    flushPendingTools(state, 'normal');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('"searchTerm"');
  });

  it('formats Bash tool with truncated command', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      { name: 'Bash', input: { command: 'npm install' }, id: 'tool-1' },
    ];

    flushPendingTools(state, 'normal');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('npm install');
  });

  it('prints parallel tools with count', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      { name: 'Read', input: { file_path: '/file1.ts' }, id: 'tool-1' },
      { name: 'Read', input: { file_path: '/file2.ts' }, id: 'tool-2' },
    ];

    flushPendingTools(state, 'normal');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('[TOOL ×2]');
    expect(output).toContain('parallel');
  });

  it('prints each parallel tool indented', () => {
    const state = createMockFormatterState();
    state.pendingTools = [
      { name: 'Read', input: { file_path: '/file1.ts' }, id: 'tool-1' },
      { name: 'Read', input: { file_path: '/file2.ts' }, id: 'tool-2' },
    ];

    flushPendingTools(state, 'normal');

    // First call is header, subsequent are indented tools
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    const tool1Output = consoleSpy.mock.calls[1]?.[0] as string;
    expect(tool1Output).toContain('→');
    expect(tool1Output).toContain('Read');
  });

  it('clears pendingTools after flushing', () => {
    const state = createMockFormatterState();
    state.pendingTools = [{ name: 'Read', input: {}, id: 'tool-1' }];

    flushPendingTools(state, 'normal');

    expect(state.pendingTools).toEqual([]);
  });
});

describe('formatMessage', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let mockTime: number;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('SystemInitMessage', () => {
    it('skips init messages (config shown by runner)', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createSystemInitMessage('claude-3', ['Read', 'Write']);

      formatMessage(msg, state, 'normal', logger, 100);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('skips output in quiet mode', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createSystemInitMessage();

      formatMessage(msg, state, 'quiet', logger, 100);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('AssistantMessage with TextBlock', () => {
    it('returns text for signal detection', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createTextMessage('Hello world');

      const result = formatMessage(msg, state, 'normal', logger, 100);

      expect(result).toContain('Hello world');
    });

    it('prints full text with [CLAUDE] prefix', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createTextMessage('Hello world');

      formatMessage(msg, state, 'normal', logger, 100);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('[CLAUDE]');
      expect(output).toContain('Hello world');
    });

    it('filters thinking phrases in quiet mode', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createTextMessage("I'll help you with that");

      formatMessage(msg, state, 'quiet', logger, 100);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('shows answers in quiet mode', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createTextMessage('The answer is 42');

      formatMessage(msg, state, 'quiet', logger, 100);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('[ANSWER]');
      expect(output).toContain('The answer is 42');
    });
  });

  describe('AssistantMessage with ToolUseBlock', () => {
    it('records tool start time', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Read',
        { file_path: '/test.ts' },
        'tool-1'
      );
      mockTime = 5000;

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.toolStartTimes.get('tool-1')).toBe(5000);
    });

    it('adds tool to pending batch', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Read',
        { file_path: '/test.ts' },
        'tool-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.pendingTools).toHaveLength(1);
      expect(state.pendingTools[0]?.name).toBe('Read');
    });
  });

  describe('UserMessage with ToolResultBlock', () => {
    it('flushes pending tools', () => {
      const state = createMockFormatterState();
      state.pendingTools = [{ name: 'Read', input: {}, id: 'tool-1' }];
      const logger = createMockLogger();
      const msg = createToolResultMessage('tool-1', 'file contents');

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.pendingTools).toEqual([]);
    });

    it('prints error results with ERROR prefix', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolResultMessage('tool-1', 'Error: file not found');

      formatMessage(msg, state, 'normal', logger, 100);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('ERROR');
    });

    it('detects tool_use_error prefix', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolResultMessage(
        'tool-1',
        '<tool_use_error>Something went wrong</tool_use_error>'
      );

      formatMessage(msg, state, 'normal', logger, 100);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('ERROR');
    });
  });

  describe('ResultMessage', () => {
    it('flushes pending tools', () => {
      const state = createMockFormatterState();
      state.pendingTools = [{ name: 'Read', input: {}, id: 'tool-1' }];
      const logger = createMockLogger();
      const msg = createResultMessage(5000);

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.pendingTools).toEqual([]);
    });

    it('prints duration with [RUNNER] prefix', () => {
      const state = createMockFormatterState();
      state.suppressStepCompletion = false;
      const logger = createMockLogger();
      const msg = createResultMessage(5000);

      formatMessage(msg, state, 'normal', logger, 100);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('[RUNNER]');
      expect(output).toContain('Completed step 1 in 5.0s');
    });

    it('skips output in quiet mode', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createResultMessage(5000);

      formatMessage(msg, state, 'quiet', logger, 100);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('parallel tool detection', () => {
    it('groups tools in same message within parallelThresholdMs', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      // Create message with multiple tool uses
      const msg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: '/a.ts' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Read',
              input: { file_path: '/b.ts' },
            },
          ],
        },
      };

      // Both tools processed at same time
      mockTime = 1000;
      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.pendingTools).toHaveLength(2);
    });

    it('separates tools in same message when threshold exceeded', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      // Create message with multiple tool uses
      const msg: AssistantMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: '/a.ts' },
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Read',
              input: { file_path: '/b.ts' },
            },
          ],
        },
      };

      // Simulate time passing between tool blocks (unusual but possible)
      let toolCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        toolCount++;
        return toolCount === 1 ? 1000 : 2000; // 1s gap
      });

      formatMessage(msg, state, 'normal', logger, 100);

      // First tool flushed, second pending
      expect(state.pendingTools).toHaveLength(1);
      expect(state.pendingTools[0]?.id).toBe('tool-2');
    });
  });

  describe('Task tool handling', () => {
    it('sets activeTask state for Task tool', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Task',
        { subagent_type: 'Explore', description: 'Find files' },
        'task-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      expect(state.activeTask).toEqual({
        name: 'Explore',
        description: 'Find files',
        id: 'task-1',
      });
    });

    it('prints task header with box', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Task',
        { subagent_type: 'Explore', description: 'Find files' },
        'task-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      const calls = consoleSpy.mock.calls.map((c) => c[0] as string);
      const hasTaskHeader = calls.some((c) => c.includes('[TASK]'));

      expect(hasTaskHeader).toBe(true);
    });
  });
});
