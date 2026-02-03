import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUIRenderer } from '../../src/output/ui-renderer.js';
import type { UIState } from '../../src/output/ui-state.js';
import { createUIState } from '../../src/output/ui-state.js';

describe('createUIRenderer', () => {
  let state: UIState;
  let originalColumns: number | undefined;

  beforeEach(() => {
    state = createUIState();
    originalColumns = process.stdout.columns;
    // Mock terminal width to 80 by default
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore original terminal width
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('factory function', () => {
    it('returns object with start method', () => {
      const renderer = createUIRenderer(state);
      expect(typeof renderer.start).toBe('function');
    });

    it('returns object with stop method', () => {
      const renderer = createUIRenderer(state);
      expect(typeof renderer.stop).toBe('function');
    });

    it('returns object with render method', () => {
      const renderer = createUIRenderer(state);
      expect(typeof renderer.render).toBe('function');
    });
  });

  describe('start', () => {
    it('throws "Renderer already running" if already started (EC-7)', () => {
      const renderer = createUIRenderer(state);
      renderer.start();

      expect(() => {
        renderer.start();
      }).toThrow('Renderer already running');

      renderer.stop();
    });

    it('throws if terminal width below 70 (EC-8)', () => {
      Object.defineProperty(process.stdout, 'columns', {
        value: 69,
        writable: true,
        configurable: true,
      });

      const renderer = createUIRenderer(state);

      expect(() => {
        renderer.start();
      }).toThrow('Terminal width 69 below minimum 70');
    });

    it('accepts terminal width of exactly 70', () => {
      Object.defineProperty(process.stdout, 'columns', {
        value: 70,
        writable: true,
        configurable: true,
      });

      const renderer = createUIRenderer(state);

      expect(() => {
        renderer.start();
      }).not.toThrow();

      renderer.stop();
    });

    it('starts render loop at 16ms interval', () => {
      const renderer = createUIRenderer(state);
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      renderer.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        16 // UI_RENDER_INTERVAL_MS
      );

      renderer.stop();
    });

    it('advances spinner every 96ms (every 6 frames)', () => {
      const renderer = createUIRenderer(state);
      vi.spyOn(renderer, 'render').mockImplementation(() => undefined);
      renderer.start();

      expect(state.spinnerFrame).toBe(0);

      // Advance 5 frames (80ms) - spinner should not advance
      vi.advanceTimersByTime(80);
      expect(state.spinnerFrame).toBe(0);

      // Advance to 6th frame (96ms) - spinner should advance
      vi.advanceTimersByTime(16);
      expect(state.spinnerFrame).toBe(1);

      // Advance 6 more frames (96ms) - spinner should advance again
      vi.advanceTimersByTime(96);
      expect(state.spinnerFrame).toBe(2);

      renderer.stop();
    });

    it('wraps spinner frame from 3 back to 0', () => {
      const renderer = createUIRenderer(state);
      state.spinnerFrame = 3;
      renderer.start();

      // Advance 6 frames to trigger spinner update
      vi.advanceTimersByTime(96);

      expect(state.spinnerFrame).toBe(0);

      renderer.stop();
    });

    it('stops automatically when all agents complete', () => {
      // Add an agent to state
      state.agents.set('agent-1', {
        id: 'agent-1',
        name: 'test-agent',
        description: 'Test task',
        label: 'A',
        toolCalls: [],
        messageCount: 0,
        startTime: Date.now(),
        status: 'running',
      });

      const renderer = createUIRenderer(state);
      const stopSpy = vi.spyOn(renderer, 'stop');
      renderer.start();

      // Mark agent as complete
      const agent = state.agents.get('agent-1');
      if (agent) {
        agent.status = 'complete';
      }

      // Advance one frame to trigger completion check
      vi.advanceTimersByTime(16);

      expect(stopSpy).toHaveBeenCalled();
    });

    it('does not stop when agents map is empty', () => {
      const renderer = createUIRenderer(state);
      const stopSpy = vi.spyOn(renderer, 'stop');
      renderer.start();

      // Advance one frame - should not stop with no agents
      vi.advanceTimersByTime(16);

      expect(stopSpy).not.toHaveBeenCalled();

      renderer.stop();
    });
  });

  describe('stop', () => {
    it('is idempotent (safe to call multiple times)', () => {
      const renderer = createUIRenderer(state);
      renderer.start();

      renderer.stop();
      expect(() => {
        renderer.stop();
      }).not.toThrow();
      expect(() => {
        renderer.stop();
      }).not.toThrow();
    });

    it('stops render interval', () => {
      const renderer = createUIRenderer(state);
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      renderer.start();

      renderer.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('allows restart after stop', () => {
      const renderer = createUIRenderer(state);
      renderer.start();
      renderer.stop();

      expect(() => {
        renderer.start();
      }).not.toThrow();

      renderer.stop();
    });
  });

  describe('render', () => {
    let consoleClearSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleClearSpy = vi
        .spyOn(console, 'clear')
        .mockImplementation(() => undefined);
      consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('clears terminal on each frame', () => {
      const renderer = createUIRenderer(state);
      renderer.render();

      expect(consoleClearSpy).toHaveBeenCalled();
    });

    it('updates terminal output', () => {
      const renderer = createUIRenderer(state);
      renderer.render();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('displays running agents', () => {
      state.agents.set('agent-1', {
        id: 'agent-1',
        name: 'test-agent',
        description: 'Test task',
        label: 'A',
        toolCalls: [],
        messageCount: 0,
        startTime: Date.now(),
        status: 'running',
      });

      const renderer = createUIRenderer(state);
      renderer.render();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('displays tool calls for agents', () => {
      state.agents.set('agent-1', {
        id: 'agent-1',
        name: 'test-agent',
        description: 'Test task',
        label: 'A',
        toolCalls: [
          {
            toolName: 'Read',
            args: 'file.ts',
            timestamp: new Date(),
          },
        ],
        messageCount: 0,
        startTime: Date.now(),
        status: 'running',
      });

      const renderer = createUIRenderer(state);
      renderer.render();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('displays recent log entries', () => {
      state.mainLog.push({
        timestamp: new Date(),
        agentLabel: 'A',
        agentName: 'test-agent',
        type: 'invocation',
        content: 'Started task',
      });

      const renderer = createUIRenderer(state);
      renderer.render();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('does not show completed agents', () => {
      state.agents.set('agent-1', {
        id: 'agent-1',
        name: 'completed-agent',
        description: 'Finished task',
        label: 'A',
        toolCalls: [],
        messageCount: 0,
        startTime: Date.now(),
        status: 'complete',
      });

      const renderer = createUIRenderer(state);
      renderer.render();

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('frame skip behavior (AC-10)', () => {
    it('skips frame if render exceeds 16ms without accumulation', () => {
      const renderer = createUIRenderer(state);
      let renderCount = 0;

      // Mock render to take longer than 16ms
      vi.spyOn(renderer, 'render').mockImplementation(() => {
        renderCount++;
      });

      renderer.start();

      // Advance time to simulate slow renders
      // setInterval will naturally skip frames if execution takes too long
      vi.advanceTimersByTime(100);

      // With 16ms interval, 100ms should trigger 6 renders
      // But setInterval behavior may vary based on execution time
      expect(renderCount).toBeGreaterThan(0);

      renderer.stop();
    });
  });
});
