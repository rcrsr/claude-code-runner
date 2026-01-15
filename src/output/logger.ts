/**
 * File logging with ANSI stripping
 */

import * as fs from 'fs';
import * as path from 'path';

import { stripAnsi } from './colors.js';

/**
 * Runner event for structured logging
 */
export interface RunnerEvent {
  type: 'runner';
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface Logger {
  log(msg: string): void;
  logEvent(event: Omit<RunnerEvent, 'type' | 'timestamp'>): void;
  close(): void;
  filePath: string | null;
}

/**
 * Create a logger that writes to a timestamped log file
 */
export function createLogger(
  enabled: boolean,
  logDir: string,
  commandName: string
): Logger {
  if (!enabled) {
    return {
      log: () => undefined,
      logEvent: () => undefined,
      close: () => undefined,
      filePath: null,
    };
  }

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Create timestamped filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sanitizedName = path.basename(commandName, '.txt');
  const logFile = path.join(logDir, `${sanitizedName}-${timestamp}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  return {
    log(msg: string): void {
      // Strip ANSI codes but preserve CRs for full fidelity
      const clean = stripAnsi(msg);
      logStream.write(clean + '\n');
    },
    logEvent(eventData: Omit<RunnerEvent, 'type' | 'timestamp'>): void {
      const fullEvent = {
        type: 'runner' as const,
        timestamp: new Date().toISOString(),
        ...eventData,
      };
      logStream.write(JSON.stringify(fullEvent) + '\n');
    },
    close(): void {
      logStream.end();
    },
    filePath: logFile,
  };
}
