# Claude Code Runner

Deterministic, scripted, unattended Claude Code execution.

## Why Use This?

- **Run unattended** — Execute Claude commands in CI/CD pipelines and automation scripts
- **Script multiple commands** — Chain prompts together in a single run
- **Control execution** — Claude signals when to stop, continue, or escalate to a human
- **Full visibility** — Watch tool calls stream in real-time
- **Complete logs** — Every session captured for debugging and review

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

Claude can output signals to control execution:

| Signal                   | Effect                           |
| ------------------------ | -------------------------------- |
| `:::RUNNER::DONE:::`     | Exit successfully                |
| `:::RUNNER::CONTINUE:::` | Continue to next iteration       |
| `:::RUNNER::BLOCKED:::`  | Exit with error (awaiting human) |
| `:::RUNNER::ERROR:::`    | Exit with error                  |

## Development

```bash
npm run check    # Run all checks (typecheck, lint, format, test)
npm run build    # Build the project
npm test         # Run tests
```

## License

MIT
