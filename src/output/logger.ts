/**
 * File logging with ANSI stripping
 */

import * as fs from 'fs';
import * as path from 'path';

import { stripAnsi } from './colors.js';

export interface Logger {
  log(msg: string): void;
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
      // Strip ANSI codes for clean log file
      logStream.write(stripAnsi(msg) + '\n');
    },
    close(): void {
      logStream.end();
    },
    filePath: logFile,
  };
}
