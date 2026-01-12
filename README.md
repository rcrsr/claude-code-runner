# Claude Code Runner

Execute Claude CLI with PTY handling, real-time tool visualization, and iterative execution support.

## Features

- **PTY Handling**: Proper terminal emulation for Claude CLI
- **Real-time Output**: See tool calls and responses as they happen
- **Parallel Tool Grouping**: Groups concurrent tool calls for cleaner output
- **Iteration Control**: Support for multi-iteration workflows via runner signals
- **Script Mode**: Execute multiple commands from a file
- **Verbosity Levels**: Quiet, normal, or verbose output

## Installation

```bash
npm install -g @rcrsr/claude-code-runner
```

## Usage

### Single Prompt

```bash
claude-code-runner "Tell me about this project"
```

### Command Template

Load a command from `.claude/commands/<name>.md`:

```bash
claude-code-runner command review-code src/index.ts
```

Templates support variable substitution (`$1`, `$2`, etc.).

### Script Mode

Run multiple commands from a file:

```bash
claude-code-runner --script tasks.txt
```

### Options

| Option      | Description                  |
| ----------- | ---------------------------- |
| `--quiet`   | Minimal output (errors only) |
| `--normal`  | Default output level         |
| `--verbose` | Full output with details     |
| `--no-log`  | Disable file logging         |

## Runner Signals

Claude can output signals to control iteration:

| Signal                   | Effect                           |
| ------------------------ | -------------------------------- |
| `:::RUNNER::DONE:::`     | Exit successfully                |
| `:::RUNNER::CONTINUE:::` | Continue to next iteration       |
| `:::RUNNER::BLOCKED:::`  | Exit with error (awaiting human) |
| `:::RUNNER::ERROR:::`    | Exit with error                  |

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Formatting
npm run format

# Run tests
npm test

# Run all checks
npm run check
```

## Project Structure

```
src/
├── index.ts          # Entry point
├── cli/              # Argument parsing
├── core/             # Runner logic with signal detection
├── output/           # Formatting and logging
├── parsers/          # Stream JSON and signal parsing
├── process/          # PTY process management
├── templates/        # Command template loading
└── types/            # TypeScript type definitions
```

## License

MIT
