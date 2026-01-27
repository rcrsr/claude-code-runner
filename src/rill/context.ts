/**
 * Claude Code Runner - Rill Runtime Context
 * Provides prompt, command, and utility functions for orchestrating Claude workflows
 */

import {
  createRuntimeContext,
  type HostFunctionDefinition,
  type ObservabilityCallbacks,
  type RillValue,
  type RuntimeCallbacks,
  type RuntimeContext,
} from '@rcrsr/rill';
import * as fs from 'fs';

import { printRunner } from '../output/colors.js';
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
  const functions: Record<string, HostFunctionDefinition> = {
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
        const cmdArgs = (args[1] as RillValue[]).map((a) =>
          formatRillValue(a ?? null)
        );

        const template = loadCommandTemplateFile(
          name,
          cmdArgs,
          commandsDir.replace('/.claude/commands', '')
        );
        const model = template.frontmatter.model ?? defaultModel;

        const result = await executeClause(template.prompt, model);
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
     * Usage: ccr::get_result($text) -> { type: "...", ...attrs } or {}
     * Parses <ccr:result type="..." .../> or <ccr:result ...>content</ccr:result>
     * Returns empty dict if no result found (Rill doesn't support null)
     */
    'ccr::get_result': {
      params: [{ name: 'text', type: 'string' }],
      fn: (args) => {
        const text = args[0] as string;

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
     * Check if text contains a <ccr:result> tag
     * Usage: ccr::has_result(text) -> boolean
     */
    'ccr::has_result': {
      params: [{ name: 'text', type: 'string' }],
      fn: (args) => {
        const text = args[0] as string;
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
      params: [{ name: 'path', type: 'string' }],
      fn: (args) => {
        const filePath = args[0] as string;

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
      params: [{ name: 'path', type: 'string' }],
      fn: (args) => {
        const filePath = args[0] as string;

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
