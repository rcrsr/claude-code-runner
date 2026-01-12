#!/usr/bin/env node
/**
 * Claude Code Runner - executes claude CLI with proper TTY handling
 * Shows intermediate tool calls and responses in real-time
 */

import { parseArgs, parseCommandLine } from './cli/args.js';
import { type RunnerContext, runWithSignals } from './core/runner.js';
import { colors, formatDuration, truncate } from './output/colors.js';
import { createFormatterState } from './output/formatter.js';
import { createLogger } from './output/logger.js';
import { DEFAULT_CONFIG, type RunnerConfig } from './types/runner.js';

async function main(): Promise<void> {
  const totalStart = Date.now();
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  // Merge config with defaults
  const config: RunnerConfig = {
    ...DEFAULT_CONFIG,
    ...parsed.config,
  };

  // Create logger
  const commandName = parsed.scriptMode
    ? 'script'
    : parsed.subcommand === 'command'
      ? (args[1] ?? 'prompt')
      : 'prompt';
  const logger = createLogger(config.enableLog, config.logDir, commandName);

  // Create formatter state
  const formatterState = createFormatterState();

  // Create runner context
  const context: RunnerContext = {
    config,
    logger,
    formatterState,
    cwd: process.cwd(),
  };

  // Print header
  printHeader(parsed.subcommand, config.verbosity, logger.filePath);
  logger.log(`Started: ${new Date().toISOString()}`);

  if (parsed.scriptMode) {
    // Script mode: run each line
    await runScriptMode(parsed.scriptLines, context, totalStart);
  } else {
    // Single command mode
    await runSingleMode(parsed.prompt, context, totalStart);
  }
}

/**
 * Print runner header
 */
function printHeader(
  mode: string,
  verbosity: string,
  logFile: string | null
): void {
  console.log(
    `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.bold}Claude Code Runner${colors.reset} ${colors.dim}(${verbosity}, ${mode})${colors.reset}`
  );
  console.log(
    `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
  );
  if (logFile) {
    console.log(`${colors.dim}Log:${colors.reset} ${logFile}`);
  }
}

/**
 * Run in single command mode (prompt or command)
 */
async function runSingleMode(
  prompt: string,
  context: RunnerContext,
  startTime: number
): Promise<void> {
  console.log(`${colors.dim}Prompt:${colors.reset} ${truncate(prompt, 80)}`);
  console.log('');
  context.logger.log(`Prompt: ${prompt}\n`);

  const result = await runWithSignals(prompt, startTime, context);
  context.logger.close();
  process.exit(result === 'ok' ? 0 : 1);
}

/**
 * Run in script mode
 */
async function runScriptMode(
  scriptLines: string[],
  context: RunnerContext,
  startTime: number
): Promise<void> {
  console.log(
    `${colors.dim}Script:${colors.reset} ${scriptLines.length} commands`
  );
  console.log('');
  context.logger.log(`Script: ${scriptLines.length} commands\n`);

  for (const [i, line] of scriptLines.entries()) {
    printScriptStep(i + 1, scriptLines.length, line);
    context.logger.log(`\n=== [${i + 1}/${scriptLines.length}] ${line} ===\n`);

    let result: 'ok' | 'blocked' | 'error';
    try {
      const parsed = parseCommandLine(line);
      result = await runWithSignals(parsed.prompt, startTime, context);
    } catch (err) {
      console.log(
        `${colors.red}PARSE ERROR:${colors.reset} ${(err as Error).message}`
      );
      result = 'error';
    }

    if (result === 'blocked' || result === 'error') {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      console.log('');
      console.log(
        `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
      );
      console.log(
        `${colors.red}SCRIPT STOPPED${colors.reset} at step ${i + 1}/${scriptLines.length} | Total: ${formatDuration(totalDuration * 1000)}`
      );
      console.log(
        `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
      );
      context.logger.log(
        `\nSCRIPT STOPPED at step ${i + 1}, ${totalDuration}s total`
      );
      context.logger.close();
      process.exit(1);
    }
  }

  // All commands completed
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  console.log('');
  console.log(
    `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.green}SCRIPT COMPLETE${colors.reset} | ${scriptLines.length} commands | Total: ${formatDuration(totalDuration * 1000)}`
  );
  console.log(
    `${colors.bold}════════════════════════════════════════════════════════════${colors.reset}`
  );
  context.logger.log(
    `\nSCRIPT COMPLETE, ${scriptLines.length} commands, ${totalDuration}s total`
  );
  context.logger.close();
  process.exit(0);
}

/**
 * Print script step header
 */
function printScriptStep(current: number, total: number, line: string): void {
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(
    `${colors.cyan}[${current}/${total}]${colors.reset} ${truncate(line, 60)}`
  );
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log('');
}

// Run main
main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
