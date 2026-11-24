# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@README.md

## Commands

```bash
npm run check           # Full validation: check:types + check:lint + check:format + check:deps + test
npm test                # Run all tests
npm run build           # Compile TypeScript
npm run fix:lint        # oxlint --fix
npm run fix:format      # oxfmt
```

## Tooling

TypeScript 7, oxlint with type-aware rules via oxlint-tsgolint (`.oxlintrc.json`), oxfmt (`.oxfmtrc.json`, sorts imports), knip (`knip.json`), Vitest, and lefthook (`lefthook.yml`; `npm install` wires the hooks). There is no ESLint or Prettier. No rule is set to `warn`; every finding fails `npm run check`.

`tsconfig.json` typechecks `src/` and `tests/` with `noEmit`. `npm run build` uses `tsconfig.build.json`, which emits `src/` only.

This repo borrows the TypeScript tooling from `APP-MONOREPO-STANDARDS.md`. As a single-package npm CLI it is out of that standard's scope. Deliberate deviations:

- APP-SQ-4: `tsconfig.json` keeps `module`/`moduleResolution` `NodeNext`, not `bundler`, because `tsc` emits the published Node ESM package directly.
- APP-SQ-8: sherif does not apply (one `package.json`).
- APP-TS-2: one Vitest project, so no `test.projects`.
- Not adopted: Nx, pnpm, mise, Makefile (monorepo layers L0–L2).

## Architecture

**CLI modes**: `prompt` (single execution), `command` (templates from `.claude/commands/`), `skill` (slash command `/<name>`), `script` (Rill workflows), `docs` (print rill/CCR reference)

**Rill runner** (`src/rill/runner.ts`): Executes `.rill` scripts using the Rill interpreter with CCR host functions.

**Host functions** (provided to Rill via `ccr::` namespace):

- `ccr::prompt(text, model?, timeout?)` → Execute Claude prompt
- `ccr::command(name, args?, timeout?)` → Run command template (args is list)
- `ccr::skill(name, args?, timeout?)` → Run slash command (args is list)
- `ccr::state(text)` → Set the script status line text
- `ccr::get_result(text)` → Extract the last XML result from output
- `ccr::has_result(text)` → Check if text contains ccr:result
- `ccr::file_exists(path)` → Check file existence
- `ccr::get_frontmatter(path)` → Parse YAML frontmatter
- `ccr::has_frontmatter(path)` → Check if file has frontmatter

**Script variables**: `$ARGS` (positional args list, `$ARGS[0]`…), `$ENV` (env vars), `$name` (named `args` frontmatter), `$varname` (captures via `=> $varname`). Note: `$1`/`$2`/`$ARGUMENTS` are `.claude/commands/` and skill template variables, not valid in `.rill` scripts.

**Constants**: All magic numbers live in `src/utils/constants.ts`

## Code Conventions

- **Barrel exports**: Each module directory has `index.ts` re-exporting public APIs
- **Factory functions over classes**: Use `create*` functions (e.g., `createLogger()`)
- **`as const` over enums**: Use const objects with derived types
- **Type guards with unions**: Place `is*` type guards next to discriminated union definitions
- **No global state**: Pass state objects through function calls (`FormatterState`, `RunnerContext`)

## Releasing

Follow `.github/release-sop.md`, or run `/conduct:cut-release <version>`, which reads it. `main` is protected, so releases land through a PR; the `v*` tag push then triggers npm publish and GitHub release creation.

## Testing

- Mock factories in `tests/helpers/mocks.ts` with optional `overrides` parameter
- Integration tests mock PTY via `vi.mock('../../src/process/pty.js')`
