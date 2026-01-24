# CLI Reference

## Commands

### prompt

Run a single prompt with Claude.

```bash
claude-code-runner prompt "<text>"
```

**Examples:**

```bash
claude-code-runner prompt "Refactor the auth module to use async/await"
claude-code-runner -m haiku prompt "Explain this codebase"
```

### command

Run a command template from `.claude/commands/`.

```bash
claude-code-runner command <name> [args...]
```

**Arguments:**

- `name` - Template filename without `.md` extension
- `args` - Substituted as `$1`, `$2`, etc. in template

**Example:**

```bash
claude-code-runner command review-code src/auth.ts strict
```

Loads `.claude/commands/review-code.md` and substitutes:
- `$1` = `src/auth.ts`
- `$2` = `strict`
- `$ARGUMENTS` = `src/auth.ts strict`

### script

Run a multi-step Rill script.

```bash
claude-code-runner script <file.rill> [args...]
```

**Arguments:**

- `file.rill` - Path to Rill script file
- `args` - Available as `$1`, `$2`, `$ARGUMENTS` in script

**Example:**

```bash
claude-code-runner script workflows/deploy.rill production
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--version` | `-V` | Print version number |
| `--model` | `-m` | Claude model: `sonnet`, `opus`, `haiku` |
| `--quiet` | | Minimal output (errors only) |
| `--normal` | | Default output level |
| `--verbose` | | Full output with details |
| `--log` | | Enable file logging to `./logs/` |
| `--deaddrop` | | Enable DeadDrop streaming |

**Model selection example:**

```bash
claude-code-runner -m opus prompt "Design a caching system"
claude-code-runner --model haiku command quick-check src/
```

## Command Templates

Store reusable prompts in `.claude/commands/` as markdown files.

### Template Variables

| Variable | Description |
|----------|-------------|
| `$1`, `$2`, `$3`... | Positional arguments |
| `$ARGUMENTS` | All arguments joined with spaces |

### Frontmatter Options

```markdown
---
description: What this command does
argument-hint: <required> [optional]
model: sonnet
---

Your prompt template here using $1 and $2...
```

| Key | Description |
|-----|-------------|
| `description` | Command description |
| `argument-hint` | Usage hint: `<required>` vs `[optional]` |
| `model` | Default model (CLI `--model` takes precedence) |

### Example Template

`.claude/commands/fix-tests.md`:

```markdown
---
description: Fix failing tests in a directory
argument-hint: <directory> [verbosity]
model: sonnet
---

Run tests in $1 with $2 output.

If tests fail:
1. Analyze failures
2. Fix the code
3. Re-run tests

Output <ccr:result type="repeat"/> if failures remain after fixing.
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (script threw or Claude exited non-zero) |

## Logs

When `--log` is specified, sessions are logged to `./logs/` with timestamped filenames:

```
logs/sonnet-2026-01-23T14-30-00.log
```

Logs contain full session output with ANSI codes stripped for easy reading.
