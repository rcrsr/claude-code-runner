# Documentation

Claude Code Runner documentation.

## Contents

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Installation: first prompt, command, and script |
| [CLI Reference](cli-reference.md) | Commands, options, and exit codes |
| [Rill Scripting](rill-scripting.md) | Multi-step workflows with host functions ([full reference](https://github.com/rcrsr/rill)) |
| [Results](results.md) | XML result protocol for control flow |
| [Examples](examples.md) | Workflow patterns and real use cases |

## Quick Reference

### Commands

```bash
claude-code-runner prompt "..."           # Run single prompt
claude-code-runner command <name> [args]  # Run command template
claude-code-runner skill <name> [args]    # Run slash command /<name>
claude-code-runner script <file> [args]   # Run Rill script
claude-code-runner docs                   # Print rill/CCR reference
```

### Options

```bash
-m, --model <model>  # sonnet, opus, haiku
--quiet              # Errors only
--verbose            # Full output
--log                # Enable file logging
```

### Host Functions (provided by Claude Code Runner)

```rill
ccr::prompt(text, model?, timeout?)   # Execute prompt
ccr::command(name, args?, timeout?)   # Run command template
ccr::skill(name, args?, timeout?)     # Run slash command
ccr::state(text)                      # Set status line text
ccr::file_exists(path)                # Check file existence
ccr::get_result(text)                 # Extract the last ccr:result
ccr::has_result(text)                 # Check for a ccr:result tag
ccr::get_frontmatter(path)            # Get YAML frontmatter
ccr::has_frontmatter(path)            # Check for YAML frontmatter
```

### Variable Capture

```rill
ccr::prompt("...") => $result    # Capture output with =>
ccr::prompt("{$result}")         # Interpolate with {$var}
```

### Result Format

```xml
<ccr:result type="repeat"/>
<ccr:result type="done"/>
<ccr:result type="blocked" reason="...">details</ccr:result>
```
