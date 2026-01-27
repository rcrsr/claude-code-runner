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
claude-code-runner script <file> [args]   # Run Rill script
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
ccr::prompt(text, model?)        # Execute prompt
ccr::command(name, args?)        # Run command template
ccr::skill(name, args?)          # Run slash command
ccr::file_exists(path)           # Check file existence
ccr::get_result(text)            # Extract XML signal
ccr::get_frontmatter(path)       # Get YAML frontmatter
ccr::error(message?)             # Stop with error
```

### Variable Capture

```rill
ccr::prompt("...") :> $result    # Capture output with :>
ccr::prompt("{$result}")         # Interpolate with {$var}
```

### Result Format

```xml
<ccr:result type="repeat"/>
<ccr:result type="done"/>
<ccr:result type="blocked" reason="...">details</ccr:result>
```
