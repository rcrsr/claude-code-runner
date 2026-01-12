#!/usr/bin/env node
/**
 * Claude Code Runner - executes claude CLI with proper TTY handling
 * Shows intermediate tool calls and responses in real-time
 */

import { parseArgs, parseCommandLine } from './cli/args.js';
import { type RunnerContext, runWithSignals } from './core/runner.js';
import { colors, formatElapsed, printRunner } from './output/colors.js';
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

  // Print config with [RUNNER] messages
  printRunner(`Mode: ${parsed.subcommand} | Verbosity: ${config.verbosity}`);
  if (config.model) {
    printRunner(`Model: ${config.model}`);
  }
  if (logger.filePath) {
    printRunner(`Log: ${logger.filePath}`);
  }
  logger.log(`Started: ${new Date().toISOString()}`);

  if (parsed.scriptMode) {
    // Script mode: run each line
    await runScriptMode(parsed.scriptLines, context, totalStart);
  } else {
    // Single command mode
    await runSingleMode(
      parsed.prompt,
      parsed.subcommand,
      parsed.displayCommand,
      context,
      totalStart
    );
  }
}

/**
 * Run in single command mode (prompt or command)
 */
async function runSingleMode(
  prompt: string,
  subcommand: string,
  displayCommand: string,
  context: RunnerContext,
  startTime: number
): Promise<void> {
  context.logger.log(`${subcommand}: ${displayCommand}\n`);

  const result = await runWithSignals(
    prompt,
    displayCommand,
    startTime,
    context
  );
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
  printRunner(`Running script: ${scriptLines.length} commands`);
  context.logger.log(`Script: ${scriptLines.length} commands\n`);

  for (const [i, line] of scriptLines.entries()) {
    context.logger.log(`\n=== [${i + 1}/${scriptLines.length}] ${line} ===\n`);

    let result: 'ok' | 'blocked' | 'error';
    try {
      const parsed = parseCommandLine(line);
      result = await runWithSignals(parsed.prompt, line, startTime, context);
    } catch (err) {
      printRunner(
        `${colors.red}Parse error:${colors.reset} ${(err as Error).message}`
      );
      result = 'error';
    }

    if (result === 'blocked' || result === 'error') {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);
      printRunner(
        `${colors.red}Script stopped${colors.reset} [${i + 1}/${scriptLines.length}] steps in ${formatElapsed(totalDuration)}`
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
  printRunner(
    `${colors.green}Script completed${colors.reset} [${scriptLines.length}] steps in ${formatElapsed(totalDuration)}`
  );
  context.logger.log(
    `\nSCRIPT COMPLETE, ${scriptLines.length} commands, ${totalDuration}s total`
  );
  context.logger.close();
  process.exit(0);
}

// Run main
main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
