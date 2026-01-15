/**
 * Run statistics tracking and summary formatting
 * Tracks messages, tokens, and tool usage for display
 */

import type { TokenUsage } from '../types/claude.js';
import { formatDuration } from './colors.js';

/**
 * Aggregated token counts
 */
export interface TokenCounts {
  /** Prompt tokens (non-cached input) */
  prompt: number;
  /** Cache write 5m tokens */
  cacheWrite5m: number;
  /** Cache write 1h tokens */
  cacheWrite1h: number;
  /** Cache read tokens */
  cacheRead: number;
  /** Output tokens (estimated from content) */
  output: number;
}

/**
 * Run statistics
 */
export interface RunStats {
  /** Message count */
  messageCount: number;
  /** Token usage */
  tokens: TokenCounts;
  /** Tool names used */
  toolsUsed: Set<string>;
  /** Tool use count */
  toolUseCount: number;
  /** Characters of output (for token estimation) */
  outputChars: number;
}

/**
 * Create empty run stats
 */
export function createRunStats(): RunStats {
  return {
    messageCount: 0,
    tokens: {
      prompt: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
      output: 0,
    },
    toolsUsed: new Set(),
    toolUseCount: 0,
    outputChars: 0,
  };
}

/**
 * Reset run stats (for new step/task)
 */
export function resetRunStats(stats: RunStats): void {
  stats.messageCount = 0;
  stats.tokens = {
    prompt: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    cacheRead: 0,
    output: 0,
  };
  stats.toolsUsed.clear();
  stats.toolUseCount = 0;
  stats.outputChars = 0;
}

/**
 * Update stats from token usage
 */
export function updateTokenStats(stats: RunStats, usage: TokenUsage): void {
  stats.tokens.prompt += usage.input_tokens ?? 0;
  stats.tokens.cacheWrite5m +=
    usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  stats.tokens.cacheWrite1h +=
    usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  stats.tokens.cacheRead += usage.cache_read_input_tokens ?? 0;
}

/**
 * Record a tool use
 */
export function recordToolUse(stats: RunStats, toolName: string): void {
  stats.toolsUsed.add(toolName);
  stats.toolUseCount++;
}

/**
 * Record output characters for token estimation
 */
export function recordOutput(stats: RunStats, chars: number): void {
  stats.outputChars += chars;
}

/**
 * Increment message count
 */
export function incrementMessageCount(stats: RunStats): void {
  stats.messageCount++;
}

/**
 * Merge source stats into target (accumulates values)
 */
export function mergeStats(target: RunStats, source: RunStats): void {
  target.messageCount += source.messageCount;
  target.tokens.prompt += source.tokens.prompt;
  target.tokens.cacheWrite5m += source.tokens.cacheWrite5m;
  target.tokens.cacheWrite1h += source.tokens.cacheWrite1h;
  target.tokens.cacheRead += source.tokens.cacheRead;
  target.tokens.output += source.tokens.output;
  for (const tool of source.toolsUsed) {
    target.toolsUsed.add(tool);
  }
  target.toolUseCount += source.toolUseCount;
  target.outputChars += source.outputChars;
}

/**
 * Clone stats (creates a copy)
 */
export function cloneStats(stats: RunStats): RunStats {
  return {
    messageCount: stats.messageCount,
    tokens: { ...stats.tokens },
    toolsUsed: new Set(stats.toolsUsed),
    toolUseCount: stats.toolUseCount,
    outputChars: stats.outputChars,
  };
}

/**
 * Calculate total input tokens
 */
function totalInputTokens(tokens: TokenCounts): number {
  return (
    tokens.prompt + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead
  );
}

/**
 * Estimate output tokens from character count
 * Rough estimate: ~4 chars per token
 */
function estimateOutputTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * Format number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format stats summary for display
 * Example: 33s | 14 msgs | 319,449 in (32 p / 6,579 cw5m / 312,838 cr) | ~931 out | 3 tools (Bash, Edit, Read)
 */
export function formatStatsSummary(
  stats: RunStats,
  durationMs: number
): string {
  const parts: string[] = [];

  // Duration
  parts.push(formatDuration(durationMs));

  // Message count
  parts.push(`${stats.messageCount} msgs`);

  // Input tokens with breakdown
  const totalIn = totalInputTokens(stats.tokens);
  const breakdownParts: string[] = [];
  if (stats.tokens.prompt > 0) {
    breakdownParts.push(`${formatNumber(stats.tokens.prompt)} p`);
  }
  if (stats.tokens.cacheWrite5m > 0) {
    breakdownParts.push(`${formatNumber(stats.tokens.cacheWrite5m)} cw5m`);
  }
  if (stats.tokens.cacheWrite1h > 0) {
    breakdownParts.push(`${formatNumber(stats.tokens.cacheWrite1h)} cw1h`);
  }
  if (stats.tokens.cacheRead > 0) {
    breakdownParts.push(`${formatNumber(stats.tokens.cacheRead)} cr`);
  }
  const breakdown =
    breakdownParts.length > 0 ? ` (${breakdownParts.join(' / ')})` : '';
  parts.push(`${formatNumber(totalIn)} in${breakdown}`);

  // Output tokens (estimated)
  const outputTokens = estimateOutputTokens(stats.outputChars);
  parts.push(`~${formatNumber(outputTokens)} out`);

  // Tools
  if (stats.toolUseCount > 0) {
    const toolList = Array.from(stats.toolsUsed).sort().join(', ');
    parts.push(`${stats.toolUseCount} tools (${toolList})`);
  }

  return parts.join(' | ');
}
