import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFormatterState,
  flushPendingTools,
  formatMessage,
  resetFormatterState,
} from '../../src/output/formatter.js';
import type { AssistantMessage } from '../../src/types/claude.js';
import {
  createMockFormatterState,
  createMockLogger,
  createResultMessage,
  createSystemInitMessage,
  createTextMessage,
  createToolResultMessage,
  createToolUseMessage,
} from '../helpers/mocks.js';

/** Strip ANSI escape codes from a string */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('createFormatterState', () => {
  it('returns empty pendingTools array', () => {
    const state = createFormatterState();
    expect(state.pendingTools).toEqual([]);
  });

  it('returns null lastToolTime', () => {
    const state = createFormatterState();
    expect(state.lastToolTime).toBeNull();
  });

  it('returns empty activeTasks map', () => {
    const state = createFormatterState();
    expect(state.activeTasks.size).toBe(0);
  });

  it('returns empty toolStartTimes map', () => {
    const state = createFormatterState();
    expect(state.toolStartTimes.size).toBe(0);
  });

  it('returns null currentStatusText', () => {
    const state = createFormatterState();
    expect(state.currentStatusText).toBeNull();
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

  it('clears activeTasks map', () => {
    const state = createMockFormatterState();
    state.activeTasks.set('task-1', {
      name: 'test',
      description: 'test',
      id: 'task-1',
      colorIndex: 0,
    });

    resetFormatterState(state);

    expect(state.activeTasks.size).toBe(0);
  });

  it('clears toolStartTimes map', () => {
    const state = createMockFormatterState();
    state.toolStartTimes.set('tool-1', 1000);

    resetFormatterState(state);

    expect(state.toolStartTimes.size).toBe(0);
  });

  it('preserves currentStatusText across reset', () => {
    const state = createMockFormatterState();
    state.currentStatusText = 'Processing...';

    resetFormatterState(state);

    expect(state.currentStatusText).toBe('Processing...');
  });

  it('clears contextTokens but preserves currentModel', () => {
    const state = createMockFormatterState();
    state.currentModel = 'claude-opus-4-5-20250929';
    state.contextTokens = 84_000;

    resetFormatterState(state);

    expect(state.contextTokens).toBeNull();
    expect(state.currentModel).toBe('claude-opus-4-5-20250929');
  });
});

describe('flushPendingTools', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(output).toContain('[Read]');
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
    expect(output).toContain('[×2]');
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
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, 'log'>>;
  let mockTime: number;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
  });

  afterEach(() => {
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

    it('captures the model for the status line', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createSystemInitMessage('claude-opus-4-5-20250929');

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.currentModel).toBe('claude-opus-4-5-20250929');
    });
  });

  describe('context tracking', () => {
    it('captures context tokens from assistant message usage', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createTextMessage('Hello');
      msg.message.usage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 60_000,
        cache_creation: {
          ephemeral_5m_input_tokens: 2_000,
          ephemeral_1h_input_tokens: 1_000,
        },
      };

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.contextTokens).toBe(63_100);
    });

    it('leaves contextTokens null when usage is absent', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createTextMessage('Hello');

      formatMessage(msg, state, 'normal', logger, 100);

      expect(state.contextTokens).toBeNull();
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
      expect(output).toContain('[claude]');
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
      expect(output).toContain('[answer]');
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

    it('prints error results with [error] prefix', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolResultMessage('tool-1', 'Error: file not found');

      formatMessage(msg, state, 'normal', logger, 100);

      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('[error]');
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
      expect(output).toContain('[error]');
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
      expect(output).toContain('[runner]');
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
    it('adds task to activeTasks map with label', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Task',
        { subagent_type: 'Explore', description: 'Find files' },
        'task-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      const task = state.activeTasks.get('task-1');
      expect(task).toEqual({
        name: 'Explore',
        description: 'Find files',
        id: 'task-1',
        colorIndex: 1,
      });
    });

    it('prints task header with label', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Task',
        { subagent_type: 'Explore', description: 'Find files' },
        'task-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      const calls = consoleSpy.mock.calls.map((c) => stripAnsi(c[0] as string));
      // Check task header contains marker and [Explore]
      const hasTaskHeader = calls.some(
        (c) => c.includes('[Explore]') && c.includes('●')
      );

      expect(hasTaskHeader).toBe(true);
    });

    it("adds task to activeTasks map with label when tool name is 'Agent'", () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Agent',
        { subagent_type: 'Explore', description: 'Find files' },
        'task-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      const task = state.activeTasks.get('task-1');
      expect(task).toEqual({
        name: 'Explore',
        description: 'Find files',
        id: 'task-1',
        colorIndex: 1,
      });
    });

    it("prints task header with label when tool name is 'Agent'", () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();
      const msg = createToolUseMessage(
        'Agent',
        { subagent_type: 'Explore', description: 'Find files' },
        'task-1'
      );

      formatMessage(msg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      const calls = consoleSpy.mock.calls.map((c) => stripAnsi(c[0] as string));
      // Check task header contains marker and [Explore]
      const hasTaskHeader = calls.some(
        (c) => c.includes('[Explore]') && c.includes('●')
      );

      expect(hasTaskHeader).toBe(true);
    });
  });

  describe('parallel task tracking', () => {
    it('assigns sequential labels A, B, C to parallel tasks', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // First task
      const msg1 = createToolUseMessage(
        'Task',
        { subagent_type: 'node-engineer', description: 'Add fields' },
        'task-1'
      );
      formatMessage(msg1, state, 'normal', logger, 100);

      // Second task
      const msg2 = createToolUseMessage(
        'Task',
        { subagent_type: 'node-engineer', description: 'Create module' },
        'task-2'
      );
      formatMessage(msg2, state, 'normal', logger, 100);

      expect(state.activeTasks.get('task-1')?.colorIndex).toBe(1);
      expect(state.activeTasks.get('task-2')?.colorIndex).toBe(2);
    });

    it('attributes tool calls to current task', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // Start task A
      const taskMsg = createToolUseMessage(
        'Task',
        { subagent_type: 'engineer', description: 'Task A' },
        'task-1'
      );
      formatMessage(taskMsg, state, 'normal', logger, 100);

      // Tool call while in task A
      const toolMsg = createToolUseMessage(
        'Read',
        { file_path: '/test.ts' },
        'tool-1'
      );
      formatMessage(toolMsg, state, 'normal', logger, 100);

      expect(state.toolToTaskId.get('tool-1')).toBe('task-1');
    });

    it('prints tool prefix with task label', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // Start task A
      const taskMsg = createToolUseMessage(
        'Task',
        { subagent_type: 'engineer', description: 'Task A' },
        'task-1'
      );
      formatMessage(taskMsg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      // Tool call while in task A
      const toolMsg = createToolUseMessage(
        'Read',
        { file_path: '/test.ts' },
        'tool-1'
      );
      formatMessage(toolMsg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      const calls = consoleSpy.mock.calls.map((c) => stripAnsi(c[0] as string));
      const toolCall = calls.find((c) => c.includes('[Read]'));
      // Check tool call has marker
      expect(toolCall).toContain('●');
    });

    it('removes task from activeTasks on completion', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // Start task
      const taskMsg = createToolUseMessage(
        'Task',
        { subagent_type: 'engineer', description: 'Task A' },
        'task-1'
      );
      formatMessage(taskMsg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      expect(state.activeTasks.has('task-1')).toBe(true);

      // Complete task
      const resultMsg = createToolResultMessage('task-1', 'Task completed');
      formatMessage(resultMsg, state, 'normal', logger, 100);

      expect(state.activeTasks.has('task-1')).toBe(false);
    });

    it('prints task completion with label prefix', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // Start task
      const taskMsg = createToolUseMessage(
        'Task',
        { subagent_type: 'engineer', description: 'Task A' },
        'task-1'
      );
      formatMessage(taskMsg, state, 'normal', logger, 100);
      flushPendingTools(state, 'normal');

      // Complete task
      const resultMsg = createToolResultMessage('task-1', 'Task completed');
      formatMessage(resultMsg, state, 'normal', logger, 100);

      const calls = consoleSpy.mock.calls.map((c) => stripAnsi(c[0] as string));
      const completionLine = calls.find((c) => c.includes('Complete'));
      // Check completion has marker and type
      expect(completionLine).toContain('●');
      expect(completionLine).toContain('[engineer]');
    });

    it('attributes tools to correct task with multiple concurrent agents', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // Start two concurrent tasks (same assistant message in practice)
      formatMessage(
        createToolUseMessage(
          'Task',
          { subagent_type: 'engineer', description: 'Task A' },
          'task-1'
        ),
        state,
        'normal',
        logger,
        100
      );
      formatMessage(
        createToolUseMessage(
          'Task',
          { subagent_type: 'engineer', description: 'Task B' },
          'task-2'
        ),
        state,
        'normal',
        logger,
        100
      );
      flushPendingTools(state, 'normal');

      expect(state.activeTasks.size).toBe(2);

      // First tool call (from subagent A) - uses pending queue (creation order)
      formatMessage(
        createToolUseMessage('Read', { file_path: '/a.ts' }, 'read-a'),
        state,
        'normal',
        logger,
        100
      );
      expect(state.toolToTaskId.get('read-a')).toBe('task-1');
      flushPendingTools(state, 'normal');

      // Second tool call (from subagent B) - next in pending queue
      formatMessage(
        createToolUseMessage('Read', { file_path: '/b.ts' }, 'read-b'),
        state,
        'normal',
        logger,
        100
      );
      expect(state.toolToTaskId.get('read-b')).toBe('task-2');
      flushPendingTools(state, 'normal');

      // Result for task A's tool
      formatMessage(
        createToolResultMessage('read-a', 'contents of a.ts'),
        state,
        'normal',
        logger,
        100
      );

      // Next tool from task A (continues after its result)
      formatMessage(
        createToolUseMessage('Edit', { file_path: '/a.ts' }, 'edit-a'),
        state,
        'normal',
        logger,
        100
      );
      expect(state.toolToTaskId.get('edit-a')).toBe('task-1');
      flushPendingTools(state, 'normal');

      // Result for task B's tool
      formatMessage(
        createToolResultMessage('read-b', 'contents of b.ts'),
        state,
        'normal',
        logger,
        100
      );

      // Next tool from task B (continues after its result)
      formatMessage(
        createToolUseMessage('Edit', { file_path: '/b.ts' }, 'edit-b'),
        state,
        'normal',
        logger,
        100
      );
      expect(state.toolToTaskId.get('edit-b')).toBe('task-2');

      // Verify all tools got markers (dots) in output
      const calls = consoleSpy.mock.calls.map((c) => stripAnsi(c[0] as string));
      const toolCalls = calls.filter(
        (c) => c.includes('[Read]') || c.includes('[Edit]')
      );
      for (const call of toolCalls) {
        expect(call).toContain('●');
      }
    });

    it('handles multiple parallel task completions', () => {
      const state = createMockFormatterState();
      const logger = createMockLogger();

      // Start two tasks
      formatMessage(
        createToolUseMessage(
          'Task',
          { subagent_type: 'engineer', description: 'Task A' },
          'task-1'
        ),
        state,
        'normal',
        logger,
        100
      );
      formatMessage(
        createToolUseMessage(
          'Task',
          { subagent_type: 'engineer', description: 'Task B' },
          'task-2'
        ),
        state,
        'normal',
        logger,
        100
      );
      flushPendingTools(state, 'normal');

      expect(state.activeTasks.size).toBe(2);

      // Complete task A
      formatMessage(
        createToolResultMessage('task-1', 'Done'),
        state,
        'normal',
        logger,
        100
      );
      expect(state.activeTasks.size).toBe(1);
      expect(state.activeTasks.has('task-2')).toBe(true);

      // Complete task B
      formatMessage(
        createToolResultMessage('task-2', 'Done'),
        state,
        'normal',
        logger,
        100
      );
      expect(state.activeTasks.size).toBe(0);

      const calls = consoleSpy.mock.calls.map((c) => stripAnsi(c[0] as string));
      const completions = calls.filter((c) => c.includes('Complete'));
      expect(completions).toHaveLength(2);
      // Check both completions have markers
      expect(completions[0]).toContain('●');
      expect(completions[1]).toContain('●');
    });
  });
});
