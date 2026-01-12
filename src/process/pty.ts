/**
 * PTY process management for Claude CLI
 */

import type { IPty } from 'node-pty';
import * as pty from 'node-pty';

import type { FormatterState } from '../output/formatter.js';
import {
  flushPendingTools,
  formatMessage,
  resetFormatterState,
} from '../output/formatter.js';
import type { Logger } from '../output/logger.js';
import { createStreamParser } from '../parsers/stream.js';
import type { RunResult, Verbosity } from '../types/runner.js';

export interface ClaudeProcessOptions {
  prompt: string;
  cwd: string;
  verbosity: Verbosity;
  logger: Logger;
  formatterState: FormatterState;
  parallelThresholdMs: number;
}

/**
 * Spawn Claude CLI process with PTY
 */
export function spawnClaude(options: ClaudeProcessOptions): Promise<RunResult> {
  const {
    prompt,
    cwd,
    verbosity,
    logger,
    formatterState,
    parallelThresholdMs,
  } = options;

  return new Promise((resolve) => {
    // Reset state for new run
    resetFormatterState(formatterState);

    const runStart = Date.now();
    let claudeText = '';
    const parser = createStreamParser();

    const ptyProcess: IPty = pty.spawn(
      'claude',
      [
        '-p',
        prompt,
        '--dangerously-skip-permissions',
        '--verbose',
        '--output-format',
        'stream-json',
      ],
      {
        name: 'xterm-256color',
        cols: 200,
        rows: 50,
        cwd,
        env: { ...process.env },
      }
    );

    ptyProcess.onData((data: string) => {
      const messages = parser.process(data);

      for (const msg of messages) {
        const text = formatMessage(
          msg,
          formatterState,
          verbosity,
          logger,
          parallelThresholdMs
        );
        claudeText += text;
        logger.log(JSON.stringify(msg));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      flushPendingTools(formatterState, verbosity);
      const duration = Math.round((Date.now() - runStart) / 1000);
      resolve({ exitCode, duration, claudeText });
    });
  });
}
