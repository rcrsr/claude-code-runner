import { beforeEach, describe, expect, it } from 'vitest';

import { stripAnsi } from '../../src/output/colors.js';
import {
  formatLogEntry,
  renderAgentBox,
  renderMainLog,
} from '../../src/output/ui-components.js';
import type { AgentState, LogEntry } from '../../src/output/ui-state.js';

describe('formatLogEntry', () => {
  describe('IR-8: applies correct colors per entry type', () => {
    it('formats invocation entry with timestamp, label, name, and content', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'A',
        agentName: 'code-review',
        type: 'invocation',
        content: 'Review src/auth.ts',
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      // Verify structure: timestamp [label] name content
      expect(plain).toContain('[A]');
      expect(plain).toContain('code-review');
      expect(plain).toContain('Review src/auth.ts');
    });

    it('formats tool entry with colored tool name', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'B',
        agentName: 'fix-bugs',
        type: 'tool',
        content: 'Read(file_path: "src/main.ts")',
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      // Verify tool name extracted and displayed
      expect(plain).toContain('[B]');
      expect(plain).toContain('fix-bugs');
      expect(plain).toContain('Read');
      expect(plain).toContain('file_path: "src/main.ts"');
    });

    it('formats tool entry without parentheses using fallback', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'C',
        agentName: 'task',
        type: 'tool',
        content: 'InvalidFormat',
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      // Should fallback to plain content
      expect(plain).toContain('InvalidFormat');
      expect(plain).toContain('[C]');
      expect(plain).toContain('task');
    });

    it('formats completion entry with content only', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'D',
        agentName: 'analyze',
        type: 'completion',
        content: 'Complete',
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      expect(plain).toContain('Complete');
      expect(plain).toContain('[D]');
      expect(plain).toContain('analyze');
      // No duration/message count
      expect(plain).not.toContain('ms');
      expect(plain).not.toContain('msgs');
    });
  });

  describe('IR-8: includes duration for completion entries', () => {
    it('formats completion entry with duration', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'E',
        agentName: 'test',
        type: 'completion',
        content: 'Complete',
        duration: 5432,
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      expect(plain).toContain('Complete');
      expect(plain).toContain('5.4s');
    });

    it('formats completion entry with message count', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'F',
        agentName: 'build',
        type: 'completion',
        content: 'Complete',
        messageCount: 12,
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      expect(plain).toContain('Complete');
      expect(plain).toContain('12 msgs');
    });

    it('formats completion entry with both duration and message count', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T12:00:00.123Z'),
        agentLabel: 'G',
        agentName: 'deploy',
        type: 'completion',
        content: 'Complete',
        duration: 120000,
        messageCount: 45,
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      expect(plain).toContain('Complete');
      expect(plain).toContain('2m 0s');
      expect(plain).toContain('45 msgs');
    });
  });

  describe('timestamp formatting', () => {
    it('formats timestamp with hours, minutes, seconds, and milliseconds', () => {
      const entry: LogEntry = {
        timestamp: new Date('2025-01-01T09:05:03.007Z'),
        agentLabel: 'H',
        agentName: 'task',
        type: 'invocation',
        content: 'Start',
      };

      const result = formatLogEntry(entry);
      const plain = stripAnsi(result);

      // Timestamp format: HH:MM:SS.mmm (UTC time)
      expect(plain).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
    });
  });
});

