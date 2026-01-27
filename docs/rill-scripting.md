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

### ccr::has_result(text) -> boolean

Check if text contains a `<ccr:result>` tag (self-closing or with content).

```rill
ccr::prompt("Fix issues. Output <ccr:result type='repeat'/> if more remain.") :> $output

# Branch based on whether result exists
ccr::has_result($output) ? {
  ccr::get_result($output) :> $result
  ($result.type == "repeat") ? log("More work needed")
} ! log("No result signal found")
```

### ccr::get_result(text) -> dict | {}

Extract an XML result from text. Returns empty dict `{}` if no result found. See [Results](results.md).

```rill
ccr::prompt("Fix issues. Output <ccr:result type='repeat'/> if more remain.") :> $output
ccr::get_result($output) :> $result

# Check result type
($result.?type) ? {
  ($result.type == "repeat") ? log("More work needed")
  ($result.type == "blocked") ? ccr::error($result.reason)
}
```

### ccr::has_frontmatter(path) -> boolean

Check if a file exists and contains YAML frontmatter.

```rill
ccr::has_frontmatter("PLAN.md") ? {
  ccr::get_frontmatter("PLAN.md") :> $meta
  log("Found metadata: {$meta}")
} ! log("No frontmatter in PLAN.md")
```

### ccr::error(message?) -> throws

Stop script execution with an error.

```rill
ccr::error("Missing required configuration")
```

### ccr::get_frontmatter(path) -> dict

Get YAML frontmatter from a file. Returns empty dict `{}` if no frontmatter found. Throws error if file doesn't exist.

```rill
ccr::get_frontmatter("PLAN.md") :> $meta

# Set default if key is missing
($meta.?priority) ! ($meta.priority = "low")
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

"""
Review these files:
{$files}

Focus on security issues.
"""
-> ccr::prompt
```

## Triple-Quote Strings

Multi-line prompts use triple-quote syntax. Pipe to a function with `->`:

```rill
"""
Given these issues:
{$issues}

Suggest fixes with code examples.
For each fix, explain the reasoning.
"""
-> ccr::prompt :> $fixes
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
"""
Based on these issues:
{$issues}

Suggest specific fixes with code examples.
"""
-> ccr::prompt :> $fixes

# Summarize for the developer
"""
Create a brief summary of the review:

Issues: {$issues}
Fixes: {$fixes}
"""
-> ccr::prompt
```

Run with:

```bash
claude-code-runner script code-review.rill src/auth/
```
