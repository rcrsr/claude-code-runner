# Release Notes

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
- Added iteration tracking: `Running step [1]: command args...`
- Added elapsed time format for run summaries: `Run completed [3] steps in 00:00:41`

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