describe('renderMainLog', () => {
  describe('IR-7: limits to 10 entries during execution', () => {
    it('returns header plus last 10 entries when not complete', () => {
      const entries: LogEntry[] = Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date(),
        agentLabel: 'A',
        agentName: 'agent',
        type: 'invocation' as const,
        content: `Task ${i}`,
      }));

      const lines = renderMainLog(entries, false);

      // Header + 10 entries = 11 lines
      expect(lines).toHaveLength(11);
      expect(lines[0]).toContain('main log');

      // Should show last 10 entries (index 5-14)
      const plain = lines.map(stripAnsi);
      expect(plain.some((line) => line.includes('Task 5'))).toBe(true);
      expect(plain.some((line) => line.includes('Task 14'))).toBe(true);
      expect(plain.some((line) => line.includes('Task 0'))).toBe(false);
      expect(plain.some((line) => line.includes('Task 4'))).toBe(false);
    });

    it('returns header with spinner when not complete', () => {
      const entries: LogEntry[] = [];
      const lines = renderMainLog(entries, false);

      expect(lines[0]).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] main log$/);
    });
  });

  describe('IR-7: shows all entries when complete', () => {
    it('returns header plus all entries when complete', () => {
      const entries: LogEntry[] = Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date(),
        agentLabel: 'B',
        agentName: 'agent',
        type: 'invocation' as const,
        content: `Task ${i}`,
      }));

      const lines = renderMainLog(entries, true);

      // Header + 15 entries = 16 lines
      expect(lines).toHaveLength(16);

      // Should show all entries (0-14)
      const plain = lines.map(stripAnsi);
      expect(plain.some((line) => line.includes('Task 0'))).toBe(true);
      expect(plain.some((line) => line.includes('Task 14'))).toBe(true);
    });

    it('returns header without spinner when complete', () => {
      const entries: LogEntry[] = [];
      const lines = renderMainLog(entries, true);

      expect(lines[0]).toBe('main log');
      expect(lines[0]).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });
  });

  describe('IR-7: sorts chronologically', () => {
    it('preserves chronological order of entries', () => {
      const entries: LogEntry[] = [
        {
          timestamp: new Date('2025-01-01T12:00:00Z'),
          agentLabel: 'A',
          agentName: 'first',
          type: 'invocation',
          content: 'First task',
        },
        {
          timestamp: new Date('2025-01-01T12:01:00Z'),
          agentLabel: 'B',
          agentName: 'second',
          type: 'tool',
          content: 'Read(path)',
        },
        {
          timestamp: new Date('2025-01-01T12:02:00Z'),
          agentLabel: 'C',
          agentName: 'third',
          type: 'completion',
          content: 'Complete',
        },
      ];

      const lines = renderMainLog(entries, true);
      const plain = lines.map(stripAnsi);

      // Find indices of each entry
      const firstIdx = plain.findIndex((line) => line.includes('First task'));
      const secondIdx = plain.findIndex((line) => line.includes('Read'));
      const thirdIdx = plain.findIndex((line) => line.includes('Complete'));

      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });
  });

  describe('empty log handling', () => {
    it('returns only header when entries empty and not complete', () => {
      const lines = renderMainLog([], false);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('main log');
    });

    it('returns only header when entries empty and complete', () => {
      const lines = renderMainLog([], true);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('main log');
    });
  });
});

