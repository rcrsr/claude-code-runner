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

**CLI modes**: `prompt` (single execution), `command` (templates from `.claude/commands/`), `script` (Rill workflows)

**Rill runner** (`src/rill/runner.ts`): Executes `.rill` scripts using the Rill interpreter with CCR host functions.

**Host functions** (provided to Rill via `ccr::` namespace):

- `ccr::prompt(text, model?)` → Execute Claude prompt
- `ccr::command(name, args?)` → Run command template (args is list)
- `ccr::skill(name, args?)` → Run slash command (args is list)
- `ccr::get_result(text)` → Extract XML result from output
- `ccr::file_exists(path)` → Check file existence
- `ccr::get_frontmatter(path)` → Parse YAML frontmatter
- `ccr::has_frontmatter(path)` → Check if file has frontmatter
- `ccr::has_result(text)` → Check if text contains ccr:result
- `ccr::error(message?)` → Stop with error

**Script variables**: `$1`, `$2` (args), `$ARGUMENTS` (all args), `$varname` (captures via `:> $varname`)

**Constants**: All magic numbers live in `src/utils/constants.ts`

## Code Conventions

- **Barrel exports**: Each module directory has `index.ts` re-exporting public APIs
- **Factory functions over classes**: Use `create*` functions (e.g., `createLogger()`)
- **`as const` over enums**: Use const objects with derived types
- **Type guards with unions**: Place `is*` type guards next to discriminated union definitions
- **No global state**: Pass state objects through function calls (`FormatterState`, `RunnerContext`)

## Testing

- Mock factories in `tests/helpers/mocks.ts` with optional `overrides` parameter
- Integration tests mock PTY via `vi.mock('../../src/process/pty.js')`
