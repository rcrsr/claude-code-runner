import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import * as fs from 'fs';

import { loadScript } from '../../src/script/loader.js';

describe('loadScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('file handling', () => {
    it('throws when script file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadScript('missing.script')).toThrow(
        'Script not found: missing.script'
      );
    });

    it('reads script file content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('prompt("hello")');

      loadScript('test.script');

      expect(fs.readFileSync).toHaveBeenCalledWith('test.script', 'utf-8');
    });
  });

  describe('frontmatter parsing', () => {
    it('parses frontmatter model', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
model: opus
---
prompt("test")`);

      const result = loadScript('test.script');

      expect(result.frontmatter.model).toBe('opus');
    });

    it('parses frontmatter description', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
description: My workflow
---
prompt("test")`);

      const result = loadScript('test.script');

      expect(result.frontmatter.description).toBe('My workflow');
    });

    it('parses argument-hint', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
argument-hint: <dir> [flags]
---
prompt("test")`);

      const result = loadScript('test.script', ['src/']);

      expect(result.frontmatter.argumentHint).toBe('<dir> [flags]');
    });
  });

  describe('argument validation', () => {
    it('throws when required args missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
argument-hint: <file> <mode>
---
prompt("test")`);

      expect(() => loadScript('test.script', [])).toThrow(
        'Missing required arguments: $1, $2'
      );
    });

    it('includes usage hint in error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
argument-hint: <source> <target>
---
prompt("test")`);

      expect(() => loadScript('test.script', ['only-one'])).toThrow(
        '(usage: <source> <target>)'
      );
    });

    it('allows optional args to be missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
argument-hint: <required> [optional]
---
prompt("test")`);

      expect(() => loadScript('test.script', ['one'])).not.toThrow();
    });

    it('validates with provided args', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
argument-hint: <a> <b>
---
prompt("test")`);

      expect(() => loadScript('test.script', ['arg1', 'arg2'])).not.toThrow();
    });
  });

  describe('line parsing', () => {
    it('parses prompt lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('prompt("hello world")');

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.type).toBe('prompt');
      if (result.lines[0]?.type === 'prompt') {
        expect(result.lines[0].text).toBe('hello world');
      }
    });

    it('parses command lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('command("review", ["src/"])');

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.type).toBe('command');
      if (result.lines[0]?.type === 'command') {
        expect(result.lines[0].name).toBe('review');
        expect(result.lines[0].args).toEqual(['src/']);
      }
    });

    it('parses multiple lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`prompt("first")
command("middle")
prompt("last")`);

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(3);
    });

    it('filters comments', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`# Comment
prompt("actual")
# Another comment`);

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(1);
    });

    it('parses capture syntax', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('prompt("test") -> $result');

      const result = loadScript('test.script');

      expect(result.lines[0]?.type).toBe('prompt');
      if (result.lines[0]?.type === 'prompt') {
        expect(result.lines[0].capture).toBe('result');
      }
    });

    it('includes line number in parse errors', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`prompt("valid")
invalid_syntax
prompt("also valid")`);

      expect(() => loadScript('test.script')).toThrow('line 2');
    });
  });

  describe('heredoc handling', () => {
    it('parses heredoc content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`prompt(<<EOF
Multi
line
content
EOF
)`);

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(1);
      if (result.lines[0]?.type === 'prompt') {
        expect(result.lines[0].text).toContain('Multi');
        expect(result.lines[0].text).toContain('line');
        expect(result.lines[0].text).toContain('content');
      }
    });

    it('parses heredoc with capture', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`prompt(<<EOF
Content
EOF
) -> $result`);

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(1);
      if (result.lines[0]?.type === 'prompt') {
        expect(result.lines[0].capture).toBe('result');
      }
    });
  });

  describe('integration scenarios', () => {
    it('parses complete script with frontmatter and heredocs', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
description: Demo script
argument-hint: <topic>
---

# Step 1
prompt("List facts about $1") -> $facts

# Step 2
prompt(<<EOF
Given: $facts
Summarize.
EOF
) -> $summary

# Step 3
prompt("Final: $_")`);

      const result = loadScript('demo.script', ['TypeScript']);

      expect(result.frontmatter.description).toBe('Demo script');
      expect(result.frontmatter.argumentHint).toBe('<topic>');
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0]?.type).toBe('prompt');
      expect(result.lines[1]?.type).toBe('prompt');
      expect(result.lines[2]?.type).toBe('prompt');
      if (result.lines[0]?.type === 'prompt') {
        expect(result.lines[0].capture).toBe('facts');
      }
      if (result.lines[1]?.type === 'prompt') {
        expect(result.lines[1].capture).toBe('summary');
        expect(result.lines[1].text).toContain('$facts');
      }
    });

    it('parses script without frontmatter', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`prompt("Hello")
prompt("World")`);

      const result = loadScript('test.script');

      expect(result.frontmatter).toEqual({});
      expect(result.lines).toHaveLength(2);
    });

    it('parses script with only frontmatter delimiters', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`---
---
prompt("test")`);

      const result = loadScript('test.script');

      expect(result.frontmatter).toEqual({});
      expect(result.lines).toHaveLength(1);
    });

    it('parses script with command and prompt mixed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`prompt("init") -> $setup
command("review", ["$1"])
prompt("Done with $_")`);

      const result = loadScript('test.script');

      expect(result.lines).toHaveLength(3);
      expect(result.lines[0]?.type).toBe('prompt');
      expect(result.lines[1]?.type).toBe('command');
      expect(result.lines[2]?.type).toBe('prompt');
    });
  });
});
