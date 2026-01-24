/**
 * CLI argument parsing
 */

import { createRequire } from 'module';

import { isRillScript } from '../rill/index.js';
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
  let enableLog = false;
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
    } else if (arg === '--log') {
      enableLog = true;
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
        console.error('Usage: claude-code-runner script <file.rill> [args...]');
        process.exit(1);
      }
      if (!isRillScript(file)) {
        console.error('Error: script must be a .rill file');
        process.exit(1);
      }
      scriptFile = file;
      scriptArgs = positionalArgs.slice(2);
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
    subcommand,
    prompt,
    displayCommand,
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
  claude-code-runner [options] script <file.rill> [args...]

Subcommands:
  prompt <text>              Run with the given prompt
  command <name> [args]      Load .claude/commands/<name>.md template
  script <file.rill> [args]  Run a Rill script

Options:
  --quiet              Minimal output (errors only)
  --normal             Default output level
  --verbose            Full output with all details
  --log                Enable logging to file (disabled by default)
  --model, -m <model>  Specify Claude model (e.g., sonnet, opus, haiku)
  --deaddrop           Send messages to Deaddrop (requires DEADDROP_API_KEY env var)
`);
}
