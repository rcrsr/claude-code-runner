# Rill Scripting

Rill scripts chain multiple Claude prompts and commands into multi-step workflows.

For full Rill language reference, see [github.com/rcrsr/rill](https://github.com/rcrsr/rill). Claude Code Runner extends Rill with the `ccr::` host functions documented below.

## Script Structure

```rill
---
description: What this script does
model: sonnet
args: file: string, count: number = 5
---

# Comments start with #

ccr::prompt("First step") :> $result
ccr::prompt("Use previous: {$result}")
```

## Frontmatter Options

| Key | Description |
|-----|-------------|
| `description` | What the script does |
| `model` | Default model for all prompts |
| `args` | Named arguments with types and defaults |

## Host Functions

All functions use the `ccr::` namespace prefix.

### ccr::prompt(text, model?) -> string

Execute a prompt with Claude.

```rill
ccr::prompt("Analyze this code for bugs")
ccr::prompt("Explain {$file}", "haiku") :> $explanation
```

### ccr::command(name, args?) -> string

Execute a command template from `.claude/commands/`.

```rill
ccr::command("review-code", ["src/auth.ts"])
ccr::command("fix-tests", ["src/", "verbose"]) :> $fixes
```

### ccr::skill(name, args?) -> string

Execute a slash command directly.

```rill
ccr::skill("commit")
ccr::skill("conduct:create-language-policy", ["typescript"])
```

### ccr::file_exists(path) -> boolean

Check if a file exists.

```rill
ccr::file_exists("src/config.ts") ? ccr::prompt("Config exists, analyze it")

ccr::file_exists($1) ? ccr::command("process-file", $1)
```

### ccr::get_result(text) -> dict | ""

Extract an XML result from text. See [Results](results.md).

```rill
ccr::prompt("Fix issues. Output <ccr:result type='repeat'/> if more remain.") :> $output
ccr::get_result($output) :> $result

# Check result type
($result.?type) ? {
  ($result.type == "repeat") ? log("More work needed")
  ($result.type == "blocked") ? ccr::error($result.reason)
}
```

### ccr::error(message?) -> throws

Stop script execution with an error.

```rill
ccr::error("Missing required configuration")
```

### ccr::read_frontmatter(path, defaults?) -> dict

Read YAML frontmatter from a file. Returns defaults merged with frontmatter.

```rill
ccr::read_frontmatter("PLAN.md") :> $meta
ccr::read_frontmatter("task.md", [priority: "low"]) :> $meta
```

## Variables

### Built-in Variables

| Variable | Description |
|----------|-------------|
| `$1`, `$2`, `$3` | Positional script arguments |
| `$ARGUMENTS` | All arguments joined with spaces |
| `ARGS` | Array of script arguments |
| `ENV` | Environment variables dictionary |

### Variable Capture

Capture output using `:>` (capture operator):

```rill
ccr::prompt("List files") :> $files
ccr::command("analyze", $1) :> $analysis
```

Note: `->` pipes value to next operation; `:>` stores value AND continues chain.

### Variable Interpolation

Use `{$variable}` in strings:

```rill
ccr::prompt("Analyze {$file} for issues")

ccr::prompt(<<EOF
Review these files:
{$files}

Focus on security issues.
EOF
)
```

## Heredocs

Multi-line prompts use heredoc syntax:

```rill
ccr::prompt(<<EOF
Given these issues:
{$issues}

Suggest fixes with code examples.
For each fix, explain the reasoning.
EOF
) :> $fixes
```

## Control Flow

Rill uses `cond ? then_expr ! else_expr` for conditionals:

```rill
# Simple conditional
ccr::file_exists("config.ts") ? ccr::prompt("Config found, validate it")

# With else branch
($count > 10) ? ccr::error("Too many items") ! log("Count OK")

# Check signal and branch
ccr::get_result($output) :> $result
($result.?type) ? {
  ($result.type == "repeat") ? log("Continuing...")
  ($result.type == "blocked") ? ccr::error($result.reason)
  ($result.type == "done") ? log("Complete")
}
```

## Complete Example

```rill
---
description: Code review workflow
args: path: string
---

# Analyze the code
ccr::prompt("Review the code in {$path} for bugs and issues") :> $issues

# Get improvement suggestions
ccr::prompt(<<EOF
Based on these issues:
{$issues}

Suggest specific fixes with code examples.
EOF
) :> $fixes

# Summarize for the developer
ccr::prompt(<<EOF
Create a brief summary of the review:

Issues: {$issues}
Fixes: {$fixes}
EOF
)
```

Run with:

```bash
claude-code-runner script code-review.rill src/auth/
```
