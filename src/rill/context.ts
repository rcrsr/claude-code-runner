/**
 * Claude Code Runner - Rill Runtime Context
 * Provides prompt, command, and utility functions for orchestrating Claude workflows
 */

import {
  type CallableFn,
  createRuntimeContext,
  type HostFunctionDefinition,
  type ObservabilityCallbacks,
  type RillValue,
  type RuntimeCallbacks,
  type RuntimeContext,
} from '@rcrsr/rill';
import * as fs from 'fs';
import * as path from 'path';

import { printRunner } from '../output/colors.js';
import {
  parseFrontmatter,
  parseGenericFrontmatter,
} from '../templates/command.js';
import { formatRillValue } from '../utils/formatting.js';

// ============================================================
// TYPES
// ============================================================

/** Result of executing a prompt or command */
export interface ExecutionResult {
  /** Output text from Claude */
  output: string;
  /** Exit code from Claude CLI */
  exitCode: number;
}

/** Function to execute Claude CLI */
export type ClaudeExecutor = (
  prompt: string,
  model?: string
) => Promise<ExecutionResult>;

/** Options for creating runner context */
export interface RunnerContextOptions {
  /** Execute Claude CLI */
  executeClause: ClaudeExecutor;
  /** Named variables (mapped from CLI args by caller) */
  namedArgs?: Record<string, RillValue> | undefined;
  /** Raw CLI args tuple ($ARGS) */
  rawArgs?: string[] | undefined;
  /** Environment variables ($ENV) */
  env?: Record<string, string> | undefined;
  /** Commands directory (for command() function) */
  commandsDir?: string | undefined;
  /** Default model for prompts */
  defaultModel?: string | undefined;
  /** Logging callbacks */
  callbacks?: Partial<RuntimeCallbacks> | undefined;
  /** Observability callbacks for execution monitoring */
  observability?: ObservabilityCallbacks | undefined;
  /** Timeout in milliseconds for async functions */
  timeout?: number | undefined;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal | undefined;
  /** Regex patterns that halt execution when output matches */
  autoExceptions?: string[] | undefined;
}

// ============================================================
// COMMAND LOADING
// ============================================================

interface CommandTemplate {
  content: string;
  model?: string | undefined;
}

