/**
 * Stream JSON parser for Claude CLI output
 * Handles line-by-line JSON parsing with ANSI stripping
 */

import { stripAnsi } from '../output/colors.js';
import type { ClaudeMessage } from '../types/claude.js';

export interface StreamParser {
  /** Process incoming data chunk, returns parsed messages */
  process(data: string): ClaudeMessage[];
  /** Get any remaining buffer content */
  flush(): string;
}

/**
 * Create a stream parser for Claude CLI JSON output
 */
export function createStreamParser(): StreamParser {
  let buffer = '';

  return {
    process(data: string): ClaudeMessage[] {
      buffer += data;
      const messages: ClaudeMessage[] = [];

      // Process complete JSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        // Strip ANSI escape codes and other terminal artifacts
        const cleaned = stripAnsi(trimmed).replace(/\[<u/g, '');
        if (!cleaned) {
          continue;
        }

        try {
          const msg = JSON.parse(cleaned) as ClaudeMessage;
          messages.push(msg);
        } catch {
          // Not valid JSON - skip terminal control codes
        }
      }

      return messages;
    },

    flush(): string {
      const remaining = buffer;
      buffer = '';
      return remaining;
    },
  };
}
