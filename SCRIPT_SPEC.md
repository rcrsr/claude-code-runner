# Script File Specification

Script files define multi-step workflows for Claude Code Runner. Each step executes in sequence, with fresh context per step. Output from one step can be captured and injected into subsequent steps.

## File Format

Script files are plain text with `.txt` extension. They contain:

1. Optional YAML frontmatter (metadata)
2. Executable lines (prompts or commands)
3. Comments and blank lines (ignored)

## Frontmatter

Optional YAML block at the start of the file, delimited by `---`:

```yaml
---
description: Brief description of the script
argument-hint: <required> [optional]
model: sonnet
---
```

| Field           | Description                                             |
| --------------- | ------------------------------------------------------- |
| `description`   | Human-readable script description                       |
| `argument-hint` | Argument syntax: `<arg>` = required, `[arg]` = optional |
| `model`         | Default Claude model (CLI `--model` overrides this)     |

## Executable Lines

### Prompt

Run a prompt directly:

```
prompt("Your prompt text here")
```

Supports escape sequences:

- `\n` → newline
- `\t` → tab
- `\"` → literal quote
- `\\` → literal backslash

### Prompt with Heredoc

Multi-line prompts use heredoc syntax:

```
prompt(<<EOF
First line of prompt.
Second line of prompt.
Third line with "quotes" preserved.
EOF
)
```

The delimiter (e.g., `EOF`) must:

- Follow `<<` immediately or with spaces
- Appear alone on its own line to close
- Use word characters only (`[a-zA-Z0-9_]`)

### Command

Run a command template from `.claude/commands/`:

```
command("review-code")
command("fix-tests", ["src/auth.ts"])
command("deploy", ["staging", "--dry-run"])
```

Arguments are passed to the template as `$1`, `$2`, etc.

## Output Capture

Capture step output into a variable using `-> $varname`:

```
prompt("List all files with errors") -> $errors
prompt("Fix these errors: $errors")
```

The captured variable stores Claude's complete response text.

## Variables

### Automatic Variable

| Variable | Description                              |
| -------- | ---------------------------------------- |
| `$_`     | Previous step's output (always captured) |

### Positional Arguments

| Variable     | Description                      |
| ------------ | -------------------------------- |
| `$1`         | First script argument            |
| `$2`         | Second script argument           |
| `$N`         | Nth script argument              |
| `$ARGUMENTS` | All arguments joined with spaces |

### Named Captures

| Variable   | Description                        |
| ---------- | ---------------------------------- |
| `$varname` | Output captured with `-> $varname` |

### Substitution Order

Variables substitute in this order:

1. `$_` (last output)
2. `$ARGUMENTS` (all args)
3. `$1`, `$2`, etc. (positional args)
4. `$varname` (named captures)

Unmatched `$N` placeholders resolve to empty string.

## Comments

Lines starting with `#` are ignored:

```
# Phase 1: Analyze the codebase
prompt("Analyze src/ for performance issues") -> $issues

# Phase 2: Fix identified issues
prompt("Fix these issues:\n$issues")
```

Blank lines are also ignored.

## Complete Example

```
---
description: Refactor workflow with test validation
argument-hint: <directory>
---

# Phase 1: Identify refactoring targets
prompt(<<EOF
Analyze $1 for code that needs refactoring.
Look for:
- Duplicated logic
- Long functions (>50 lines)
- Deep nesting (>3 levels)

Output a numbered list of specific changes.
EOF
) -> $changes

# Phase 2: Apply changes
prompt("Apply these refactoring changes:\n$changes\n\nMake minimal edits.")

# Phase 3: Validate
prompt(<<EOF
Run the test suite for $1.
If tests pass, output "All tests pass."
If tests fail, output :::RUNNER::ERROR::: with details.
EOF
)
```

Run with:

```bash
claude-code-runner script refactor.txt src/api/
```

## Execution Behavior

1. Steps execute sequentially
2. Each step gets fresh Claude context
3. Output capture happens after each step completes
4. Script stops on `:::RUNNER::BLOCKED:::` or `:::RUNNER::ERROR:::` signals
5. Script stops if Claude exits with non-zero code
6. Maximum 10 iterations per step (for `:::RUNNER::REPEAT_STEP:::` loops)

## Grammar (EBNF)

```ebnf
script        = frontmatter? line* ;
frontmatter   = "---" newline yaml "---" newline ;
line          = prompt | command | comment | blank ;
prompt        = "prompt(" (quoted | heredoc) ")" capture? ;
command       = "command(" quoted ("," array)? ")" capture? ;
capture       = "->" "$" identifier ;
quoted        = '"' (char | escape)* '"' ;
heredoc       = "<<" identifier newline content identifier newline ;
array         = "[" (quoted ("," quoted)*)? "]" ;
comment       = "#" text ;
blank         = whitespace* newline ;
identifier    = [a-zA-Z_][a-zA-Z0-9_]* ;
escape        = "\n" | "\t" | "\"" | "\\" ;
```