function loadCommandTemplate(
  name: string,
  commandsDir: string
): CommandTemplate {
  const filePath = path.join(commandsDir, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Command not found: ${name} (looked in ${filePath})`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    content: body,
    model: frontmatter.model,
  };
}

function substituteArgs(template: string, args: RillValue[]): string {
  let result = template;

  // Substitute positional args: $1, $2, etc.
  for (let i = 0; i < args.length; i++) {
    const value = formatRillValue(args[i] ?? null);
    result = result.replace(new RegExp(`\\$${i + 1}`, 'g'), value);
  }

  // Substitute $ARGUMENTS with all args joined
  result = result.replace(/\$ARGUMENTS/g, args.map(formatRillValue).join(' '));

  // Remove unmatched $N placeholders
  result = result.replace(/\$\d+/g, '');

  return result;
}

// ============================================================
// RUNTIME CONTEXT FACTORY
// ============================================================

/**
 * Create a Rill runtime context for Claude Code Runner workflows
 */
export function createRunnerContext(
  options: RunnerContextOptions
): RuntimeContext {
  const {
    executeClause,
    namedArgs = {},
    rawArgs = [],
    env = process.env as Record<string, string>,
    commandsDir = '.claude/commands',
    defaultModel,
    callbacks = {},
    observability,
    timeout,
    signal,
    autoExceptions,
  } = options;

  // Create ccr:: namespaced functions
  const functions: Record<string, CallableFn | HostFunctionDefinition> = {
    /**
     * Execute a prompt with Claude
     * Usage: ccr::prompt("analyze this code", "haiku")
     */
    'ccr::prompt': {
      params: [
        { name: 'text', type: 'string' },
        { name: 'model', type: 'string', defaultValue: '' },
      ],
      fn: async (args) => {
        const text = args[0] as string;
        const model = (args[1] as string) || defaultModel;
        const result = await executeClause(text, model);
        return result.output;
      },
    },

    /**
     * Execute a command template
     * Usage: ccr::command("create-spec", ["arg1", "arg2"])
     */
    'ccr::command': {
      params: [
        { name: 'name', type: 'string' },
        { name: 'args', type: 'list', defaultValue: [] },
      ],
      fn: async (args, ctx) => {
        const name = args[0] as string;
        const cmdArgs = args[1] as RillValue[];

        const template = loadCommandTemplate(name, commandsDir);
        const promptText = substituteArgs(template.content, cmdArgs);
        const model = template.model ?? defaultModel;

        const result = await executeClause(promptText, model);
        ctx.pipeValue = result.output;
        return result.output;
      },
    },

    /**
     * Execute a skill (slash command) directly
     * Usage: ccr::skill("commit", ["--amend"])
     */
    'ccr::skill': {
      params: [
        { name: 'name', type: 'string' },
        { name: 'args', type: 'list', defaultValue: [] },
      ],
      fn: async (args, ctx) => {
        const name = args[0] as string;
        const skillArgs = (args[1] as RillValue[]).map((a) =>
          formatRillValue(a ?? null)
        );

        const promptText =
          skillArgs.length > 0 ? `/${name} ${skillArgs.join(' ')}` : `/${name}`;

        const result = await executeClause(promptText, defaultModel);
        ctx.pipeValue = result.output;
        return result.output;
      },
    },

    /**
     * Check if a file exists
     * Usage: ccr::file_exists("path/to/file") -> boolean
     */
    'ccr::file_exists': {
      params: [{ name: 'path', type: 'string' }],
      fn: (args) => fs.existsSync(args[0] as string),
    },

    /**
     * Extract result from text
     * Usage: ccr::get_result($text) -> { type: "...", ...attrs } | null
     * Parses <ccr:result type="..." .../> or <ccr:result ...>content</ccr:result>
     */
    'ccr::get_result': {
      params: [{ name: 'text', type: 'string' }],
      fn: (args) => {
        const text = args[0] as string;

        // Match self-closing: <ccr:result ... />
        // Match with content: <ccr:result ...>content</ccr:result>
        const selfClosingPattern = /<ccr:result\s+([^>]*?)\/>/;
        const withContentPattern =
          /<ccr:result\s+([^>]*)>([\s\S]*?)<\/ccr:result>/;

        let attrs: string;
        let content: string | undefined;

        const withContentMatch = withContentPattern.exec(text);
        if (withContentMatch?.[1] && withContentMatch[2]) {
          attrs = withContentMatch[1];
          content = withContentMatch[2].trim();
        } else {
          const selfClosingMatch = selfClosingPattern.exec(text);
          if (selfClosingMatch?.[1]) {
            attrs = selfClosingMatch[1];
          } else {
            return null;
          }
        }

        // Parse attributes: key="value" or key='value'
        const result: Record<string, string> = {};
        const attrPattern = /(\w+)=["']([^"']*)["']/g;
        let match;
        while ((match = attrPattern.exec(attrs)) !== null) {
          const key = match[1];
          const value = match[2];
          if (key && value !== undefined) {
            result[key] = value;
          }
        }

        if (content !== undefined) {
          result['content'] = content;
        }

        return result;
      },
    },

    /**
     * Stop execution with error
     * Usage: ccr::error("validation failed")
     */
    'ccr::error': {
      params: [{ name: 'message', type: 'string', defaultValue: 'Error' }],
      fn: (args) => {
        throw new Error(args[0] as string);
      },
    },

    /**
     * Read frontmatter from a file
     * Usage: ccr::read_frontmatter("path/to/file.md")
     *        ccr::read_frontmatter("path/to/file.md", [key: "default"])
     */
    'ccr::read_frontmatter': {
      params: [
        { name: 'path', type: 'string' },
        { name: 'defaults', type: 'dict', defaultValue: {} },
      ],
      fn: (args) => {
        const filePath = args[0] as string;
        const defaults = args[1] as Record<string, RillValue>;

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseGenericFrontmatter(content);

        return { ...defaults, ...frontmatter };
      },
    },
  };

  // Create initial variables
  const variables: Record<string, RillValue> = {
    ARGS: rawArgs,
    ENV: env,
    ...namedArgs,
  };

  return createRuntimeContext({
    variables,
    functions,
    callbacks: {
      onLog:
        callbacks.onLog ??
        ((v) => {
          printRunner(formatRillValue(v));
        }),
    },
    ...(observability && { observability }),
    ...(timeout !== undefined && { timeout }),
    ...(signal && { signal }),
    ...(autoExceptions && { autoExceptions }),
  });
}
