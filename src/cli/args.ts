/**
 * CLI argument parsing
 */

import * as fs from 'fs';

import { loadCommandTemplate } from '../templates/command.js';
import type {
  ParsedArgs,
  RunnerConfig,
  Subcommand,
  Verbosity,
} from '../types/index.js';

interface RawArgs {
  positionalArgs: string[];
  verbosity: Verbosity;
  enableLog: boolean;
  model: string | null;
}

/**
 * Extract options from raw args, returning positional args and config
 */
function extractOptions(args: string[]): RawArgs {
  let verbosity: Verbosity = 'normal';
  let enableLog = true;
  let model: string | null = null;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--quiet') {
      verbosity = 'quiet';
    } else if (arg === '--normal') {
      verbosity = 'normal';
    } else if (arg === '--verbose') {
      verbosity = 'verbose';
    } else if (arg === '--no-log') {
      enableLog = false;
    } else if (arg === '--model' || arg === '-m') {
      model = args[++i] ?? null;
    } else if (arg?.startsWith('--model=')) {
      model = arg.slice(8);
    } else {
      positionalArgs.push(arg ?? '');
    }
  }

  return { positionalArgs, verbosity, enableLog, model };
}

/**
 * Parse a command line into a prompt
 * Used for script mode line parsing
 */
export function parseCommandLine(line: string): { prompt: string } {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[0];

  if (cmd === 'prompt') {
    return { prompt: parts.slice(1).join(' ') };
  } else if (cmd === 'command') {
    const cmdName = parts[1];
    if (!cmdName) {
      throw new Error('command requires a name');
    }
    return { prompt: loadCommandTemplate(cmdName, parts.slice(2)) };
  } else if (cmd === 'script') {
    throw new Error('script cannot be nested');
  } else {
    // Treat as raw prompt
    return { prompt: line.trim() };
  }
}

/**
 * Parse CLI arguments
 */
export function parseArgs(args: string[]): ParsedArgs {
  const { positionalArgs, verbosity, enableLog, model } = extractOptions(args);

  const subcommand = (positionalArgs[0] ?? 'prompt') as Subcommand;
  let prompt = '';
  let displayCommand = '';
  let scriptMode = false;
  let scriptLines: string[] = [];

  switch (subcommand) {
    case 'command': {
      const commandName = positionalArgs[1];
      if (!commandName) {
        console.error('Error: command name required');
        console.error('Usage: claude-code-runner command <name> [args...]');
        process.exit(1);
      }
      prompt = loadCommandTemplate(commandName, positionalArgs.slice(2));
      displayCommand = positionalArgs.slice(1).join(' ');
      break;
    }
    case 'script': {
      const scriptFile = positionalArgs[1];
      if (!scriptFile) {
        console.error('Error: script file required');
        console.error('Usage: claude-code-runner script <file>');
        process.exit(1);
      }
      if (!fs.existsSync(scriptFile)) {
        console.error(`Error: script file not found: ${scriptFile}`);
        process.exit(1);
      }
      scriptLines = fs
        .readFileSync(scriptFile, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')); // Skip empty lines and comments
      scriptMode = true;
      displayCommand = `script ${scriptFile}`;
      break;
    }
    case 'prompt':
      prompt =
        positionalArgs.slice(1).join(' ') || 'Tell me about this project';
      displayCommand = `"${prompt}"`;
      break;
  }

  const config: Partial<RunnerConfig> = {
    verbosity,
    enableLog,
    model,
  };

  return {
    subcommand: scriptMode ? 'script' : subcommand,
    prompt,
    displayCommand,
    scriptLines,
    scriptMode,
    config,
  };
}

/**
 * Print usage information
 */
export function printUsage(): void {
  console.log(`
Claude Code Runner - executes claude CLI with proper TTY handling

Usage:
  claude-code-runner [options] prompt <prompt>
  claude-code-runner [options] command <name> [args...]
  claude-code-runner [options] script <file>

Subcommands:
  prompt <text>              Run with the given prompt (supports RUNNER signals)
  command <name> [args]      Load .claude/commands/<name>.md (supports RUNNER signals)
  script <file>              Run commands from file, stop on ERROR/BLOCKED

Iteration Signals (control runner execution):
  :::RUNNER::REPEAT_STEP:::  Run the same step again
  :::RUNNER::BLOCKED:::      Exit with error (awaiting human intervention)
  :::RUNNER::ERROR:::        Exit with error (something went wrong)

Options:
  --quiet              Minimal output (errors only)
  --normal             Default output level
  --verbose            Full output with all details
  --no-log             Disable logging to file (enabled by default)
  --model, -m <model>  Specify Claude model (e.g., sonnet, opus, haiku)
`);
}
