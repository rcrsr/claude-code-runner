# Claude Code Runner

Deterministic, scripted, unattended Claude Code execution with [Rill](https://github.com/rcrsr/rill) scripting.

## Why Use This?

- **Rich scripting** — Fully scriptable with variables, conditionals, loops, and functions
- **Walk away** — Workflows run unattended in CI/CD pipelines
- **Chain results** — Capture output from one step, inject it into the next
- **Claude decides** — Results protocol lets Claude control flow with `<ccr:result type="..."/>`
- **No context limits** — Fresh context per step keeps long workflows running
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

### command — Run a skill file

Run skills (`.claude/skills/<name>/SKILL.md`) or commands (`.claude/commands/<name>.md`) by name:

```bash
claude-code-runner command review-code src/auth.ts
```

**Skills** (recommended) support subdirectories with templates, examples, and scripts. **Commands** are single-file prompts. Both use the same template syntax and create `/slash-commands` in Claude Code.

**Example skill** (`.claude/skills/review-code/SKILL.md`):

```markdown
---
description: Review code for issues
argument-hint: <file> [severity]
model: sonnet
---

Review the code in $1 for:

- Security vulnerabilities
- Performance issues
- Code style violations

Output findings as a numbered list.
```

**Template variables:**

- `$1`, `$2`, `$3`... — Positional arguments
- `$ARGUMENTS` — All arguments joined with spaces

**Frontmatter options:**

- `argument-hint` — Defines required `<arg>` and optional `[arg]` arguments
- `model` — Default model (CLI `--model` takes precedence)
- `description` — Skill/command description

### script — Run multi-phase workflows

Scripts use [Rill](https://github.com/rcrsr/rill), a scripting language designed for AI workflows. Rill provides:

- **Variables & capture** — Store Claude's output with `:>` operator
- **Conditionals** — Branch logic with `(condition) ? action`
- **Loops** — Iterate with `for` and `while`
- **Functions** — Reusable logic blocks
- **String interpolation** — Embed variables with `{$var}` syntax
- **Triple-quote strings** — Multi-line prompts with `"""..."""`

```bash
claude-code-runner script workflow.rill src/api/
```

**Example** (`code-review.rill`):

```rill
---
description: Code review workflow
args: path: string
---

# Analyze the code
ccr::prompt("Review the code in {$path} for bugs") :> $issues

# Get fixes based on issues found
"""
Based on these issues:
{$issues}

Suggest specific fixes with code examples.
"""
-> ccr::prompt :> $fixes

# Summarize
ccr::prompt("Summarize: Issues: {$issues} Fixes: {$fixes}")
```

**Host functions:**

| Function                     | Description                        |
| ---------------------------- | ---------------------------------- |
| `ccr::prompt(text, model?)`  | Execute a Claude prompt            |
| `ccr::skill(name, args?)`    | Run a Claude Code skill            |
| `ccr::command(name, args?)`  | Run a Claude Code slash command    |
| `ccr::has_result(text)`      | Check if text contains ccr:result  |
| `ccr::get_result(text)`      | Extract `<ccr:result>` from output |
| `ccr::has_frontmatter(path)` | Check if file has frontmatter      |
| `ccr::get_frontmatter(path)` | Parse YAML frontmatter             |
| `ccr::file_exists(path)`     | Check if file exists               |
| `ccr::error(message?)`       | Stop execution with error          |

See [docs/rill-scripting.md](docs/rill-scripting.md) for the full scripting reference.

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

## Results

Results let Claude communicate control flow decisions back to your scripts using XML:

```xml
<ccr:result type="repeat"/>
<ccr:result type="done"/>
<ccr:result type="blocked" reason="...">details</ccr:result>
```

Result types are application-defined. Your script extracts and handles them:

```rill
ccr::prompt("Fix bugs. Signal <ccr:result type='repeat'/> if more remain.") :> $result
ccr::get_result($result) :> $result

($result.type == "repeat") ? log("More work needed")
($result.type == "blocked") ? ccr::error($result.reason)
```

See [docs/results.md](docs/results.md) for workflow patterns.

## Exit Codes

For CI/CD integration:

| Code | Meaning                                 |
| ---- | --------------------------------------- |
| 0    | Success                                 |
| 1    | Error (script threw or Claude exited 1) |

## Logs

Sessions are logged to `./logs/` with timestamped filenames when `--log` is specified.

## Documentation

- [Getting Started](docs/getting-started.md)
- [CLI Reference](docs/cli-reference.md)
- [Rill Scripting](docs/rill-scripting.md)
- [Results](docs/results.md)
- [Examples](docs/examples.md)

## Development

```bash
npm run check    # Run all checks (typecheck, lint, format, test)
npm run build    # Build the project
npm test         # Run tests
```

## License

MIT
