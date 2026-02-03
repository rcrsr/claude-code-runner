/**
 * UI component formatting functions for parallel agent display
 */

import {
  UI_MAX_VISIBLE_LOG,
  UI_MAX_VISIBLE_TOOLS,
  UI_MIN_BOX_WIDTH,
} from '../utils/constants.js';
import { colors } from './colors.js';
import {
  colorize,
  formatDuration,
  formatTimestamp,
  stripAnsi,
  truncate,
} from './colors.js';
import type { AgentState, LogEntry } from './ui-state.js';

/**
 * Spinner frames for loading animation
 */
const SPINNER_FRAMES = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
] as const;

/**
 * Format single log entry with colors
 * Timestamp: dim HH:MM:SS.mmm
 * Agent name: yellow
 * Agent label: magenta
 * Tool names: blue
 * Completion stats: green duration and count
 */
export function formatLogEntry(entry: LogEntry): string {
  const timestamp = colorize(formatTimestamp(entry.timestamp), 'dim');
  const agentName = colorize(entry.agentName, 'yellow');
  const label = colorize(`[${entry.agentLabel}]`, 'magenta');

  switch (entry.type) {
    case 'invocation': {
      return `${timestamp} ${label} ${agentName} ${entry.content}`;
    }

    case 'tool': {
      // Extract tool name and args from content format: "toolName(args)"
      const regex = /^([^(]+)\((.*)\)$/;
      const match = regex.exec(entry.content);
      const toolNamePart = match?.[1];
      const argsPart = match?.[2];
      if (toolNamePart !== undefined && argsPart !== undefined) {
        const toolName = colorize(toolNamePart, 'blue');
        return `${timestamp} ${label} ${agentName} ${toolName}(${argsPart})`;
      }
      // Fallback if content doesn't match expected format
      return `${timestamp} ${label} ${agentName} ${entry.content}`;
    }

    case 'completion': {
      const duration =
        entry.duration !== undefined
          ? colorize(formatDuration(entry.duration), 'green')
          : '';
      const messageCount =
        entry.messageCount !== undefined
          ? colorize(`${entry.messageCount} msgs`, 'green')
          : '';

      const stats = [duration, messageCount].filter(Boolean).join(' ');
      return `${timestamp} ${label} ${agentName} ${entry.content}${stats ? ` ${stats}` : ''}`;
    }

    default: {
      // Exhaustiveness check - should never reach here
      entry.type satisfies never;
      return `${timestamp} ${label} ${agentName} ${entry.content}`;
    }
  }
}

/**
 * Generate ANSI-formatted lines for consolidated timeline
 * Shows max 10 entries during execution, all entries when complete
 *
 * @param entries - Log entries sorted chronologically
 * @param allComplete - Whether all agents have completed
 * @returns Array of formatted lines including header and entries
 */
export function renderMainLog(
  entries: LogEntry[],
  allComplete: boolean
): string[] {
  const lines: string[] = [];

  // Generate header with centered "main log" and optional spinner
  const headerText = 'main log';
  const spinner = allComplete ? '' : SPINNER_FRAMES[0];
  const header = spinner ? `${spinner} ${headerText}` : headerText;
  lines.push(header);

  // Determine which entries to show based on completion status
  const visibleEntries = allComplete
    ? entries
    : entries.slice(-UI_MAX_VISIBLE_LOG);

  // Format and add each visible entry
  for (const entry of visibleEntries) {
    lines.push(formatLogEntry(entry));
  }

  return lines;
}

/**
 * Generate ANSI-formatted lines for single agent box
 * Width adapts to terminal width, max 70 characters
 * Single-line border style using box-drawing characters
 *
 * @param agent - Agent state with name, label, description, tool calls
 * @param width - Box width in characters
 * @returns Array of formatted lines representing the box
 * @throws {Error} if width < 30
 */
export function renderAgentBox(agent: AgentState, width: number): string[] {
  // EC-9: Validate minimum width
  if (width < UI_MIN_BOX_WIDTH) {
    throw new Error(`Box width ${width} below minimum 30`);
  }

  const lines: string[] = [];
  const contentWidth = width - 4; // Account for border characters and padding

  // Header: yellow name, magenta label, description
  const nameText = colorize(agent.name, 'yellow');
  const labelText = colorize(`[${agent.label}]`, 'magenta');

  // Calculate plain text lengths for layout
  const nameLen = agent.name.length;
  const labelLen = agent.label.length + 2; // brackets add 2 chars
  const prefixLen = nameLen + 1 + labelLen + 1; // name + space + label + space

  // Truncate description if needed (truncate adds '...' so subtract 3 from available space)
  const descMaxLen = contentWidth - prefixLen;
  const truncatedDesc =
    agent.description.length > descMaxLen
      ? truncate(agent.description, descMaxLen - 3)
      : agent.description;

  const headerContent = `${nameText} ${labelText} ${truncatedDesc}`;

  // Top border
  lines.push(`┌${'─'.repeat(width - 2)}┐`);

  // Header line - calculate padding based on actual plain-text length
  const headerPlainLength = stripAnsi(headerContent).length;
  lines.push(
    `│ ${headerContent}${' '.repeat(Math.max(0, contentWidth - headerPlainLength))} │`
  );

  // Body: 5 tool call lines or ellipsis
  if (agent.toolCalls.length === 0) {
    // AC-14: Empty tool call list shows ellipsis
    lines.push(
      `│ ${colors.dim}...${colors.reset}${' '.repeat(contentWidth - 3)} │`
    );
  } else {
    // Show last 5 tool calls
    const visibleCalls = agent.toolCalls.slice(-UI_MAX_VISIBLE_TOOLS);
    for (const call of visibleCalls) {
      const toolText = colorize(call.toolName, 'blue');
      const argsText = truncate(
        call.args,
        contentWidth - call.toolName.length - 2
      );
      const lineContent = `${toolText}(${argsText})`;
      const plainContent = `${call.toolName}(${argsText})`;
      const padding = ' '.repeat(
        Math.max(0, contentWidth - plainContent.length)
      );
      lines.push(`│ ${lineContent}${padding} │`);
    }
  }

  // Footer: dim elapsed time, message count, spinner
  const elapsed = Date.now() - agent.startTime;
  const elapsedText = colorize(formatDuration(elapsed), 'dim');
  const messageText = colorize(`${agent.messageCount} msgs`, 'dim');
  const spinnerChar = agent.status === 'running' ? SPINNER_FRAMES[0] : '';
  const footerContent = `${elapsedText} ${messageText} ${spinnerChar}`;
  const footerPlain = `${formatDuration(elapsed)} ${agent.messageCount} msgs ${spinnerChar}`;
  const footerPadding = ' '.repeat(
    Math.max(0, contentWidth - footerPlain.length)
  );

  lines.push(`│ ${footerContent}${footerPadding} │`);

  // Bottom border
  lines.push(`└${'─'.repeat(width - 2)}┘`);

  return lines;
}
