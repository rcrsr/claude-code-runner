# Getting Started

Claude Code Runner executes Claude Code workflows deterministically and unattended.

## Prerequisites

- Node.js 18 or later
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## Installation

```bash
npm install -g @rcrsr/claude-code-runner
```

## Your First Workflow

### Run a Single Prompt

```bash
claude-code-runner prompt "List all TypeScript files in this project"
```

### Run a Command Template

Create `.claude/commands/review-code.md`:

```markdown
Review the code in $1 for:
- Security vulnerabilities
- Performance issues
- Code style violations
```

Run it:

```bash
claude-code-runner command review-code src/auth.ts
```

### Run a Multi-Step Script

Create `workflow.rill`:

```rill
---
description: Analyze and improve code
---

ccr::prompt("Review src/ for bugs") :> $issues
ccr::prompt("Fix these issues: {$issues}")
```

Run it:

```bash
claude-code-runner script workflow.rill
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Prompt** | Single Claude execution with one prompt |
| **Command** | Reusable template stored in `.claude/commands/` |
| **Script** | Multi-step workflow chaining multiple prompts/commands |
| **Result** | XML message Claude outputs to control script flow |

## Next Steps

- [CLI Reference](cli-reference.md) - All commands and options
- [Rill Scripting](rill-scripting.md) - Write multi-step workflows
- [Results](results.md) - Control script execution flow
- [Examples](examples.md) - Real workflow patterns
