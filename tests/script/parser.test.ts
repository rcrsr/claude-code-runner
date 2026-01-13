import { describe, expect, it } from 'vitest';

import {
  extractScriptLines,
  parseCommandLine,
  parsePromptLine,
  parseScriptLine,
} from '../../src/script/parser.js';

describe('parsePromptLine', () => {
  describe('quoted strings', () => {
    it('parses simple quoted prompt', () => {
      const result = parsePromptLine('prompt("Hello world")');

      expect(result.type).toBe('prompt');
      expect(result.text).toBe('Hello world');
      expect(result.capture).toBeUndefined();
    });

    it('handles escape sequences', () => {
      const result = parsePromptLine('prompt("Line 1\\nLine 2")');

      expect(result.text).toBe('Line 1\nLine 2');
    });

    it('handles escaped quotes', () => {
      const result = parsePromptLine('prompt("Say \\"hello\\"")');

      expect(result.text).toBe('Say "hello"');
    });

    it('handles escaped backslash', () => {
      const result = parsePromptLine('prompt("Path: C:\\\\Users")');

      expect(result.text).toBe('Path: C:\\Users');
    });

    it('handles tab escape', () => {
      const result = parsePromptLine('prompt("Col1\\tCol2")');

      expect(result.text).toBe('Col1\tCol2');
    });
  });

  describe('heredoc', () => {
    it('parses heredoc prompt', () => {
      const input = `prompt(<<EOF
Hello
World
EOF
)`;
      const result = parsePromptLine(input);

      expect(result.type).toBe('prompt');
      expect(result.text).toBe('Hello\nWorld');
    });

    it('preserves indentation in heredoc', () => {
      const input = `prompt(<<END
  Indented line
    More indented
END
)`;
      const result = parsePromptLine(input);

      expect(result.text).toBe('  Indented line\n    More indented');
    });

    it('handles different delimiters', () => {
      const input = `prompt(<<PROMPT
Content here
PROMPT
)`;
      const result = parsePromptLine(input);

      expect(result.text).toBe('Content here');
    });
  });

  describe('capture syntax', () => {
    it('parses capture variable', () => {
      const result = parsePromptLine('prompt("Test") -> $output');

      expect(result.text).toBe('Test');
      expect(result.capture).toBe('output');
    });

    it('parses capture with heredoc', () => {
      const input = `prompt(<<EOF
Multi
line
EOF
) -> $result`;
      const result = parsePromptLine(input);

      expect(result.text).toBe('Multi\nline');
      expect(result.capture).toBe('result');
    });

    it('allows underscore in variable name', () => {
      const result = parsePromptLine('prompt("Test") -> $my_var');

      expect(result.capture).toBe('my_var');
    });

    it('allows numbers in variable name', () => {
      const result = parsePromptLine('prompt("Test") -> $var123');

      expect(result.capture).toBe('var123');
    });
  });

  describe('error handling', () => {
    it('throws on unterminated string', () => {
      expect(() => parsePromptLine('prompt("unterminated')).toThrow(
        'Unterminated string'
      );
    });

    it('throws on missing heredoc delimiter', () => {
      expect(() => parsePromptLine('prompt(<<EOF\nno closing')).toThrow(
        'missing closing delimiter'
      );
    });

    it('throws on invalid capture syntax', () => {
      expect(() => parsePromptLine('prompt("test") -> missing_dollar')).toThrow(
        'Expected $'
      );
    });
  });
});

