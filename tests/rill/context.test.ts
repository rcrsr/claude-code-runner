/**
 * Tests for Rill runtime context and host functions
 */

import { execute, getStatus, isInvalid, parse } from '@rcrsr/rill';
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
): Promise<{ result: unknown }> {
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

      expect(result.result).toEqual(['arg1', 'arg2']);
    });

    it('sets ENV from env option', async () => {
      const ctx = createRunnerContext({
        executeClause: createMockExecutor(),
        env: { FOO: 'bar', BAZ: 'qux' },
      });
      const ast = parse('$ENV');
      const result = await execute(ast, ctx);

      expect(result.result).toEqual({ FOO: 'bar', BAZ: 'qux' });
    });

    it('includes namedArgs as top-level variables', async () => {
      const executor = createMockExecutor();
      const result = await runRill('$file', executor, {
        namedArgs: { file: 'test.ts' },
      });

      expect(result.result).toBe('test.ts');
    });

    it('defaults rawArgs to empty array', async () => {
      const executor = createMockExecutor();
      const result = await runRill('$ARGS', executor);

      expect(result.result).toEqual([]);
    });
  });
});

describe('ccr::prompt', () => {
  it('executes prompt and returns output', async () => {
    const executor = createMockExecutor({ output: 'Claude response' });
    const result = await runRill('ccr::prompt("test prompt")', executor);

    expect(executor).toHaveBeenCalledWith('test prompt', undefined, {
      method: 'ccr::prompt',
      model: undefined,
    });
    expect(result.result).toBe('Claude response');
  });

  it('passes model parameter when provided', async () => {
    const executor = createMockExecutor({ output: 'response' });
    await runRill('ccr::prompt("prompt text", "haiku")', executor);

    expect(executor).toHaveBeenCalledWith('prompt text', 'haiku', {
      method: 'ccr::prompt',
      model: 'haiku',
    });
  });

  it('uses defaultModel when model parameter is empty', async () => {
    const executor = createMockExecutor({ output: 'response' });
    await runRill('ccr::prompt("prompt text")', executor, {
      defaultModel: 'sonnet',
    });

    expect(executor).toHaveBeenCalledWith('prompt text', 'sonnet', {
      method: 'ccr::prompt',
      model: 'sonnet',
    });
  });

  it('passes timeoutMs when timeout > 0', async () => {
    const executor = createMockExecutor({ output: 'response' });
    await runRill('ccr::prompt("text", "", 5)', executor);

    expect(executor).toHaveBeenCalledWith(
      'text',
      undefined,
      expect.objectContaining({ timeoutMs: 300_000 })
    );
  });

  it('omits timeoutMs when timeout is 0', async () => {
    const executor = createMockExecutor({ output: 'response' });
    await runRill('ccr::prompt("text", "", 0)', executor);

    const call = vi.mocked(executor).mock.calls[0]?.[2];
    expect(call).not.toHaveProperty('timeoutMs');
  });
});

describe('ccr::skill', () => {
  it('formats skill as slash command', async () => {
    const executor = createMockExecutor({ output: 'skill output' });
    const result = await runRill('ccr::skill("commit")', executor);

    expect(executor).toHaveBeenCalledWith('/commit', undefined, {
      method: 'ccr::skill',
      name: 'commit',
      model: undefined,
    });
    expect(result.result).toBe('skill output');
  });

  it('includes args in skill command', async () => {
    const executor = createMockExecutor({ output: 'output' });
    await runRill('ccr::skill("review", ["--strict", "file.ts"])', executor);

    expect(executor).toHaveBeenCalledWith(
      '/review --strict file.ts',
      undefined,
      { method: 'ccr::skill', name: 'review', model: undefined }
    );
  });
});

describe('ccr::file_exists', () => {
  it('returns true for existing file', async () => {
    const executor = createMockExecutor();
    const result = await runRill('ccr::file_exists("package.json")', executor);

    expect(result.result).toBe(true);
  });

  it('returns false for non-existing file', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::file_exists("definitely-not-a-real-file-xyz.txt")',
      executor
    );

    expect(result.result).toBe(false);
  });
});

