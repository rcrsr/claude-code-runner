# Release Notes

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