describe('parseCommandLine', () => {
  it('parses command without args', () => {
    const result = parseCommandLine('command("review-code")');

    expect(result.type).toBe('command');
    expect(result.name).toBe('review-code');
    expect(result.args).toEqual([]);
  });

  it('parses command with empty args array', () => {
    const result = parseCommandLine('command("test", [])');

    expect(result.name).toBe('test');
    expect(result.args).toEqual([]);
  });

  it('parses command with single arg', () => {
    const result = parseCommandLine('command("review", ["src/main.ts"])');

    expect(result.name).toBe('review');
    expect(result.args).toEqual(['src/main.ts']);
  });

  it('parses command with multiple args', () => {
    const result = parseCommandLine(
      'command("build", ["--watch", "--verbose", "src/"])'
    );

    expect(result.args).toEqual(['--watch', '--verbose', 'src/']);
  });

  it('parses command with capture', () => {
    const result = parseCommandLine('command("test") -> $results');

    expect(result.name).toBe('test');
    expect(result.capture).toBe('results');
  });

  it('handles whitespace in args array', () => {
    const result = parseCommandLine('command("cmd", [ "a" , "b" ])');

    expect(result.args).toEqual(['a', 'b']);
  });

  describe('error handling', () => {
    it('throws on missing command name', () => {
      expect(() => parseCommandLine('command()')).toThrow('Expected quoted');
    });

    it('throws on unterminated args array', () => {
      expect(() => parseCommandLine('command("test", ["a"')).toThrow(
        'Expected , or ]'
      );
    });
  });
});

describe('parseScriptLine', () => {
  it('routes to prompt parser', () => {
    const result = parseScriptLine('prompt("hello")');

    expect(result.type).toBe('prompt');
  });

  it('routes to command parser', () => {
    const result = parseScriptLine('command("test")');

    expect(result.type).toBe('command');
  });

  it('throws on unknown line type', () => {
    expect(() => parseScriptLine('unknown("test")')).toThrow(
      'Unknown script line type'
    );
  });
});

describe('extractScriptLines', () => {
  it('extracts simple lines', () => {
    const content = `prompt("line 1")
prompt("line 2")`;

    const lines = extractScriptLines(content);

    expect(lines).toEqual(['prompt("line 1")', 'prompt("line 2")']);
  });

  it('filters empty lines', () => {
    const content = `prompt("a")

prompt("b")
`;

    const lines = extractScriptLines(content);

    expect(lines).toEqual(['prompt("a")', 'prompt("b")']);
  });

  it('filters comments', () => {
    const content = `# This is a comment
prompt("a")
# Another comment
prompt("b")`;

    const lines = extractScriptLines(content);

    expect(lines).toEqual(['prompt("a")', 'prompt("b")']);
  });

  it('handles heredoc spanning multiple lines', () => {
    const content = `prompt(<<EOF
Line 1
Line 2
EOF
)
prompt("next")`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Line 1');
    expect(lines[0]).toContain('Line 2');
    expect(lines[1]).toBe('prompt("next")');
  });

  it('handles multiple heredocs', () => {
    const content = `prompt(<<A
First
A
)
prompt(<<B
Second
B
)`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('First');
    expect(lines[1]).toContain('Second');
  });

  it('handles heredoc with capture on same line as closing paren', () => {
    const content = `prompt(<<EOF
Content here
EOF
) -> $result
prompt("next")`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('-> $result');
    expect(lines[1]).toBe('prompt("next")');
  });

  it('handles heredoc with variable references', () => {
    const content = `prompt(<<EOF
Using $var and $_ here
EOF
)`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('$var');
    expect(lines[0]).toContain('$_');
  });

  it('handles heredoc with empty content', () => {
    const content = `prompt(<<EOF
EOF
)`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(1);
  });

  it('handles mixed comments and heredocs', () => {
    const content = `# Setup
prompt("init") -> $setup
# Multi-line prompt
prompt(<<EOF
Using $setup
EOF
)
# Final step
prompt("done")`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('prompt("init") -> $setup');
    expect(lines[1]).toContain('Using $setup');
    expect(lines[2]).toBe('prompt("done")');
  });

  it('handles content that looks like heredoc marker inside heredoc', () => {
    const content = `prompt(<<EOF
Some text
<<NOTADELIM
More text
EOF
)`;

    const lines = extractScriptLines(content);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('<<NOTADELIM');
  });
});
