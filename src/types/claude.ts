/**
 * Types for Claude CLI stream-json output messages
 */

// Content blocks in assistant/user messages
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// MCP server status
export interface McpServer {
  name: string;
  status: 'connected' | 'failed' | 'connecting';
}

// Token usage from API
export interface CacheCreation {
  ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: CacheCreation;
}

// Message envelope
export interface MessageEnvelope {
  role: 'assistant' | 'user';
  content: ContentBlock[];
  usage?: TokenUsage;
}

// System init message
export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  model: string;
  tools?: string[];
  mcp_servers?: McpServer[];
}

// Assistant message
export interface AssistantMessage {
  type: 'assistant';
  message: MessageEnvelope;
}

// User message (typically tool results)
export interface UserMessage {
  type: 'user';
  message: MessageEnvelope;
}

// Result message at end of run
export interface ResultMessage {
  type: 'result';
  duration_ms?: number;
  cost_usd?: number;
  is_error?: boolean;
}

// Generic message for unknown types
export interface GenericMessage {
  type: string;
  subtype?: string;
  [key: string]: unknown;
}

export type ClaudeMessage =
  | SystemInitMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | GenericMessage;

/**
 * Type guard functions
 */
export function isSystemInitMessage(
  msg: ClaudeMessage
): msg is SystemInitMessage {
  return msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init';
}

export function isAssistantMessage(
  msg: ClaudeMessage
): msg is AssistantMessage {
  return msg.type === 'assistant';
}

export function isUserMessage(msg: ClaudeMessage): msg is UserMessage {
  return msg.type === 'user';
}

export function isResultMessage(msg: ClaudeMessage): msg is ResultMessage {
  return msg.type === 'result';
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

export function isToolResultBlock(
  block: ContentBlock
): block is ToolResultBlock {
  return block.type === 'tool_result';
}

export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}
