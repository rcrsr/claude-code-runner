# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0]

### Added

- Rich scripting support via rill (https://github.com/rcrsr/rill)
- XML result protocol with application-defined results via `<ccr:result type="..." />` elements
- `ccr::get_result(text)` function to extract result attributes from Claude output
- `ccr::file_exists(path)` function to check file existence
- Test coverage for Rill integration (35 tests across `context.test.ts` and `runner.test.ts`)

### Changed

- Scripts must now be `.rill` files; legacy `.txt` format removed
- Control flow is now script-defined; runner no longer auto-repeats on signals

### Removed

- Legacy signals `:::RUNNER::REPEAT_STEP:::`, `:::RUNNER::BLOCKED:::`, `:::RUNNER::ERROR:::`
- Legacy script parser (`src/script/`)
- Old iteration runner (`src/core/runner.ts`)
- Legacy signal detection (`src/parsers/signals.ts`)
- Legacy signal functions: `ccr::signal()`, `ccr::clearSignal()`, `ccr::shouldRepeat()`, `ccr::isBlocked()`, `ccr::hasError()`
- `RunnerSignal` type and `RUNNER_SIGNALS` constant
- `maxIterations` and `iterationPauseMs` config options

## [0.6.2]

### Fixed

- Variables (`$1`, `$spec_review`, etc.) in command args now substitute correctly

## [0.6.1]

### Added

- SCRIPT_SPEC.md documentation with syntax, variables, and EBNF grammar
- JSON runner events for all lifecycle events (`run_start`, `step_start`, `step_complete`, etc.)

### Changed

- Terminal tags now lowercase: `[runner]`, `[claude]`, `[answer]`
- Tool names shown in tags: `[Read]`, `[Bash]`, `[Grep]` instead of `[TOOL]`
- Task names shown in tags: `[Explore]`, `[Plan]` instead of `[TASK]`
- Tool tags now use blue color instead of yellow
- Parallel indicator simplified from `[TOOL ×2]` to `[×2]`
- Bash command display shows newlines/CRs as spaces

### Fixed

- Task token stats now go to task instead of step
- Task tool no longer counts itself in its own stats
- Output token tracking now uses actual usage data instead of character estimates
- Task stats now merge into step/run totals correctly

## [0.6.0]

### Added

- Step stats summary showing duration, messages, tokens, and tools used
- Token breakdown with input tokens split by prompt, cache write, and cache read
- Run totals accumulated across all steps
- Task stats summary on nested task completion
- Stats tracking module (`src/output/stats.ts`)

### Changed

- Duration format includes spaces between units (`1m 30s` instead of `1m30s`)
- Carriage returns stripped from terminal output
- Claude messages truncated to 150 characters
- Simplified task display borders
- Cleaner error formatting with `<tool_use_error>` tags stripped

## [0.5.0]

### Added

- Output chaining with `-> $varname` capture syntax
- Automatic last result via `$_` variable
- Variable substitution with `$varname` in prompts
- Heredoc support with `prompt(<<EOF...EOF)` syntax
- Script arguments via `$1`, `$2`, `$ARGUMENTS`

### Changed

- Scripts now use `prompt("text")` and `command("name")` syntax
- Subcommand (`prompt`, `command`, `script`) is now required
- `prompt` subcommand no longer accepts empty input

## [0.4.0]

### Added

- `$ARGUMENTS` variable for all arguments joined with spaces
- Frontmatter support: `model`, `description`, `argument-hint`
- Required (`<arg>`) vs optional (`[arg]`) argument syntax in hints
- `--version` / `-V` flag
- Experimental DeadDrop support with `--deaddrop`

### Changed

- Unified human-friendly time format: `2.5s`, `1m30s`, `1h2m3s`
- Step numbers in completion messages: `Completed step 1 in 2.5s`
- Step count in run completion: `Completed run X (2 steps) in 5.0s`
- Simplified step header: `Running step 1:` (removed brackets)
- Missing template arguments now error instead of warning

## [0.3.0]

### Changed

- No signal now means success (removed `:::RUNNER::DONE:::`)
- Renamed `:::RUNNER::CONTINUE:::` to `:::RUNNER::REPEAT_STEP:::`
- Updated repeat message to "Claude requested to repeat the step"

## [0.2.0]

### Added

- `--model` / `-m` flag to specify Claude model
- Iteration tracking: `Running step 1: command args...`
- Timestamps on all log messages (HH:MM:SS.mmm format)

### Changed

- Consolidated all control messages under `[RUNNER]` prefix
- Claude responses display on single line (newlines collapsed)
- Removed decorative separator blocks
- Removed `[INIT]` messages (config shown by runner instead)

## [0.1.0]

### Added

- PTY-based Claude CLI execution
- Real-time tool call visualization
- Runner signal support for iteration control
- Command templates from `.claude/commands/`
- Script mode for sequential command execution
- Verbosity levels: quiet, normal, verbose
- Parallel tool call detection and grouping
- File logging with ANSI stripping
