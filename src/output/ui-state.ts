/**
 * UI state management for parallel agent display
 */

import type { ActiveTask } from '../types/runner.js';
import {
  UI_MAX_AGENTS,
  UI_MAX_DESCRIPTION_LENGTH,
  UI_MAX_VISIBLE_TOOLS,
} from '../utils/constants.js';

/**
 * Entry in the main execution log
 */
export interface LogEntry {
  timestamp: Date;
  agentLabel: string;
  agentName: string;
  type: 'invocation' | 'tool' | 'completion';
  content: string;
  duration?: number;
  messageCount?: number;
}

/**
 * Individual tool call record
 */
export interface ToolCallEntry {
  toolName: string;
  args: string;
  timestamp: Date;
}

/**
 * State for a single agent/task
 */
export interface AgentState {
  id: string;
  name: string;
  description: string;
  label: string;
  toolCalls: ToolCallEntry[];
  messageCount: number;
  startTime: number;
  status: 'running' | 'complete';
}

/**
 * Overall UI state for parallel agent display
 */
export interface UIState {
  agents: Map<string, AgentState>;
  mainLog: LogEntry[];
  renderStartTime: number;
  spinnerFrame: number;
}

/**
 * Create initial UI state with empty agents and log
 */
export function createUIState(): UIState {
  return {
    agents: new Map(),
    mainLog: [],
    renderStartTime: Date.now(),
    spinnerFrame: 0,
  };
}

/**
 * Register a new agent in the UI state
 * @throws {Error} if agent count exceeds UI_MAX_AGENTS
 * @throws {Error} if agent ID already registered
 */
export function registerAgent(
  state: UIState,
  task: ActiveTask,
  description: string
): void {
  // EC-1: Check agent count limit
  if (state.agents.size >= UI_MAX_AGENTS) {
    throw new Error('Maximum 10 concurrent agents exceeded');
  }

  // EC-2: Check for duplicate agent ID
  if (state.agents.has(task.id)) {
    throw new Error(`Agent ${task.id} already registered`);
  }

  // Truncate description to 40 characters
  const truncatedDescription =
    description.length > UI_MAX_DESCRIPTION_LENGTH
      ? description.slice(0, UI_MAX_DESCRIPTION_LENGTH)
      : description;

  // Create agent state
  const agentState: AgentState = {
    id: task.id,
    name: task.name,
    description: truncatedDescription,
    label: task.label,
    toolCalls: [],
    messageCount: 0,
    startTime: Date.now(),
    status: 'running',
  };

  // Add to agents map
  state.agents.set(task.id, agentState);

  // Add invocation entry to main log
  const logEntry: LogEntry = {
    timestamp: new Date(),
    agentLabel: task.label,
    agentName: task.name,
    type: 'invocation',
    content: truncatedDescription,
  };

  state.mainLog.push(logEntry);
}

/**
 * Record a tool call for an agent
 * @throws {Error} if agent ID not found
 * @throws {Error} if tool name empty
 */
export function recordToolCall(
  state: UIState,
  agentId: string,
  toolName: string,
  args: string
): void {
  // EC-3: Check agent ID exists
  const agent = state.agents.get(agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // EC-4: Check tool name not empty
  if (!toolName || toolName.trim().length === 0) {
    throw new Error('Tool name required');
  }

  // Create tool call entry
  const toolCall: ToolCallEntry = {
    toolName,
    args,
    timestamp: new Date(),
  };

  // Add to agent's tool calls (FIFO management for max 5 visible)
  agent.toolCalls.push(toolCall);

  // AC-8: Remove oldest if exceeds max visible tools
  if (agent.toolCalls.length > UI_MAX_VISIBLE_TOOLS) {
    agent.toolCalls.shift();
  }

  // Add tool call entry to main log
  const logEntry: LogEntry = {
    timestamp: new Date(),
    agentLabel: agent.label,
    agentName: agent.name,
    type: 'tool',
    content: `${toolName}(${args})`,
  };

  state.mainLog.push(logEntry);
}

/**
 * Mark agent complete and add completion entry to main log
 * @throws {Error} if agent ID not found
 * @throws {Error} if agent already complete
 */
export function completeAgent(state: UIState, agentId: string): void {
  // EC-5: Check agent ID exists
  const agent = state.agents.get(agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // EC-6: Check agent not already complete
  if (agent.status === 'complete') {
    throw new Error(`Agent ${agentId} already completed`);
  }

  // Calculate duration from agent start time to current time
  const duration = Date.now() - agent.startTime;

  // Set agent status to 'complete' for renderer to remove box
  agent.status = 'complete';

  // Add completion entry to main log with duration and message count
  const logEntry: LogEntry = {
    timestamp: new Date(),
    agentLabel: agent.label,
    agentName: agent.name,
    type: 'completion',
    content: 'Complete',
    duration,
    messageCount: agent.messageCount,
  };

  state.mainLog.push(logEntry);
}
