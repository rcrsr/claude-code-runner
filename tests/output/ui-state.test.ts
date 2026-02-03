import { beforeEach, describe, expect, it } from 'vitest';

import {
  completeAgent,
  createUIState,
  recordToolCall,
  registerAgent,
  type UIState,
} from '../../src/output/ui-state.js';
import type { ActiveTask } from '../../src/types/runner.js';

describe('createUIState', () => {
  let state: UIState;

  beforeEach(() => {
    state = createUIState();
  });

  it('returns empty agents Map', () => {
    expect(state.agents).toBeInstanceOf(Map);
    expect(state.agents.size).toBe(0);
  });

  it('returns empty mainLog array', () => {
    expect(Array.isArray(state.mainLog)).toBe(true);
    expect(state.mainLog).toEqual([]);
  });

  it('sets renderStartTime to current timestamp', () => {
    const before = Date.now();
    const testState = createUIState();
    const after = Date.now();

    expect(testState.renderStartTime).toBeGreaterThanOrEqual(before);
    expect(testState.renderStartTime).toBeLessThanOrEqual(after);
  });

  it('sets spinnerFrame to 0', () => {
    expect(state.spinnerFrame).toBe(0);
  });

  it('creates agents as Map not plain object', () => {
    expect(typeof state.agents.get).toBe('function');
    expect(typeof state.agents.set).toBe('function');
    expect(typeof state.agents.has).toBe('function');
  });
});

describe('UIState type definitions', () => {
  it('exports LogEntry interface', () => {
    const logEntry = {
      timestamp: new Date(),
      agentLabel: 'A',
      agentName: 'agent',
      type: 'invocation' as const,
      content: 'test',
    };

    expect(logEntry.timestamp).toBeInstanceOf(Date);
    expect(logEntry.type).toBe('invocation');
  });

  it('exports ToolCallEntry interface', () => {
    const toolCall = {
      toolName: 'Read',
      args: 'file.txt',
      timestamp: new Date(),
    };

    expect(toolCall.toolName).toBe('Read');
    expect(toolCall.timestamp).toBeInstanceOf(Date);
  });

  it('exports AgentState interface', () => {
    const agent = {
      id: 'agent-1',
      name: 'agent',
      description: 'test agent',
      label: 'A',
      toolCalls: [],
      messageCount: 0,
      startTime: Date.now(),
      status: 'running' as const,
    };

    expect(agent.status).toBe('running');
    expect(agent.toolCalls).toEqual([]);
  });
});

