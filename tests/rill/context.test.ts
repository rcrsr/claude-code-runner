/**
 * Tests for Rill runtime context and host functions
 */

import { execute, parse } from '@rcrsr/rill';
import { describe, expect, it, vi } from 'vitest';

import {
  type ClaudeExecutor,
  createRunnerContext,
  type ExecutionResult,
} from '../../src/rill/context.js';

/**
 * Create a mock executor that returns configurable responses
 */
function createMockExecutor(
  response: Partial<ExecutionResult> = {}
): ClaudeExecutor {
  const defaultResponse: ExecutionResult = {
    output: 'mock output',
    exitCode: 0,
    ...response,
  };
  return vi.fn().mockResolvedValue(defaultResponse);
}

/**
 * Helper to execute Rill code with a context
 */
async function runRill(
  code: string,
  executor: ClaudeExecutor,
  options: {
    namedArgs?: Record<string, string | number | boolean>;
    rawArgs?: string[];
    commandsDir?: string;
    defaultModel?: string;
  } = {}
): Promise<{ value: unknown }> {
  const ctx = createRunnerContext({
    executeClause: executor,
    ...options,
  });
  const ast = parse(code);
  return execute(ast, ctx);
}

describe('createRunnerContext', () => {
  describe('default onLog callback', () => {
    it('strips trailing newlines from logged values', async () => {
      const executor = createMockExecutor();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation();

      const ctx = createRunnerContext({
        executeClause: executor,
      });

      const ast = parse('log("text with newline\\n")');
      await execute(ast, ctx);

      // printRunner adds timestamp and [runner] prefix, but the value should have newlines replaced
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('text with newline')
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('text with newline\n')
      );

      consoleLogSpy.mockRestore();
    });

    it('replaces internal newlines with spaces', async () => {
      const executor = createMockExecutor();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation();

      const ctx = createRunnerContext({
        executeClause: executor,
      });

      const ast = parse('log("line1\\nline2\\nline3")');
      await execute(ast, ctx);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('line1 line2 line3')
      );

      consoleLogSpy.mockRestore();
    });

    it('strips carriage returns and newlines', async () => {
      const executor = createMockExecutor();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation();

      const ctx = createRunnerContext({
        executeClause: executor,
      });

      const ast = parse('log("text\\r\\nwith\\r\\ncrlf")');
      await execute(ast, ctx);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('text with crlf')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('initial variables', () => {
    it('sets ARGS from rawArgs', async () => {
      const executor = createMockExecutor();
      const result = await runRill('$ARGS', executor, {
        rawArgs: ['arg1', 'arg2'],
      });

      expect(result.value).toEqual(['arg1', 'arg2']);
    });

    it('sets ENV from env option', async () => {
      const ctx = createRunnerContext({
        executeClause: createMockExecutor(),
        env: { FOO: 'bar', BAZ: 'qux' },
      });
      const ast = parse('$ENV');
      const result = await execute(ast, ctx);

      expect(result.value).toEqual({ FOO: 'bar', BAZ: 'qux' });
    });

    it('includes namedArgs as top-level variables', async () => {
      const executor = createMockExecutor();
      const result = await runRill('$file', executor, {
        namedArgs: { file: 'test.ts' },
      });

      expect(result.value).toBe('test.ts');
    });

    it('defaults rawArgs to empty array', async () => {
      const executor = createMockExecutor();
      const result = await runRill('$ARGS', executor);

      expect(result.value).toEqual([]);
    });
  });
});

describe('ccr::prompt', () => {
  it('executes prompt and returns output', async () => {
    const executor = createMockExecutor({ output: 'Claude response' });
    const result = await runRill('ccr::prompt("test prompt")', executor);

    expect(executor).toHaveBeenCalledWith('test prompt', undefined);
    expect(result.value).toBe('Claude response');
  });

  it('passes model parameter when provided', async () => {
    const executor = createMockExecutor({ output: 'response' });
    await runRill('ccr::prompt("prompt text", "haiku")', executor);

    expect(executor).toHaveBeenCalledWith('prompt text', 'haiku');
  });

  it('uses defaultModel when model parameter is empty', async () => {
    const executor = createMockExecutor({ output: 'response' });
    await runRill('ccr::prompt("prompt text")', executor, {
      defaultModel: 'sonnet',
    });

    expect(executor).toHaveBeenCalledWith('prompt text', 'sonnet');
  });
});

describe('ccr::skill', () => {
  it('formats skill as slash command', async () => {
    const executor = createMockExecutor({ output: 'skill output' });
    const result = await runRill('ccr::skill("commit")', executor);

    expect(executor).toHaveBeenCalledWith('/commit', undefined);
    expect(result.value).toBe('skill output');
  });

  it('includes args in skill command', async () => {
    const executor = createMockExecutor({ output: 'output' });
    await runRill('ccr::skill("review", ["--strict", "file.ts"])', executor);

    expect(executor).toHaveBeenCalledWith(
      '/review --strict file.ts',
      undefined
    );
  });
});

describe('ccr::file_exists', () => {
  it('returns true for existing file', async () => {
    const executor = createMockExecutor();
    const result = await runRill('ccr::file_exists("package.json")', executor);

    expect(result.value).toBe(true);
  });

  it('returns false for non-existing file', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::file_exists("definitely-not-a-real-file-xyz.txt")',
      executor
    );

    expect(result.value).toBe(false);
  });
});

