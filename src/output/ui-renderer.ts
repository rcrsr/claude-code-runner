/**
 * UI renderer for parallel agent display
 * Manages 60fps render loop with terminal clear/redraw
 */

import {
  UI_MIN_TERMINAL_WIDTH,
  UI_RENDER_INTERVAL_MS,
  UI_SPINNER_INTERVAL_MS,
} from '../utils/constants.js';
import { terminalLog } from './colors.js';
import type { UIState } from './ui-state.js';

export interface UIRenderer {
  start(): void;
  stop(): void;
  render(): void;
}

/**
 * Create a UI renderer with 60fps render loop
 * @param state - UI state to render
 * @returns UIRenderer interface
 * @throws {Error} EC-8: Terminal width < 70
 */
export function createUIRenderer(state: UIState): UIRenderer {
  let intervalId: NodeJS.Timeout | null = null;
  let frameCount = 0;

  return {
    start(): void {
      // EC-7: Already started → Error
      if (intervalId !== null) {
        throw new Error('Renderer already running');
      }

      // EC-8: Terminal width < 70 → Error
      const terminalWidth = process.stdout.columns || 80;
      if (terminalWidth < UI_MIN_TERMINAL_WIDTH) {
        throw new Error(
          `Terminal width ${terminalWidth} below minimum ${UI_MIN_TERMINAL_WIDTH}`
        );
      }

      // Start 60fps render loop (16ms interval)
      intervalId = setInterval(() => {
        frameCount++;

        // Advance spinner every 96ms (every 6 frames)
        if (
          frameCount % (UI_SPINNER_INTERVAL_MS / UI_RENDER_INTERVAL_MS) ===
          0
        ) {
          state.spinnerFrame = (state.spinnerFrame + 1) % 4;
        }

        // Clear terminal and render current state
        this.render();

        // Stop when all agents complete
        const allComplete = Array.from(state.agents.values()).every(
          (agent) => agent.status === 'complete'
        );
        if (allComplete && state.agents.size > 0) {
          this.stop();
        }
      }, UI_RENDER_INTERVAL_MS);
    },

    stop(): void {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    render(): void {
      // Clear terminal
      console.clear();

      // Render UI state
      terminalLog('=== Parallel Agent Execution ===');

      // Show running agents
      const runningAgents = Array.from(state.agents.values()).filter(
        (agent) => agent.status === 'running'
      );

      if (runningAgents.length === 0) {
        terminalLog('No active agents');
      } else {
        for (const agent of runningAgents) {
          const spinnerChars = ['⠋', '⠙', '⠹', '⠸'];
          const spinner = spinnerChars[state.spinnerFrame] ?? '⠋';
          terminalLog(
            `${spinner} [${agent.label}] ${agent.name}: ${agent.description}`
          );

          // Show recent tool calls
          if (agent.toolCalls.length > 0) {
            for (const toolCall of agent.toolCalls) {
              terminalLog(`  → ${toolCall.toolName}(${toolCall.args})`);
            }
          }
        }
      }

      // Show recent log entries
      if (state.mainLog.length > 0) {
        terminalLog('\n--- Recent Activity ---');
        const recentLog = state.mainLog.slice(-10);
        for (const entry of recentLog) {
          const time = entry.timestamp.toLocaleTimeString();
          terminalLog(`${time} [${entry.agentLabel}] ${entry.content}`);
        }
      }
    },
  };
}