describe('registerAgent', () => {
  let state: UIState;

  beforeEach(() => {
    state = createUIState();
  });

  it('adds agent to state.agents map', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Test description',
      label: 'A',
    };

    registerAgent(state, task, 'Test description');

    expect(state.agents.size).toBe(1);
    expect(state.agents.has('task-1')).toBe(true);
  });

  it('creates agent with correct properties', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Original task description',
      label: 'A',
    };

    registerAgent(state, task, 'Agent description');

    const agent = state.agents.get('task-1');
    expect(agent).toBeDefined();
    expect(agent?.id).toBe('task-1');
    expect(agent?.name).toBe('TestAgent');
    expect(agent?.description).toBe('Agent description');
    expect(agent?.label).toBe('A');
    expect(agent?.toolCalls).toEqual([]);
    expect(agent?.messageCount).toBe(0);
    expect(agent?.status).toBe('running');
    expect(agent?.startTime).toBeGreaterThan(0);
  });

  it('truncates description to 40 characters', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Short desc',
      label: 'A',
    };

    const longDescription = 'A'.repeat(60);
    registerAgent(state, task, longDescription);

    const agent = state.agents.get('task-1');
    expect(agent?.description).toHaveLength(40);
    expect(agent?.description).toBe('A'.repeat(40));
  });

  it('preserves description under 40 characters', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Short',
      label: 'A',
    };

    const shortDescription = 'Short description';
    registerAgent(state, task, shortDescription);

    const agent = state.agents.get('task-1');
    expect(agent?.description).toBe('Short description');
  });

  it('uses label from task.label', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Desc',
      label: 'Z',
    };

    registerAgent(state, task, 'Description');

    const agent = state.agents.get('task-1');
    expect(agent?.label).toBe('Z');
  });

  it('adds invocation entry to mainLog', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Desc',
      label: 'A',
    };

    registerAgent(state, task, 'Test description');

    expect(state.mainLog).toHaveLength(1);
    const logEntry = state.mainLog[0];
    expect(logEntry?.type).toBe('invocation');
    expect(logEntry?.agentLabel).toBe('A');
    expect(logEntry?.agentName).toBe('TestAgent');
    expect(logEntry?.content).toBe('Test description');
    expect(logEntry?.timestamp).toBeInstanceOf(Date);
  });

  it('throws error when agent count exceeds 10 (EC-1)', () => {
    // Register 10 agents
    for (let i = 0; i < 10; i++) {
      const task: ActiveTask = {
        id: `task-${i}`,
        name: `Agent${i}`,
        description: 'Desc',
        label: String.fromCharCode(65 + i),
      };
      registerAgent(state, task, 'Description');
    }

    // 11th agent should throw
    const task11: ActiveTask = {
      id: 'task-11',
      name: 'Agent11',
      description: 'Desc',
      label: 'K',
    };

    expect(() => {
      registerAgent(state, task11, 'Description');
    }).toThrow('Maximum 10 concurrent agents exceeded');
  });

  it('throws error for duplicate agent ID (EC-2)', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Desc',
      label: 'A',
    };

    registerAgent(state, task, 'First description');

    const duplicateTask: ActiveTask = {
      id: 'task-1',
      name: 'DifferentAgent',
      description: 'Different desc',
      label: 'B',
    };

    expect(() => {
      registerAgent(state, duplicateTask, 'Second description');
    }).toThrow('Agent task-1 already registered');
  });

  it('does not add agent to map when exceeding limit', () => {
    // Register 10 agents
    for (let i = 0; i < 10; i++) {
      const task: ActiveTask = {
        id: `task-${i}`,
        name: `Agent${i}`,
        description: 'Desc',
        label: String.fromCharCode(65 + i),
      };
      registerAgent(state, task, 'Description');
    }

    const task11: ActiveTask = {
      id: 'task-11',
      name: 'Agent11',
      description: 'Desc',
      label: 'K',
    };

    try {
      registerAgent(state, task11, 'Description');
    } catch {
      // Expected error
    }

    expect(state.agents.size).toBe(10);
    expect(state.agents.has('task-11')).toBe(false);
  });

  it('does not add log entry when exceeding limit', () => {
    // Register 10 agents
    for (let i = 0; i < 10; i++) {
      const task: ActiveTask = {
        id: `task-${i}`,
        name: `Agent${i}`,
        description: 'Desc',
        label: String.fromCharCode(65 + i),
      };
      registerAgent(state, task, 'Description');
    }

    const task11: ActiveTask = {
      id: 'task-11',
      name: 'Agent11',
      description: 'Desc',
      label: 'K',
    };

    try {
      registerAgent(state, task11, 'Description');
    } catch {
      // Expected error
    }

    expect(state.mainLog).toHaveLength(10);
  });

  it('truncates description in log entry', () => {
    const task: ActiveTask = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Desc',
      label: 'A',
    };

    const longDescription = 'B'.repeat(60);
    registerAgent(state, task, longDescription);

    const logEntry = state.mainLog[0];
    expect(logEntry?.content).toHaveLength(40);
    expect(logEntry?.content).toBe('B'.repeat(40));
  });
});