describe('ccr::get_result', () => {
  it('parses self-closing result tag', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("Some text <ccr:result type=\\"done\\" status=\\"success\\"/> more")';
    const result = await runRill(code, executor);

    expect(result.value).toEqual({ type: 'done', status: 'success' });
  });

  it('parses result tag with content', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("<ccr:result type=\\"blocked\\" reason=\\"missing\\">Details</ccr:result>")';
    const result = await runRill(code, executor);

    expect(result.value).toEqual({
      type: 'blocked',
      reason: 'missing',
      content: 'Details',
    });
  });

  it('returns empty dict when no result tag found', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::get_result("no result tag here")',
      executor
    );

    expect(result.value).toEqual({});
  });

  it('handles single quotes in attributes', async () => {
    const executor = createMockExecutor();
    const code = "ccr::get_result(\"<ccr:result type='repeat' count='3'/>\")";
    const result = await runRill(code, executor);

    expect(result.value).toEqual({ type: 'repeat', count: '3' });
  });
});

describe('ccr::error', () => {
  it('throws error with message', async () => {
    const executor = createMockExecutor();

    await expect(
      runRill('ccr::error("validation failed")', executor)
    ).rejects.toThrow('validation failed');
  });
});

describe('ccr::has_result', () => {
  it('returns true for self-closing result tag', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::has_result("Some text <ccr:result type=\\"done\\"/> more")';
    const result = await runRill(code, executor);

    expect(result.value).toBe(true);
  });

  it('returns true for result tag with content', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::has_result("<ccr:result type=\\"blocked\\">Details</ccr:result>")';
    const result = await runRill(code, executor);

    expect(result.value).toBe(true);
  });

  it('returns false when no result tag found', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_result("no result tag here")',
      executor
    );

    expect(result.value).toBe(false);
  });

  it('returns false for malformed tags', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_result("<ccr:resulttype=\\"done\\"/>")',
      executor
    );

    expect(result.value).toBe(false);
  });
});

describe('ccr::has_frontmatter', () => {
  it('returns true for file with frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_frontmatter("tests/fixtures/templates/review-code.md")',
      executor
    );

    expect(result.value).toBe(true);
  });

  it('returns false for file without frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_frontmatter("tests/fixtures/templates/no-frontmatter.md")',
      executor
    );

    expect(result.value).toBe(false);
  });

  it('returns false for non-existing file', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_frontmatter("non-existent-file.md")',
      executor
    );

    expect(result.value).toBe(false);
  });
});

describe('ccr::get_frontmatter', () => {
  it('throws error for non-existing file', async () => {
    const executor = createMockExecutor();

    await expect(
      runRill('ccr::get_frontmatter("non-existent-file.md")', executor)
    ).rejects.toThrow('File not found');
  });

  it('returns empty dict for file without frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::get_frontmatter("tests/fixtures/templates/no-frontmatter.md")',
      executor
    );

    expect(result.value).toEqual({});
  });

  it('returns frontmatter dict for file with frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::get_frontmatter("tests/fixtures/templates/review-code.md")',
      executor
    );

    expect(result.value).toEqual(
      expect.objectContaining({
        description: 'Review code for issues',
      })
    );
  });
});

describe('ccr::command', () => {
  it('throws error when command file not found', async () => {
    const executor = createMockExecutor();

    await expect(
      runRill('ccr::command("non-existent-cmd")', executor, {
        commandsDir: '.claude/commands',
      })
    ).rejects.toThrow('Command not found');
  });
});
