# Release Notes

## v0.6.2

### Bug Fixes

- **Script command args**: Variables (`$1`, `$spec_review`, etc.) in command args now substitute correctly

---

## v0.6.1

### Terminal Output Polish

- **Lowercase tags**: `[runner]`, `[claude]`, `[answer]` for cleaner appearance
- **Tool names in tags**: `[Read]`, `[Bash]`, `[Grep]` instead of generic `[TOOL]`
- **Task names in tags**: `[Explore]`, `[Plan]` instead of generic `[TASK]`
- **Blue tool tags**: Tools now use blue color instead of yellow
- **Parallel indicator**: Simplified from `[TOOL ×2]` to `[×2]`
- **Task indentation**: Added space after `│` for consistent alignment
- **Bash command display**: Newlines/CRs replaced with space for single-line output

### Log Format

- **JSON runner events**: All runner lifecycle events now emitted as JSON with `type: "runner"`
- **Structured events**: `run_start`, `step_start`, `step_complete`, `iteration_start`, `blocked`, `error`, `max_iterations`
- **Consistent format**: Log events match terminal output terminology

### Documentation

- **SCRIPT_SPEC.md**: Script file format specification with syntax, variables, and EBNF grammar

### Bug Fixes

- **Task stats tracking**: Fixed bug where task token stats went to step instead of task
- **Task tool counting**: Task tool no longer counts itself in its own stats
- **Output token tracking**: Now captures actual output tokens from usage data (was only estimating from chars)
- **Step totals**: Task stats now merge into step/run totals correctly

---

## v0.6.0

### Output Statistics

- **Step stats summary**: Completion shows duration, messages, tokens, and tools used
- **Token breakdown**: Input tokens split by prompt, cache write (5m/1h), and cache read
- **Run totals**: Accumulated stats across all steps displayed on run completion
- **Task stats**: Nested task output includes stats summary

### Display Improvements

- **Duration format**: Added spaces between units (`1m 30s` instead of `1m30s`)
- **Terminal cleanup**: Carriage returns stripped, Claude messages truncated to 150 chars
- **Task display**: Simplified borders, stats summary on task completion
- **Error display**: Cleaner error formatting with `<tool_use_error>` tags stripped

### Internal Improvements

- Stats tracking module (`src/output/stats.ts`) with token aggregation
- Token usage types (`TokenUsage`, `CacheCreation`) in Claude types
- Terminal output via `terminalLog()` for consistent CR handling

---

## v0.5.0

### Breaking Changes

- **New script format**: Scripts now use `prompt("text")` and `command("name")` syntax instead of bare subcommands
- **Subcommand now required**: Must specify `prompt`, `command`, or `script` explicitly
- **Prompt text required**: `prompt` subcommand no longer accepts empty input

### Script Features

- **Output chaining**: Capture step output with `-> $varname` and inject into subsequent steps
- **Automatic last result**: `$_` holds previous step output without explicit capture
- **Variable substitution**: Use `$varname` anywhere in prompts to inject captured text
- **Heredoc support**: Multi-line prompts with `prompt(<<EOF...EOF)` syntax
- **Script arguments**: `$1`, `$2`, `$ARGUMENTS` substitution from CLI args

### Internal Improvements

- Extracted shared utilities: `parseArgumentHint`, `formatSize`
- Centralized constants replacing magic numbers throughout codebase
- Encapsulated DeadDropQueue in testable class
- Added tool input type definitions for better type safety

---

## v0.4.0

### Output Improvements

- Unified human-friendly time format: `2.5s`, `1m30s`, `1h2m3s`
- Step numbers in completion messages: `Completed step 1 in 2.5s`
- Step count in run completion: `Completed run X (2 steps) in 5.0s`
- Simplified step header: `Running step 1:` (removed brackets)

### Command Template Features

- Added `$ARGUMENTS` variable for all arguments joined with spaces
- Frontmatter support: `model`, `description`, `argument-hint`
- Required vs optional arguments via hint syntax: `<required>` vs `[optional]`
- Missing required arguments produce clear error with usage hint
- Frontmatter `model` provides default (CLI `--model` takes precedence)

### CLI Improvements

- Added `--version` / `-V` flag
- Missing template arguments now error instead of warning
- Experimental [DeadDrop](https://deaddrop.sh) support with `--deaddrop`

---

## v0.3.0

### Signal Changes

- Removed `:::RUNNER::DONE:::` signal (no signal now means success)
- Renamed `:::RUNNER::CONTINUE:::` to `:::RUNNER::REPEAT_STEP:::`
- Updated repeat message: "Claude requested to repeat the step"

---

## v0.2.0

### Output Improvements

- Added timestamps to all log messages (HH:MM:SS.mmm format)
- Consolidated all control messages under `[RUNNER]` prefix
- Removed decorative separator blocks for cleaner output
- Claude responses now display on single line (newlines collapsed)
- Removed `[INIT]` messages (config shown by runner instead)

### New Features

- Added `--model` / `-m` flag to specify Claude model (e.g., `sonnet`, `opus`, `haiku`)
- Added iteration tracking: `Running step 1: command args...`
- Human-friendly time format: `Completed run (3 steps) in 24.0s`

---

## v0.1.0

Initial release with core functionality:

- PTY-based Claude CLI execution
- Real-time tool call visualization
- RUNNER signal support for iteration control (`:::RUNNER::DONE:::`, `:::RUNNER::CONTINUE:::`, etc.)
- Command templates from `.claude/commands/`
- Script mode for sequential command execution
- Verbosity levels: quiet, normal, verbose
- Parallel tool call detection and grouping
- File logging with ANSI stripping
