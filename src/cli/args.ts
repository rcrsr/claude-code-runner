/**
 * CLI argument parsing
 */

import { createRequire } from 'module';

import { loadScript } from '../script/index.js';
import { loadCommandTemplate } from '../templates/command.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };
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
  deaddrop: boolean;
}

/**
 * Extract options from raw args, returning positional args and config
 */
function extractOptions(args: string[]): RawArgs {
  // Handle --version early
  if (args.includes('--version') || args.includes('-V')) {
    console.log(pkg.version);
    process.exit(0);
  }

  let verbosity: Verbosity = 'normal';
  let enableLog = true;
  let model: string | null = null;
  let deaddrop = false;
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
    } else if (arg === '--deaddrop') {
      deaddrop = true;
    } else if (arg === '--model' || arg === '-m') {
      model = args[++i] ?? null;
    } else if (arg?.startsWith('--model=')) {
      model = arg.slice(8);
    } else {
      positionalArgs.push(arg ?? '');
    }
  }

  return { positionalArgs, verbosity, enableLog, model, deaddrop };
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
    const { prompt } = loadCommandTemplate(cmdName, parts.slice(2));
    return { prompt };
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
const VALID_SUBCOMMANDS = ['prompt', 'command', 'script'] as const;

function isValidSubcommand(value: string): value is Subcommand {
  return VALID_SUBCOMMANDS.includes(value as Subcommand);
}

export function parseArgs(args: string[]): ParsedArgs {
  const { positionalArgs, verbosity, enableLog, model, deaddrop } =
    extractOptions(args);

  const firstArg = positionalArgs[0];

  // Validate subcommand
  if (!firstArg) {
    console.error('Error: subcommand required');
    console.error(
      'Usage: claude-code-runner <prompt|command|script> [args...]'
    );
    process.exit(1);
  }

  if (!isValidSubcommand(firstArg)) {
    console.error(`Error: unknown subcommand '${firstArg}'`);
    console.error('Valid subcommands: prompt, command, script');
    console.error(
      'Usage: claude-code-runner <prompt|command|script> [args...]'
    );
    process.exit(1);
  }

  const subcommand = firstArg;
  let prompt = '';
  let displayCommand = '';
  let scriptMode = false;
  let scriptLines: string[] = [];
  let scriptFile: string | null = null;
  let scriptArgs: string[] = [];
  let frontmatterModel: string | null = null;

  switch (subcommand) {
    case 'command': {
      const commandName = positionalArgs[1];
      if (!commandName) {
        console.error('Error: command name required');
        console.error('Usage: claude-code-runner command <name> [args...]');
        process.exit(1);
      }
      const template = loadCommandTemplate(
        commandName,
        positionalArgs.slice(2)
      );
      prompt = template.prompt;
      frontmatterModel = template.frontmatter.model ?? null;
      displayCommand = positionalArgs.slice(1).join(' ');
      break;
    }
    case 'script': {
      const file = positionalArgs[1];
      if (!file) {
        console.error('Error: script file required');
        console.error('Usage: claude-code-runner script <file> [args...]');
        process.exit(1);
      }
      scriptFile = file;
      scriptArgs = positionalArgs.slice(2);
      const parsed = loadScript(file, scriptArgs);
      // Convert parsed lines to display strings for backward compat
      scriptLines = parsed.lines.map((line) => {
        if (line.type === 'prompt') {
          const text =
            line.text.length > 50 ? line.text.slice(0, 50) + '...' : line.text;
          return `prompt("${text}")${line.capture ? ` -> $${line.capture}` : ''}`;
        } else {
          return `command("${line.name}")${line.capture ? ` -> $${line.capture}` : ''}`;
        }
      });
      frontmatterModel = parsed.frontmatter.model ?? null;
      scriptMode = true;
      displayCommand = positionalArgs.slice(1).join(' ');
      break;
    }
    case 'prompt': {
      prompt = positionalArgs.slice(1).join(' ');
      if (!prompt) {
        console.error('Error: prompt text required');
        console.error('Usage: claude-code-runner prompt <text>');
        process.exit(1);
      }
      displayCommand = `"${prompt}"`;
      break;
    }
  }

  const config: Partial<RunnerConfig> = {
    verbosity,
    enableLog,
    model: model ?? frontmatterModel,
    deaddrop,
  };

  return {
    subcommand: scriptMode ? 'script' : subcommand,
    prompt,
    displayCommand,
    scriptLines,
    scriptMode,
    config,
    scriptFile,
    scriptArgs,
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
  claude-code-runner [options] script <file> [args...]

Subcommands:
  prompt <text>              Run with the given prompt (supports RUNNER signals)
  command <name> [args]      Load .claude/commands/<name>.md (supports RUNNER signals)
  script <file> [args]       Run commands from file, stop on ERROR/BLOCKED

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
  --deaddrop           Send messages to Deaddrop (requires DEADDROP_API_KEY env var)
`);
}