describe('ccr::get_result', () => {
  it('parses self-closing result tag', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("Some text <ccr:result type=\\"done\\" status=\\"success\\"/> more")';
    const result = await runRill(code, executor);

    expect(result.result).toEqual({ type: 'done', status: 'success' });
  });

  it('parses result tag with content', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("<ccr:result type=\\"blocked\\" reason=\\"missing\\">Details</ccr:result>")';
    const result = await runRill(code, executor);

    expect(result.result).toEqual({
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

    expect(result.result).toEqual({});
  });

  it('handles single quotes in attributes', async () => {
    const executor = createMockExecutor();
    const code = "ccr::get_result(\"<ccr:result type='repeat' count='3'/>\")";
    const result = await runRill(code, executor);

    expect(result.result).toEqual({ type: 'repeat', count: '3' });
  });

  it('returns last of two self-closing tags', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("Some text <ccr:result type=\\"continue\\"/> more text <ccr:result type=\\"done\\"/>")';
    const result = await runRill(code, executor);

    expect(result.result).toEqual({ type: 'done' });
  });

  it('returns last of two content tags', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("<ccr:result type=\\"first\\">first content</ccr:result> text <ccr:result type=\\"last\\">last content</ccr:result>")';
    const result = await runRill(code, executor);

    expect(result.result).toEqual({ type: 'last', content: 'last content' });
  });

  it('returns self-closing tag when it appears after a content tag', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("<ccr:result type=\\"example\\">demo</ccr:result> final <ccr:result type=\\"done\\"/>")';
    const result = await runRill(code, executor);

    expect(result.result).toEqual({ type: 'done' });
  });

  it('returns content tag when it appears after a self-closing tag', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::get_result("<ccr:result type=\\"continue\\"/> later <ccr:result type=\\"blocked\\" reason=\\"missing\\">Details</ccr:result>")';
    const result = await runRill(code, executor);

    expect(result.result).toEqual({
      type: 'blocked',
      reason: 'missing',
      content: 'Details',
    });
  });

  it('returns consistent result on repeated calls (no lastIndex leakage)', async () => {
    const executor = createMockExecutor();
    const input =
      '"<ccr:result type=\\"first\\"/> text <ccr:result type=\\"last\\"/>"';
    const code1 = `ccr::get_result(${input})`;
    const code2 = `ccr::get_result(${input})`;
    const result1 = await runRill(code1, executor);
    const result2 = await runRill(code2, executor);

    expect(result1.result).toEqual({ type: 'last' });
    expect(result2.result).toEqual({ type: 'last' });
  });
});

describe('ccr::has_result', () => {
  it('returns true for self-closing result tag', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::has_result("Some text <ccr:result type=\\"done\\"/> more")';
    const result = await runRill(code, executor);

    expect(result.result).toBe(true);
  });

  it('returns true for result tag with content', async () => {
    const executor = createMockExecutor();
    const code =
      'ccr::has_result("<ccr:result type=\\"blocked\\">Details</ccr:result>")';
    const result = await runRill(code, executor);

    expect(result.result).toBe(true);
  });

  it('returns false when no result tag found', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_result("no result tag here")',
      executor
    );

    expect(result.result).toBe(false);
  });

  it('returns false for malformed tags', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_result("<ccr:resulttype=\\"done\\"/>")',
      executor
    );

    expect(result.result).toBe(false);
  });
});

describe('ccr::has_frontmatter', () => {
  it('returns true for file with frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_frontmatter("tests/fixtures/templates/review-code.md")',
      executor
    );

    expect(result.result).toBe(true);
  });

  it('returns false for file without frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_frontmatter("tests/fixtures/templates/no-frontmatter.md")',
      executor
    );

    expect(result.result).toBe(false);
  });

  it('returns false for non-existing file', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::has_frontmatter("non-existent-file.md")',
      executor
    );

    expect(result.result).toBe(false);
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

    expect(result.result).toEqual({});
  });

  it('returns frontmatter dict for file with frontmatter', async () => {
    const executor = createMockExecutor();
    const result = await runRill(
      'ccr::get_frontmatter("tests/fixtures/templates/review-code.md")',
      executor
    );

    expect(result.result).toEqual(
      expect.objectContaining({
        description: 'Review code for issues',
      })
    );
  });
});

