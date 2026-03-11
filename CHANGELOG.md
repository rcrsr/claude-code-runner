# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.13.0] — 2026-03-10

### Added

- Live-ticking status line timer at 250ms refresh rate (previously only updated on message arrival)
- `returnType` declared on all `ccr::` host functions for rill type introspection
- Configurable inactivity timeout (default 10 min) kills hung Claude processes when no output is received
- Timeout returns `<ccr:result type="timeout" method="..." .../>` with invocation details (method, name, model)
- `inactivityTimeoutMs` field on `RunnerConfig` and `ClaudeProcessOptions`
- Per-call `timeout` parameter (in minutes) on `ccr::prompt`, `ccr::command`, `ccr::skill` host functions

### Changed

- Upgraded `@rcrsr/rill` from `~0.8.6` to `^0.11.0`
- Host function definitions migrated from `HostFunctionDefinition` to `RillFunction` with `RillParam` and `RillType`
- Param descriptions preserved in `RillParam.annotations` field

### Fixed

- Script setup errors now include the script filename (e.g. `Script setup failed for workflow.rill: ...`)
- Generic script errors include the script filename in the `[runner]` output
- Error messages strip `\r\n` for single-line display, consistent with Claude text block formatting

## [0.12.1] — 2026-03-01

### Added

- Crash-recovery persistence: saves run stats to `os.tmpdir()` after each message via stable ID (SHA-256 of cwd+args)
- On restart with matching stable ID, restores accumulated stats and original start time for accurate totals
- Status line shows accumulated active runtime as `[hh:mm:ss]` prefix; excludes crash gaps via persisted elapsed tracking

### Fixed

- Agent dot colors use hash of agent ID for stable color assignment; removes order-dependent `nextLabelIndex` counter

## [0.12.0] — 2026-03-01

### Changed

- Upgraded `@rcrsr/rill` from `~0.7.2` to `~0.8.6`
- Upgraded `@types/node` from `^25.2.0` to `^25.3.3`
- Upgraded `typescript-eslint` from `^8.54.0` to `^8.56.1`

### Fixed

- Task tracking (colored markers, agent names) now activates for Claude Code's renamed `Agent` tool; matches both `Agent` and `Task` for backwards compatibility
- Output token display uses API-reported `output_tokens` directly; removes `~` prefix and character-based estimation fallback

## [0.11.1] — 2026-02-08

### Changed

- Upgraded `@rcrsr/rill` from `~0.7.0` to `~0.7.2`

### Fixed

- Status line rendering replaced cursor save/restore (`\x1b[s`/`\x1b[u`) with `\x1b[2K\r` overwrite; eliminates ghost lines in scrollback
- Status line persists across `ccr::prompt` steps; `resetFormatterState` no longer resets `currentStatusText`

## [0.11.0] — 2026-02-08

### Breaking

- Upgraded `@rcrsr/rill` from `~0.5.0` to `~0.7.0`; capture arrow `=>` replaces `:>` (enables ligatures in programming fonts; `:>` rejected with RILL-P006)

### Added

- `ccr::state(text)` host function for Rill scripts to display current execution phase on a persistent status line below log output; status updates via callback flow through `FormatterState` and re-renders after each log message
- Status line uses ANSI cursor control sequences for positioning, ANSI stripping for security, and automatic clearing on script completion
- `STATUS_LINE_ELLIPSIS` and `STATUS_LINE_MIN_WIDTH` constants control truncation behavior with 20-column terminal width minimum
- Terminal resize handling enables responsive status line display; quiet mode suppression prevents status output in piped contexts
- `docs` subcommand outputs Rill language reference and CCR function signatures for LLM prompts
- `--functions-only` and `--language-only` flags for selective docs output

### Changed

- Error messages display as `[error]` instead of `ERROR:` to match tool call styling
- CCR host functions now include description metadata for introspection

### Fixed

