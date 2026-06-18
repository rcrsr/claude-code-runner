/**
 * Claude Code Runner - Rill Runtime Context
 * Provides prompt, command, and utility functions for orchestrating Claude workflows
 */

import {
  createRuntimeContext,
  type ObservabilityCallbacks,
  type RillFunction,
  type RillValue,
  type RuntimeCallbacks,
  type RuntimeContext,
  structureToTypeValue,
} from '@rcrsr/rill';
import * as fs from 'fs';

import { printRunner, stripAnsi } from '../output/colors.js';
import {
  loadCommandTemplate as loadCommandTemplateFile,
  parseGenericFrontmatter,
} from '../templates/command.js';
import {
  CCR_RESULT_SELF_CLOSING_PATTERN,
  CCR_RESULT_WITH_CONTENT_PATTERN,
} from '../utils/constants.js';
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

/** Invocation context for timeout reporting and per-call options */
export interface InvocationContext {
  /** CCR host function that triggered execution (e.g. ccr::prompt) */
  method: string;
  /** Model override passed to the host function */
  model?: string | undefined;
  /** Command or skill name */
  name?: string | undefined;
  /** Per-call inactivity timeout in ms (overrides config default) */
  timeoutMs?: number | undefined;
}

/** Function to execute Claude CLI */
export type ClaudeExecutor = (
  prompt: string,
  model?: string,
  invocation?: InvocationContext
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
  /** Callback for state changes from ccr::state host function */
  onStateChange?: ((text: string | null) => void) | undefined;
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
    onStateChange: _onStateChange,
  } = options;

  // Create ccr:: namespaced functions
  const functions: Record<string, RillFunction> = {
    /**
     * Execute a prompt with Claude
     * Usage: ccr::prompt("analyze this code", "haiku")
     */
    'ccr::prompt': {
      annotations: {
        description: 'Execute a prompt with Claude and return output',
      },
      returnType: structureToTypeValue({ kind: 'string' }),
      params: [
        {
          name: 'text',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'Prompt text to send to Claude' },
        },
        {
          name: 'model',
          type: { kind: 'string' },
          defaultValue: '',
          annotations: { description: 'Model override (sonnet, opus, haiku)' },
        },
        {
          name: 'timeout',
          type: { kind: 'number' },
          defaultValue: 0,
          annotations: {
            description: 'Inactivity timeout in minutes (0 = use default)',
          },
        },
      ],
      fn: async (args) => {
        const text = args['text'] as string;
        const model = (args['model'] as string) || defaultModel;
        const timeoutMin = args['timeout'] as number;
        const result = await executeClause(text, model, {
          method: 'ccr::prompt',
          model: model ?? undefined,
          ...(timeoutMin > 0 && { timeoutMs: timeoutMin * 60_000 }),
        });
        return result.output;
      },
    },

    /**
     * Execute a command template
     * Usage: ccr::command("create-spec", ["arg1", "arg2"])
     */
    'ccr::command': {
      annotations: { description: 'Execute a command template by name' },
      returnType: structureToTypeValue({ kind: 'string' }),
      params: [
        {
          name: 'name',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'Command template name' },
        },
        {
          name: 'args',
          type: { kind: 'list' },
          defaultValue: [],
          annotations: { description: 'Arguments to pass to template' },
        },
        {
          name: 'timeout',
          type: { kind: 'number' },
          defaultValue: 0,
          annotations: {
            description: 'Inactivity timeout in minutes (0 = use default)',
          },
        },
      ],
      fn: async (args, ctx) => {
        const name = args['name'] as string;
        const cmdArgs = (args['args'] as RillValue[]).map((a) =>
          formatRillValue(a ?? null)
        );
        const timeoutMin = args['timeout'] as number;

        const template = loadCommandTemplateFile(
          name,
          cmdArgs,
          commandsDir.replace('/.claude/commands', '')
        );
        const model = template.frontmatter.model ?? defaultModel;

        const result = await executeClause(template.prompt, model, {
          method: 'ccr::command',
          name,
          model: model ?? undefined,
          ...(timeoutMin > 0 && { timeoutMs: timeoutMin * 60_000 }),
        });
        ctx.pipeValue = result.output;
        return result.output;
      },
    },

    /**
     * Execute a skill (slash command) directly
     * Usage: ccr::skill("commit", ["--amend"])
     */
    'ccr::skill': {
      annotations: {
        description: 'Execute a Claude Code skill (slash command)',
      },
      returnType: structureToTypeValue({ kind: 'string' }),
      params: [
        {
          name: 'name',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'Skill name (without leading /)' },
        },
        {
          name: 'args',
          type: { kind: 'list' },
          defaultValue: [],
          annotations: { description: 'Arguments to pass to skill' },
        },
        {
          name: 'timeout',
          type: { kind: 'number' },
          defaultValue: 0,
          annotations: {
            description: 'Inactivity timeout in minutes (0 = use default)',
          },
        },
      ],
      fn: async (args, ctx) => {
        const name = args['name'] as string;
        const skillArgs = (args['args'] as RillValue[]).map((a) =>
          formatRillValue(a ?? null)
        );
        const timeoutMin = args['timeout'] as number;

        const promptText =
          skillArgs.length > 0 ? `/${name} ${skillArgs.join(' ')}` : `/${name}`;

        const result = await executeClause(promptText, defaultModel, {
          method: 'ccr::skill',
          name,
          model: defaultModel ?? undefined,
          ...(timeoutMin > 0 && { timeoutMs: timeoutMin * 60_000 }),
        });
        ctx.pipeValue = result.output;
        return result.output;
      },
    },

    /**
     * Check if a file exists
     * Usage: ccr::file_exists("path/to/file") -> boolean
     */
    'ccr::file_exists': {
      annotations: { description: 'Check if a file exists at the given path' },
      returnType: structureToTypeValue({ kind: 'bool' }),
      params: [
        {
          name: 'path',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'File path to check' },
        },
      ],
      fn: (args) => fs.existsSync(args['path'] as string),
    },

    /**
     * Set script status line text
     * Usage: ccr::state("Processing file 3/10")
     */
    'ccr::state': {
      annotations: { description: 'Set script status line text' },
      returnType: structureToTypeValue({ kind: 'dict' }),
      params: [
        {
          name: 'text',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: {},
        },
      ],
      fn: (args) => {
        let text = args['text'] as string;

        // Strip ANSI escape sequences
        text = stripAnsi(text);

        // Strip newlines to single line
        text = text.replace(/[\r\n]+/g, ' ');

        // Check if empty or whitespace-only
        const trimmed = text.trim();

        // Invoke callback if provided
        if (_onStateChange) {
          _onStateChange(trimmed || null);
        }

        return null;
      },
    },

    /**
     * Extract result from text
     * Usage: ccr::get_result($text) -> { type: "...", ...attrs } or {}
     * Parses <ccr:result type="..." .../> or <ccr:result ...>content</ccr:result>
     * Returns empty dict if no result found (Rill doesn't support null)
     */
    'ccr::get_result': {
      annotations: { description: 'Extract ccr:result XML tag from text' },
      returnType: structureToTypeValue({ kind: 'dict' }),
      params: [
        {
          name: 'text',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'Text containing ccr:result tag' },
        },
      ],
      fn: (args) => {
        const text = args['text'] as string;

        let attrs: string;
        let content: string | undefined;

        const withContentMatch = CCR_RESULT_WITH_CONTENT_PATTERN.exec(text);
        if (withContentMatch?.[1] && withContentMatch[2]) {
          attrs = withContentMatch[1];
          content = withContentMatch[2].trim();
        } else {
          const selfClosingMatch = CCR_RESULT_SELF_CLOSING_PATTERN.exec(text);
          if (selfClosingMatch?.[1]) {
            attrs = selfClosingMatch[1];
          } else {
            return {};
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
     * Check if text contains a <ccr:result> tag
     * Usage: ccr::has_result(text) -> boolean
     */
    'ccr::has_result': {
      annotations: { description: 'Check if text contains a ccr:result tag' },
      returnType: structureToTypeValue({ kind: 'bool' }),
      params: [
        {
          name: 'text',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'Text to search for ccr:result tag' },
        },
      ],
      fn: (args) => {
        const text = args['text'] as string;
        return (
          CCR_RESULT_SELF_CLOSING_PATTERN.test(text) ||
          CCR_RESULT_WITH_CONTENT_PATTERN.test(text)
        );
      },
    },

    /**
     * Check if a file has YAML frontmatter
     * Usage: ccr::has_frontmatter(path) -> boolean
     */
    'ccr::has_frontmatter': {
      annotations: { description: 'Check if a file has YAML frontmatter' },
      returnType: structureToTypeValue({ kind: 'bool' }),
      params: [
        {
          name: 'path',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'File path to check' },
        },
      ],
      fn: (args) => {
        const filePath = args['path'] as string;

        if (!fs.existsSync(filePath)) {
          return false;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseGenericFrontmatter(content);

        return Object.keys(frontmatter).length > 0;
      },
    },

    /**
     * Get frontmatter from a file
     * Usage: ccr::get_frontmatter("path/to/file.md")
     */
    'ccr::get_frontmatter': {
      annotations: {
        description: 'Parse and return YAML frontmatter from a file',
      },
      returnType: structureToTypeValue({ kind: 'dict' }),
      params: [
        {
          name: 'path',
          type: { kind: 'string' },
          defaultValue: undefined,
          annotations: { description: 'File path to parse' },
        },
      ],
      fn: (args) => {
        const filePath = args['path'] as string;

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseGenericFrontmatter(content);

        return frontmatter;
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
          const formatted = formatRillValue(v)
            .replace(/[\r\n]+/g, ' ')
            .trim();
          printRunner(formatted);
        }),
    },
    ...(observability && { observability }),
    ...(timeout !== undefined && { timeout }),
    ...(signal && { signal }),
    ...(autoExceptions && { autoExceptions }),
  });
}
