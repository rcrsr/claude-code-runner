# Claude Code Runner

Deterministic, scripted, unattended Claude Code execution.

## Why Use This?

- **Run unattended** — Execute Claude commands in CI/CD pipelines and automation scripts
- **Script multiple commands** — Chain prompts together in a single run
- **Self-correcting loops** — Users can configure prompts with [runner signals](#runner-signals) to control execution, like retry, complete, or escalation to a human
- **Full visibility** — Watch tool calls stream in real-time
- **Complete logs** — Every session captured for debugging and review

## Prerequisites

- Node.js 18 or later
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Installation

```bash
npm install -g @rcrsr/claude-code-runner
```

## Usage

### prompt — Run a single prompt

```bash
claude-code-runner prompt "Refactor the auth module to use async/await"
```

The `prompt` keyword is optional — bare strings work the same way:

```bash
claude-code-runner "Fix the failing tests in src/utils"
```

### command — Run a slash command file

Store prompts as markdown files in `.claude/commands/` and invoke them by name:

```bash
claude-code-runner command review-code src/auth.ts
```

This loads `.claude/commands/review-code.md` and substitutes `$1` with `src/auth.ts`.

**Example template** (`.claude/commands/review-code.md`):

```markdown
Review the code in $1 for:

- Security vulnerabilities
- Performance issues
- Code style violations

Output findings as a numbered list.
```

Templates support multiple arguments (`$1`, `$2`, `$3`, etc.) and YAML frontmatter is automatically stripped.

### script — Run multiple commands in sequence

Create a script file with one command per line:

```bash
claude-code-runner script deploy-tasks.txt
```

**Example script** (`deploy-tasks.txt`):

```text
# Comments start with #
prompt Run the test suite and fix any failures
command review-code src/api/handlers.ts
prompt Update the changelog for version 2.1.0
```

Scripts stop on `BLOCKED` or `ERROR` signals, letting you catch issues before continuing.

### Options

| Option      | Description                  |
| ----------- | ---------------------------- |
| `--quiet`   | Minimal output (errors only) |
| `--normal`  | Default output level         |
| `--verbose` | Full output with details     |
| `--no-log`  | Disable file logging         |

## Runner Signals

Signals give Claude a way to control execution flow. Instruct Claude to output these signals in your prompts or templates, and the runner will respond accordingly.

| Signal                   | Effect                           |
| ------------------------ | -------------------------------- |
| `:::RUNNER::DONE:::`     | Exit successfully                |
| `:::RUNNER::CONTINUE:::` | Continue to next iteration       |
| `:::RUNNER::BLOCKED:::`  | Exit with error (awaiting human) |
| `:::RUNNER::ERROR:::`    | Exit with error                  |

**Example prompt using signals:**

```bash
claude-code-runner "Fix all lint errors in src/. Output :::RUNNER::DONE::: when complete, or :::RUNNER::BLOCKED::: if you need human input."
```

**Example template with signals** (`.claude/commands/fix-tests.md`):

```markdown
Run the test suite for $1.

- If all tests pass, output :::RUNNER::DONE:::
- If tests fail and you can fix them, fix them and output :::RUNNER::CONTINUE::: to re-run
- If tests fail and you need help, output :::RUNNER::BLOCKED::: with an explanation
```

This pattern enables self-correcting loops: Claude attempts a fix, signals `CONTINUE` to retry, and only exits when done or stuck.

**Defaults:**

- Max 10 iterations per command (prevents runaway loops)
- If no signal is detected, the runner uses the CLI exit code (0 = success, non-0 = error)

## Exit Codes

For CI/CD integration:

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| 0    | Success (`DONE` signal or clean exit)        |
| 1    | Error (`ERROR`, `BLOCKED`, or non-zero exit) |

## Logs

Sessions are logged to `./logs/` with timestamped filenames. Disable with `--no-log`.

## Development

```bash
npm run check    # Run all checks (typecheck, lint, format, test)
npm run build    # Build the project
npm test         # Run tests
```

## License

MIT