- Status line persists across log output; `bindFormatterState` connects `terminalLog` re-rendering to the active `FormatterState`
- Concurrent agent tool calls now show colored dot markers (queue-based attribution replaces dropped markers)

## [0.10.0] — 2026-02-03

### Added

- Version display on startup: `[runner] v.10.0 (rill v0.5.0)`

### Changed

- Interleaved agent output uses colored disc markers instead of letter labels
- Removed tree characters (`│`, `└─`) from agent output for cleaner display
- Upgraded `@rcrsr/rill` from `~0.4.4` to `~0.5.0`

## [0.9.1] — 2026-02-02

### Added

- Parallel task tracking with labels (A, B, C) for distinguishing concurrent subagent output
- Task labels displayed in magenta color for visibility
- Tool calls attributed to parent tasks with labeled prefixes (`│A`, `│B`)
- Task completions show labeled prefixes (`└─A`, `└─B`)

### Changed

- `FormatterState` now tracks multiple active tasks via `activeTasks` Map
- Task statistics tracked per-task via `taskStatsMap` and `taskStartTimes` Maps

## [0.9.0]

### Breaking

- Removed `ccr::error()` host function; use Rill's native `error` statement instead

### Changed

- Upgraded `@rcrsr/rill` from `~0.2.3` to `~0.4.4`
- Documentation examples updated to use Rill dispatch for result handling

## [0.8.1]

### Changed

- Upgraded all dependencies to latest versions
- Upgraded `@rcrsr/rill` from `0.2.0` to `~0.2.3`
- Fixed Rill lint warnings in example scripts (continuation indentation, do-while pattern, brace spacing)

## [0.8.0]

### Breaking

- `ccr::get_result()` returns empty dict `{}` instead of `null` when no result found
- Renamed `ccr::read_frontmatter()` to `ccr::get_frontmatter()` (removed `defaults` parameter)
- Rill heredoc syntax (`<<EOF...EOF`) removed; use triple-quote strings (`"""..."""`)
- Upgraded `@rcrsr/rill` from `^0.1.0` to `^0.2.0`
- Removed example `simple-capture.rill`

### Added

- `skill` subcommand: run skills from `.claude/skills/<name>/SKILL.md`
- `ccr::has_result(text)` host function to check for `<ccr:result>` tags
- `ccr::has_frontmatter(path)` host function to check file frontmatter existence
- `loadSkillTemplate()` in `src/templates/command.ts` for skill file loading
- New examples: `fact-pipeline.rill`, `iterative-review.rill`

### Changed

- Rill parse errors now include file path in location (e.g., `at script.rill:5:3`)
- Rill script source passed as full content; Rill parser handles frontmatter natively
- `ccr::command()` host function delegates argument formatting to `loadCommandTemplate()`
- Answer and Claude message output no longer truncated (removed `TRUNCATE_ANSWER`, `TRUNCATE_TERMINAL_LINE`)
- Rill `log()` output collapses newlines to spaces
- Step preview in log events collapses newlines to spaces
- Upgraded `vitest` and `@vitest/coverage-v8` from `^2.0.0` to `^4.0.18`
- Result XML patterns extracted to constants in `src/utils/constants.ts`

### Fixed

- Rill parse errors now caught inside `try/catch`; return `{ success: false }` instead of throwing
- Rill error messages use `error.toString()` instead of `error.message` for full context

## [0.7.1]

### Added

- Test coverage for Rill integration (35 tests across `context.test.ts` and `runner.test.ts`)

### Changed

- README updated to highlight Rill scripting features (variables, conditionals, loops, functions)
- Added host functions reference table to README

## [0.7.0]

### Added

- Rich scripting support via rill (https://github.com/rcrsr/rill)
- XML result protocol with application-defined results via `<ccr:result type="..." />` elements
- `ccr::get_result(text)` function to extract result attributes from Claude output
- `ccr::file_exists(path)` function to check file existence

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