describe('ccr::command', () => {
  it('surfaces command-not-found as an invalid result', async () => {
    // rill 0.19.x converts an async host-function throw into an invalid
    // top-level result (status atom #R999) carrying the error message,
    // instead of rejecting execute().
    const executor = createMockExecutor();

    const { result } = await runRill(
      'ccr::command("non-existent-cmd")',
      executor,
      { commandsDir: '.claude/commands' }
    );

    expect(isInvalid(result)).toBe(true);
    expect(getStatus(result).message).toContain('Command not found');
  });
});

describe('ccr::state', () => {
  it('returns null (AC-1)', async () => {
    const executor = createMockExecutor();
    const result = await runRill('ccr::state("text")', executor);

    expect(result.result).toBe(null);
  });

  it('invokes callback with null for empty string (AC-2, BC-1)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    const ast = parse('ccr::state("")');
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledWith(null);
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('invokes callback with null for whitespace-only string (BC-2)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    const ast = parse('ccr::state("   ")');
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledWith(null);
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('invokes callback with single character (BC-3)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    const ast = parse('ccr::state("X")');
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledWith('X');
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('strips ANSI codes before callback (AC-8)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    // Use string interpolation to pass ANSI codes directly
    const ansiText = '\x1b[31mred text\x1b[0m';
    const code = `ccr::state("${ansiText}")`;
    const ast = parse(code);
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledWith('red text');
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('strips newlines to single line (BC-6)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    const ast = parse('ccr::state("line1\\nline2\\nline3")');
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledWith('line1 line2 line3');
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('strips carriage returns and newlines to single line', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    const ast = parse('ccr::state("line1\\r\\nline2\\r\\nline3")');
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledWith('line1 line2 line3');
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('invokes callback 100 times with correct values', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    // Build Rill code that calls ccr::state 100 times
    const calls = Array.from(
      { length: 100 },
      (_, i) => `ccr::state("State ${i}")`
    );
    const code = calls.join('\n');

    const ast = parse(code);
    await execute(ast, ctx);

    expect(onStateChange).toHaveBeenCalledTimes(100);

    // Verify last call has correct value
    expect(onStateChange).toHaveBeenLastCalledWith('State 99');

    // Verify first call has correct value
    expect(onStateChange).toHaveBeenNthCalledWith(1, 'State 0');

    // Verify middle call has correct value
    expect(onStateChange).toHaveBeenNthCalledWith(50, 'State 49');
  });

  it('propagates callback throw to Rill runtime (EC-3)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn().mockImplementation(() => {
      throw new Error('Callback error');
    });

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    const ast = parse('ccr::state("text")');

    await expect(execute(ast, ctx)).rejects.toThrow('Callback error');
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('throws Rill type error on non-string argument (EC-1)', async () => {
    const executor = createMockExecutor();

    await expect(runRill('ccr::state(123)', executor)).rejects.toThrow();
  });

  it('throws Rill arity error on missing argument (EC-2)', async () => {
    const executor = createMockExecutor();

    await expect(runRill('ccr::state()', executor)).rejects.toThrow();
  });

  it('does not invoke callback when onStateChange is not provided', async () => {
    const executor = createMockExecutor();

    // No onStateChange callback provided
    const ctx = createRunnerContext({
      executeClause: executor,
    });

    const ast = parse('ccr::state("text")');
    const result = await execute(ast, ctx);

    // Should still return null
    expect(result.result).toBe(null);
    // Should not throw
  });

  it('status persists across multiple log messages (AC-10)', async () => {
    const executor = createMockExecutor();
    const onStateChange = vi.fn();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

    const ctx = createRunnerContext({
      executeClause: executor,
      onStateChange,
    });

    // Set state once, then emit 3 log messages
    const code = `
      ccr::state("Working...")
      log("Log message 1")
      log("Log message 2")
      log("Log message 3")
    `;
    const ast = parse(code);
    await execute(ast, ctx);

    // Verify onStateChange called exactly once with correct value
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith('Working...');

    // Verify the state value persisted unchanged across all log calls
    const allCalls = onStateChange.mock.calls;
    expect(allCalls.length).toBe(1);
    expect(allCalls[0]?.[0]).toBe('Working...');

    // Verify log messages were emitted (default onLog callback uses console.log)
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Log message 1')
    );
    expect(consoleSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Log message 2')
    );
    expect(consoleSpy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('Log message 3')
    );

    consoleSpy.mockRestore();
  });
});
