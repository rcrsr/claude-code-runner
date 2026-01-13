# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

## Commands

```bash
npm run check           # Full validation: typecheck + lint + format + test
npm test                # Run all tests
npm run build           # Compile TypeScript
```

## Architecture

**CLI modes**: `prompt` (single execution), `command` (templates from `.claude/commands/`), `script` (multi-step workflows)

**Core loop** (`src/core/runner.ts`): `runWithSignals()` spawns Claude via PTY, parses stream-json output, and handles iteration signals (max 10 iterations).

**Runner signals** Claude outputs to control iteration:

- `:::RUNNER::REPEAT_STEP:::` → Run step again
- `:::RUNNER::BLOCKED:::` → Exit with error (awaiting human)
- `:::RUNNER::ERROR:::` → Exit with error

**Script variables**: `$1`, `$2` (args), `$ARGUMENTS` (all args), `$_` (last result), `$varname` (captures via `-> $varname`)

**Constants**: All magic numbers live in `src/utils/constants.ts`

## Code Conventions

- **Barrel exports**: Each module directory has `index.ts` re-exporting public APIs
- **Factory functions over classes**: Use `create*` functions (e.g., `createLogger()`, `createVariableStore()`)
- **`as const` over enums**: Use const objects with derived types (see `RUNNER_SIGNALS` in `src/types/runner.ts`)
- **Type guards with unions**: Place `is*` type guards next to discriminated union definitions
- **No global state**: Pass state objects through function calls (`FormatterState`, `RunnerContext`)

## Testing

- Mock factories in `tests/helpers/mocks.ts` with optional `overrides` parameter
- Integration tests mock PTY via `vi.mock('../../src/process/pty.js')`