describe('renderAgentBox', () => {
  let agent: AgentState;

  beforeEach(() => {
    agent = {
      id: 'task-1',
      name: 'code-review',
      description: 'Review authentication module',
      label: 'A',
      toolCalls: [],
      messageCount: 0,
      startTime: Date.now() - 5000,
      status: 'running',
    };
  });

  describe('IR-6: generates correct border characters', () => {
    it('renders box with top border using ┌─┐ characters', () => {
      const lines = renderAgentBox(agent, 50);
      const topBorder = lines[0];

      expect(topBorder).toMatch(/^┌─+┐$/);
      expect(topBorder).toHaveLength(50);
    });

    it('renders box with bottom border using └─┘ characters', () => {
      const lines = renderAgentBox(agent, 50);
      const bottomBorder = lines[lines.length - 1];

      expect(bottomBorder).toMatch(/^└─+┘$/);
      expect(bottomBorder).toHaveLength(50);
    });

    it('renders box with side borders using │ characters', () => {
      const lines = renderAgentBox(agent, 50);

      // Header, body, and footer lines should have │ on sides
      for (let i = 1; i < lines.length - 1; i++) {
        const plain = stripAnsi(lines[i]);
        expect(plain.startsWith('│')).toBe(true);
        expect(plain.endsWith('│')).toBe(true);
      }
    });

    it('renders box with correct total width', () => {
      const lines = renderAgentBox(agent, 60);

      // All lines should have same width
      lines.forEach((line) => {
        const plain = stripAnsi(line);
        expect(plain).toHaveLength(60);
      });
    });
  });

  describe('AC-14: shows ellipsis for empty tool list', () => {
    it('renders ellipsis when tool calls array empty', () => {
      agent.toolCalls = [];

      const lines = renderAgentBox(agent, 50);
      const plain = lines.map(stripAnsi);

      // Should contain ellipsis in body (between header and footer)
      const bodyLines = plain.slice(2, -2);
      expect(bodyLines.some((line) => line.includes('...'))).toBe(true);
    });

    it('ellipsis appears on single body line when no tool calls', () => {
      agent.toolCalls = [];

      const lines = renderAgentBox(agent, 50);

      // Structure: top border, header, body (1 line with ellipsis), footer, bottom border
      expect(lines).toHaveLength(5);
    });
  });

  describe('AC-15: truncates long descriptions', () => {
    it('truncates description exceeding content width', () => {
      agent.description =
        'This is a very long description that should be truncated when rendered in the agent box';
      agent.name = 'short';
      agent.label = 'A';

      const lines = renderAgentBox(agent, 50);
      const headerLine = stripAnsi(lines[1]);

      // Verify truncation occurred (ellipsis present)
      expect(headerLine).toContain('...');
      // Verify full description not present
      expect(headerLine).not.toContain(
        'This is a very long description that should be truncated when rendered in the agent box'
      );
      // Verify structure maintained
      expect(headerLine).toContain('short');
      expect(headerLine).toContain('[A]');
      // Verify width consistency (CRITICAL: catches padding bug)
      expect(headerLine).toHaveLength(50);
    });

    it('preserves short descriptions without truncation', () => {
      agent.description = 'Short description';
      agent.name = 'review';
      agent.label = 'B';

      const lines = renderAgentBox(agent, 50);
      const headerLine = stripAnsi(lines[1]);

      expect(headerLine).toContain('Short description');
      expect(headerLine).not.toContain('...');
    });
  });

  describe('EC-9: throws for width < 30', () => {
    it('throws error when width is 29', () => {
      expect(() => renderAgentBox(agent, 29)).toThrow(
        'Box width 29 below minimum 30'
      );
    });

    it('throws error when width is 0', () => {
      expect(() => renderAgentBox(agent, 0)).toThrow(
        'Box width 0 below minimum 30'
      );
    });

    it('throws error when width is negative', () => {
      expect(() => renderAgentBox(agent, -10)).toThrow(
        'Box width -10 below minimum 30'
      );
    });

    it('does not throw when width is exactly 30', () => {
      expect(() => renderAgentBox(agent, 30)).not.toThrow();
    });

    it('does not throw when width is greater than 30', () => {
      expect(() => renderAgentBox(agent, 50)).not.toThrow();
    });
  });

  describe('tool call rendering', () => {
    it('renders up to 5 tool calls', () => {
      agent.toolCalls = Array.from({ length: 5 }, (_, i) => ({
        toolName: `Tool${i}`,
        args: `arg${i}`,
        timestamp: new Date(),
      }));

      const lines = renderAgentBox(agent, 50);
      const plain = lines.map(stripAnsi);

      // Should show all 5 tools
      expect(plain.some((line) => line.includes('Tool0'))).toBe(true);
      expect(plain.some((line) => line.includes('Tool4'))).toBe(true);
    });

    it('renders last 5 tool calls when more than 5 exist', () => {
      agent.toolCalls = Array.from({ length: 8 }, (_, i) => ({
        toolName: `Tool${i}`,
        args: `arg${i}`,
        timestamp: new Date(),
      }));

      const lines = renderAgentBox(agent, 50);
      const plain = lines.map(stripAnsi);

      // Should show last 5 tools (3-7)
      expect(plain.some((line) => line.includes('Tool3'))).toBe(true);
      expect(plain.some((line) => line.includes('Tool7'))).toBe(true);
      expect(plain.some((line) => line.includes('Tool0'))).toBe(false);
      expect(plain.some((line) => line.includes('Tool2'))).toBe(false);
    });

    it('renders tool name and arguments', () => {
      agent.toolCalls = [
        {
          toolName: 'Read',
          args: 'file_path: "src/main.ts"',
          timestamp: new Date(),
        },
      ];

      const lines = renderAgentBox(agent, 50);
      const plain = lines.map(stripAnsi);

      expect(plain.some((line) => line.includes('Read'))).toBe(true);
      expect(
        plain.some((line) => line.includes('file_path: "src/main.ts"'))
      ).toBe(true);
    });
  });

  describe('footer rendering', () => {
    it('renders elapsed time in footer', () => {
      const lines = renderAgentBox(agent, 50);
      const footerLine = stripAnsi(lines[lines.length - 2]);

      // Elapsed time should be approximately 5000ms (5s)
      expect(footerLine).toMatch(/\d+(\.\d+)?[sm]/);
    });

    it('renders message count in footer', () => {
      agent.messageCount = 7;

      const lines = renderAgentBox(agent, 50);
      const footerLine = stripAnsi(lines[lines.length - 2]);

      expect(footerLine).toContain('7 msgs');
    });

    it('renders spinner in footer when status is running', () => {
      agent.status = 'running';

      const lines = renderAgentBox(agent, 50);
      const footerLine = lines[lines.length - 2];

      // Should contain spinner character
      expect(footerLine).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });

    it('does not render spinner when status is complete', () => {
      agent.status = 'complete';

      const lines = renderAgentBox(agent, 50);
      const footerLine = lines[lines.length - 2];

      // Should not contain spinner character
      expect(footerLine).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });
  });

  describe('box structure', () => {
    it('renders 5 lines for agent with no tool calls', () => {
      agent.toolCalls = [];

      const lines = renderAgentBox(agent, 50);

      // Top border, header, body (ellipsis), footer, bottom border
      expect(lines).toHaveLength(5);
    });

    it('renders 7 lines for agent with 2 tool calls', () => {
      agent.toolCalls = [
        { toolName: 'Read', args: 'path', timestamp: new Date() },
        { toolName: 'Write', args: 'data', timestamp: new Date() },
      ];

      const lines = renderAgentBox(agent, 50);

      // Top border, header, 2 tool lines, footer, bottom border
      expect(lines).toHaveLength(6);
    });
  });
});
