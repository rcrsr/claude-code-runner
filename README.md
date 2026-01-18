# Claude Code Runner

Deterministic, scripted, unattended Claude Code execution.

## Why Use This?

- **Walk away** — Workflows run unattended in CI/CD pipelines
- **Chain results** — Capture output from one step, inject it into the next
- **Claude decides** — Signals control when to retry, escalate, or finish
- **No hitting context limits** — Fresh context per step keeps long workflows running
- **Watch live** — See tool calls stream as they execute
- **Replay later** — Full session logs for debugging

## Prerequisites

- Node.js 18 or later
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Installation

```bash
npm install -g @rcrsr/claude-code-runner
```

## Usage

### prompt — Run a single prompt

```bash
claude-code-runner prompt "Refactor the auth module to use async/await"
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

**Template variables:**

- `$1`, `$2`, `$3`... — Positional arguments
- `$ARGUMENTS` — All arguments joined with spaces

**Frontmatter support:**

```markdown
---
description: Review code for issues
argument-hint: <file> [severity]
model: sonnet
---

Review $1 with severity level $2...
```

- `argument-hint` — Defines required `<arg>` and optional `[arg]` arguments
- `model` — Default model for this command (CLI `--model` takes precedence)
- `description` — Command description

### script — Run multi-phase workflows

Scripts chain commands where each phase builds on the previous. Output from one step can be captured and reused in subsequent steps via variable substitution.

```bash
claude-code-runner script refactor-workflow.txt src/api/
```

**Script syntax:**

| Syntax                              | Description                               |
| ----------------------------------- | ----------------------------------------- |
| `prompt("text")`                    | Run a prompt (supports `\n` for newlines) |
| `prompt(<<EOF...EOF)`               | Multi-line prompt using heredoc           |
| `command("name")`                   | Run a command template                    |
| `command("name", ["arg1", "arg2"])` | Run command with arguments                |
| `-> $varname`                       | Capture output into a variable            |
| `$_`                                | Previous step's output (auto-captured)    |
| `$varname`                          | Named captured variable                   |
| `$1`, `$2`, `$ARGUMENTS`            | Script arguments                          |
| `# comment`                         | Comments (ignored)                        |

**Example: Variable capture and chaining** (`refactor-workflow.txt`):

```text
---
argument-hint: <directory>
---
# Phase 1: Analyze - capture issues list
prompt("Review $1 for error handling issues. List each issue with file:line.") -> $issues

# Phase 2: Fix - use captured issues (no temp file needed)
prompt(<<EOF
Fix these issues:
$issues

For each fix, make minimal changes.
EOF
)

# Phase 3: Verify - $_ contains previous output
prompt("Run tests. Confirm fixes are correct. Previous output: $_")
```

**Example: Command with capture** (`test-and-fix.txt`):

```text
# Run tests, capture failures
command("run-tests", [$1]) -> $failures

# Fix any failures
prompt("Fix these test failures:\n$failures")

# Verify
command("run-tests", [$1])
```

Scripts stop on `BLOCKED` or `ERROR` signals, catching issues before continuing to the next phase.

### Options

| Option            | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `--version`, `-V` | Print version number                                   |
| `--model`, `-m`   | Specify Claude model (e.g., `sonnet`, `opus`, `haiku`) |
| `--quiet`         | Minimal output (errors only)                           |
| `--normal`        | Default output level                                   |
| `--verbose`       | Full output with details                               |
| `--log`           | Enable file logging                                    |
| `--deaddrop`      | Enable [DeadDrop](https://deaddrop.sh) streaming       |

**Example with model selection:**

```bash
claude-code-runner -m sonnet prompt "Explain this codebase"
```

## Runner Signals

Signals give Claude a way to control execution flow. Instruct Claude to output these signals in your prompts or templates, and the runner will respond accordingly.

| Signal                      | Effect                           |
| --------------------------- | -------------------------------- |
| `:::RUNNER::REPEAT_STEP:::` | Run the same step again          |
| `:::RUNNER::BLOCKED:::`     | Exit with error (awaiting human) |
| `:::RUNNER::ERROR:::`       | Exit with error                  |

No signal means success—the runner exits when Claude finishes without outputting a signal.

### Document-Driven Workflows

The real power of runner signals is **checklist-based execution**. Create a document with implementation steps, and Claude works through them one at a time across multiple invocations.

**Implementation plan** (`PLAN.md`):

```markdown
# Feature: User Authentication

- [ ] Create `src/auth/types.ts` with User and Session interfaces
- [ ] Implement `src/auth/session.ts` with createSession and validateSession
- [ ] Add JWT signing in `src/auth/jwt.ts`
- [ ] Write tests in `src/auth/__tests__/session.test.ts`
- [ ] Update `src/index.ts` to export auth module
```

**Command template** (`.claude/commands/work-plan.md`):

```markdown
Read $1 and find the first unchecked item (- [ ]).

1. Implement that single item
2. Mark it complete by changing `- [ ]` to `- [x]`
3. Check if any unchecked items remain:
   - If YES: output :::RUNNER::REPEAT_STEP:::
   - If NO: output "All tasks complete"

If blocked, output :::RUNNER::BLOCKED::: with what you need.
```

**Run it:**

```bash
claude-code-runner command work-plan PLAN.md
```

Each invocation: Claude finds the next unchecked step → implements it → marks it done → signals `REPEAT_STEP`. The loop continues until all boxes are checked. The document itself becomes persistent state across runs.

### Self-Correcting Loops

For retry-based patterns where Claude validates its own work:

```bash
claude-code-runner prompt "Fix all lint errors. Run the linter after each fix. Output :::RUNNER::REPEAT_STEP::: if errors remain, nothing if clean."
```

Or as a template (`.claude/commands/fix-tests.md`):

```markdown
Run the test suite for $1.

- If tests pass: done
- If tests fail and fixable: fix them, output :::RUNNER::REPEAT_STEP:::
- If tests fail and stuck: output :::RUNNER::BLOCKED::: with explanation
```

**Defaults:**

- Max 10 iterations per command (prevents runaway loops)
- If no signal is detected, the runner uses the CLI exit code (0 = success, non-0 = error)

## Exit Codes

For CI/CD integration:

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| 0    | Success (no signal or clean exit)            |
| 1    | Error (`ERROR`, `BLOCKED`, or non-zero exit) |

## Logs

Sessions are logged to `./logs/` with timestamped filenames when `--log` is specified.

## Development

```bash
npm run check    # Run all checks (typecheck, lint, format, test)
npm run build    # Build the project
npm test         # Run tests
```

## License

MIT