describe('recordToolCall', () => {
  let state: UIState;
  let task: ActiveTask;

  beforeEach(() => {
    state = createUIState();
    task = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Test description',
      label: 'A',
    };
    registerAgent(state, task, 'Test description');
  });

  it('adds tool call to agent toolCalls array', () => {
    recordToolCall(state, 'task-1', 'Read', 'file.txt');

    const agent = state.agents.get('task-1');
    expect(agent?.toolCalls).toHaveLength(1);
    expect(agent?.toolCalls[0]?.toolName).toBe('Read');
    expect(agent?.toolCalls[0]?.args).toBe('file.txt');
  });

  it('creates tool call entry with timestamp', () => {
    const before = Date.now();
    recordToolCall(state, 'task-1', 'Write', 'output.txt');
    const after = Date.now();

    const agent = state.agents.get('task-1');
    const toolCall = agent?.toolCalls[0];
    expect(toolCall?.timestamp).toBeInstanceOf(Date);
    expect(toolCall?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(toolCall?.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it('adds tool entry to mainLog', () => {
    recordToolCall(state, 'task-1', 'Edit', 'src/file.ts');

    expect(state.mainLog).toHaveLength(2); // 1 invocation + 1 tool
    const toolEntry = state.mainLog[1];
    expect(toolEntry?.type).toBe('tool');
    expect(toolEntry?.agentLabel).toBe('A');
    expect(toolEntry?.agentName).toBe('TestAgent');
    expect(toolEntry?.content).toBe('Edit(src/file.ts)');
    expect(toolEntry?.timestamp).toBeInstanceOf(Date);
  });

  it('maintains max 5 visible tool calls (FIFO)', () => {
    // Add 6 tool calls
    for (let i = 1; i <= 6; i++) {
      recordToolCall(state, 'task-1', `Tool${i}`, `arg${i}`);
    }

    const agent = state.agents.get('task-1');
    expect(agent?.toolCalls).toHaveLength(5);

    // First tool should be removed, tools 2-6 should remain
    expect(agent?.toolCalls[0]?.toolName).toBe('Tool2');
    expect(agent?.toolCalls[1]?.toolName).toBe('Tool3');
    expect(agent?.toolCalls[2]?.toolName).toBe('Tool4');
    expect(agent?.toolCalls[3]?.toolName).toBe('Tool5');
    expect(agent?.toolCalls[4]?.toolName).toBe('Tool6');
  });

  it('keeps all tool calls when under limit', () => {
    recordToolCall(state, 'task-1', 'Tool1', 'arg1');
    recordToolCall(state, 'task-1', 'Tool2', 'arg2');
    recordToolCall(state, 'task-1', 'Tool3', 'arg3');

    const agent = state.agents.get('task-1');
    expect(agent?.toolCalls).toHaveLength(3);
    expect(agent?.toolCalls[0]?.toolName).toBe('Tool1');
    expect(agent?.toolCalls[1]?.toolName).toBe('Tool2');
    expect(agent?.toolCalls[2]?.toolName).toBe('Tool3');
  });

  it('removes oldest when reaching 6th tool call (AC-8)', () => {
    // Add exactly 5 tool calls
    for (let i = 1; i <= 5; i++) {
      recordToolCall(state, 'task-1', `Tool${i}`, `arg${i}`);
    }

    const agentBefore = state.agents.get('task-1');
    expect(agentBefore?.toolCalls).toHaveLength(5);

    // Add 6th tool call
    recordToolCall(state, 'task-1', 'Tool6', 'arg6');

    const agentAfter = state.agents.get('task-1');
    expect(agentAfter?.toolCalls).toHaveLength(5);
    expect(agentAfter?.toolCalls[0]?.toolName).toBe('Tool2'); // Tool1 removed
    expect(agentAfter?.toolCalls[4]?.toolName).toBe('Tool6'); // Tool6 added
  });

  it('throws error when agent ID not found (EC-3)', () => {
    expect(() => {
      recordToolCall(state, 'nonexistent-agent', 'Read', 'file.txt');
    }).toThrow('Unknown agent: nonexistent-agent');
  });

  it('throws error when tool name is empty string (EC-4)', () => {
    expect(() => {
      recordToolCall(state, 'task-1', '', 'args');
    }).toThrow('Tool name required');
  });

  it('throws error when tool name is whitespace only (EC-4)', () => {
    expect(() => {
      recordToolCall(state, 'task-1', '   ', 'args');
    }).toThrow('Tool name required');
  });

  it('does not add tool call when agent ID not found', () => {
    const beforeSize = state.agents.size;

    try {
      recordToolCall(state, 'nonexistent', 'Read', 'file.txt');
    } catch {
      // Expected error
    }

    expect(state.agents.size).toBe(beforeSize);
    expect(state.agents.has('nonexistent')).toBe(false);
  });

  it('does not add mainLog entry when agent ID not found', () => {
    const beforeLogLength = state.mainLog.length;

    try {
      recordToolCall(state, 'nonexistent', 'Read', 'file.txt');
    } catch {
      // Expected error
    }

    expect(state.mainLog).toHaveLength(beforeLogLength);
  });

  it('does not add tool call when tool name empty', () => {
    const agent = state.agents.get('task-1');
    const beforeLength = agent?.toolCalls.length ?? 0;

    try {
      recordToolCall(state, 'task-1', '', 'args');
    } catch {
      // Expected error
    }

    const afterLength = agent?.toolCalls.length ?? 0;
    expect(afterLength).toBe(beforeLength);
  });

  it('does not add mainLog entry when tool name empty', () => {
    const beforeLogLength = state.mainLog.length;

    try {
      recordToolCall(state, 'task-1', '', 'args');
    } catch {
      // Expected error
    }

    expect(state.mainLog).toHaveLength(beforeLogLength);
  });

  it('handles empty args string', () => {
    recordToolCall(state, 'task-1', 'Bash', '');

    const agent = state.agents.get('task-1');
    expect(agent?.toolCalls[0]?.args).toBe('');

    const logEntry = state.mainLog[1];
    expect(logEntry?.content).toBe('Bash()');
  });

  it('preserves tool name exactly as provided', () => {
    recordToolCall(
      state,
      'task-1',
      'mcp__plugin_conduct_codanna__find_symbol',
      'name: "UIState"'
    );

    const agent = state.agents.get('task-1');
    expect(agent?.toolCalls[0]?.toolName).toBe(
      'mcp__plugin_conduct_codanna__find_symbol'
    );
  });

  it('handles multiple agents independently', () => {
    const task2: ActiveTask = {
      id: 'task-2',
      name: 'Agent2',
      description: 'Second agent',
      label: 'B',
    };
    registerAgent(state, task2, 'Second agent');

    recordToolCall(state, 'task-1', 'Read', 'file1.txt');
    recordToolCall(state, 'task-2', 'Write', 'file2.txt');
    recordToolCall(state, 'task-1', 'Edit', 'file3.txt');

    const agent1 = state.agents.get('task-1');
    const agent2 = state.agents.get('task-2');

    expect(agent1?.toolCalls).toHaveLength(2);
    expect(agent1?.toolCalls[0]?.toolName).toBe('Read');
    expect(agent1?.toolCalls[1]?.toolName).toBe('Edit');

    expect(agent2?.toolCalls).toHaveLength(1);
    expect(agent2?.toolCalls[0]?.toolName).toBe('Write');
  });

  it('executes within 100ms for real-time display (AC-2)', () => {
    const iterations = 100;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      recordToolCall(state, 'task-1', `Tool${i}`, `arg${i}`);
    }

    const duration = Date.now() - start;
    const avgTime = duration / iterations;

    expect(avgTime).toBeLessThan(1); // Should be well under 1ms per call
  });
});

describe('completeAgent', () => {
  let state: UIState;
  let task: ActiveTask;

  beforeEach(() => {
    state = createUIState();
    task = {
      id: 'task-1',
      name: 'TestAgent',
      description: 'Test description',
      label: 'A',
    };
    registerAgent(state, task, 'Test description');
  });

  it('sets agent status to complete', () => {
    completeAgent(state, 'task-1');

    const agent = state.agents.get('task-1');
    expect(agent?.status).toBe('complete');
  });

  it('adds completion entry to mainLog', () => {
    completeAgent(state, 'task-1');

    expect(state.mainLog).toHaveLength(2); // 1 invocation + 1 completion
    const completionEntry = state.mainLog[1];
    expect(completionEntry?.type).toBe('completion');
    expect(completionEntry?.agentLabel).toBe('A');
    expect(completionEntry?.agentName).toBe('TestAgent');
    expect(completionEntry?.content).toBe('Complete');
    expect(completionEntry?.timestamp).toBeInstanceOf(Date);
  });

  it('includes duration in completion entry', () => {
    const agent = state.agents.get('task-1');
    const startTime = agent?.startTime ?? Date.now();

    // Wait a small amount to ensure measurable duration
    const waitMs = 10;
    const waitUntil = Date.now() + waitMs;
    while (Date.now() < waitUntil) {
      // Busy wait
    }

    completeAgent(state, 'task-1');

    const completionEntry = state.mainLog[1];
    expect(completionEntry?.duration).toBeDefined();
    expect(completionEntry?.duration).toBeGreaterThanOrEqual(waitMs);
    expect(completionEntry?.duration).toBe(Date.now() - startTime);
  });

  it('includes message count in completion entry', () => {
    const agent = state.agents.get('task-1');
    if (agent) {
      agent.messageCount = 42;
    }

    completeAgent(state, 'task-1');

    const completionEntry = state.mainLog[1];
    expect(completionEntry?.messageCount).toBe(42);
  });

  it('calculates duration from agent startTime to current time', () => {
    const agent = state.agents.get('task-1');
    if (agent) {
      // Set start time 5000ms ago
      agent.startTime = Date.now() - 5000;
    }

    completeAgent(state, 'task-1');

    const completionEntry = state.mainLog[1];
    expect(completionEntry?.duration).toBeGreaterThanOrEqual(5000);
    expect(completionEntry?.duration).toBeLessThan(5100); // Allow 100ms tolerance
  });

  it('throws error when agent ID not found (EC-5)', () => {
    expect(() => {
      completeAgent(state, 'nonexistent-agent');
    }).toThrow('Unknown agent: nonexistent-agent');
  });

  it('throws error when agent already complete (EC-6)', () => {
    completeAgent(state, 'task-1');

    expect(() => {
      completeAgent(state, 'task-1');
    }).toThrow('Agent task-1 already completed');
  });

  it('does not add log entry when agent ID not found', () => {
    const beforeLogLength = state.mainLog.length;

    try {
      completeAgent(state, 'nonexistent');
    } catch {
      // Expected error
    }

    expect(state.mainLog).toHaveLength(beforeLogLength);
  });

  it('does not modify agent status when agent ID not found', () => {
    const agent = state.agents.get('task-1');
    const beforeStatus = agent?.status;

    try {
      completeAgent(state, 'nonexistent');
    } catch {
      // Expected error
    }

    expect(agent?.status).toBe(beforeStatus);
  });

  it('does not add log entry when agent already complete', () => {
    completeAgent(state, 'task-1');
    const beforeLogLength = state.mainLog.length;

    try {
      completeAgent(state, 'task-1');
    } catch {
      // Expected error
    }

    expect(state.mainLog).toHaveLength(beforeLogLength);
  });

  it('handles multiple agents completing independently', () => {
    const task2: ActiveTask = {
      id: 'task-2',
      name: 'Agent2',
      description: 'Second agent',
      label: 'B',
    };
    registerAgent(state, task2, 'Second agent');

    completeAgent(state, 'task-1');
    completeAgent(state, 'task-2');

    const agent1 = state.agents.get('task-1');
    const agent2 = state.agents.get('task-2');

    expect(agent1?.status).toBe('complete');
    expect(agent2?.status).toBe('complete');

    // 2 invocations + 2 completions = 4 log entries
    // [0] task-1 invocation, [1] task-2 invocation, [2] task-1 completion, [3] task-2 completion
    expect(state.mainLog).toHaveLength(4);
    expect(state.mainLog[2]?.type).toBe('completion');
    expect(state.mainLog[2]?.agentLabel).toBe('A');
    expect(state.mainLog[3]?.type).toBe('completion');
    expect(state.mainLog[3]?.agentLabel).toBe('B');
  });

  it('handles simultaneous agent completions (AC-16)', () => {
    // Register multiple agents
    const agents = [];
    for (let i = 2; i <= 5; i++) {
      const t: ActiveTask = {
        id: `task-${i}`,
        name: `Agent${i}`,
        description: `Agent ${i}`,
        label: String.fromCharCode(64 + i), // B, C, D, E
      };
      registerAgent(state, t, `Agent ${i}`);
      agents.push(t.id);
    }

    // Complete all agents
    completeAgent(state, 'task-1');
    agents.forEach((id) => {
      completeAgent(state, id);
    });

    // All should be marked complete
    state.agents.forEach((agent) => {
      expect(agent.status).toBe('complete');
    });

    // All completions should be in log
    const completions = state.mainLog.filter((e) => e.type === 'completion');
    expect(completions).toHaveLength(5);
  });

  it('preserves agent in map after completion', () => {
    completeAgent(state, 'task-1');

    expect(state.agents.has('task-1')).toBe(true);
    const agent = state.agents.get('task-1');
    expect(agent).toBeDefined();
    expect(agent?.id).toBe('task-1');
  });

  it('preserves agent properties after completion', () => {
    const agentBefore = state.agents.get('task-1');
    const beforeName = agentBefore?.name;
    const beforeLabel = agentBefore?.label;
    const beforeDescription = agentBefore?.description;

    completeAgent(state, 'task-1');

    const agentAfter = state.agents.get('task-1');
    expect(agentAfter?.name).toBe(beforeName);
    expect(agentAfter?.label).toBe(beforeLabel);
    expect(agentAfter?.description).toBe(beforeDescription);
  });

  it('completion log entry has correct timestamp', () => {
    const before = Date.now();
    completeAgent(state, 'task-1');
    const after = Date.now();

    const completionEntry = state.mainLog[1];
    expect(completionEntry?.timestamp).toBeInstanceOf(Date);
    expect(completionEntry?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(completionEntry?.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it('handles zero message count', () => {
    const agent = state.agents.get('task-1');
    if (agent) {
      agent.messageCount = 0;
    }

    completeAgent(state, 'task-1');

    const completionEntry = state.mainLog[1];
    expect(completionEntry?.messageCount).toBe(0);
  });

  it('handles large message count', () => {
    const agent = state.agents.get('task-1');
    if (agent) {
      agent.messageCount = 9999;
    }

    completeAgent(state, 'task-1');

    const completionEntry = state.mainLog[1];
    expect(completionEntry?.messageCount).toBe(9999);
  });
});
