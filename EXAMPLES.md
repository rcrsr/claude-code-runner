# Usage Example: Incrementing a Counter

How do you execute and control multi-step Claude Code workflows deterministically and without shared context? In Claude Code, you can't easily `/clear` inbetween steps without actually typing `/clear` followed by whatever the new step should be. Consider a simple example: incrementing a number until it reaches a target. Who orchestrates the steps, and who decides when to stop?

When you need iterative or multi-step workflows, claude-code-runner orchestrates multiple isolated Claude sessions rather than letting a single session run indefinitely. Each session reads state from external storage, performs one unit of work, and signals whether another round is needed. The runner stays in control, counting steps and enforcing delays, while Claude focuses on the task at hand.

This document walks through a real execution log—a simple counter incrementing from 0 to 3—to show how the pieces fit together. By the end, you'll understand exactly how stateless sessions combine with file-based persistence to create the illusion of continuous execution.

## Command Definition

The `increment` command in `.claude/commands/increment.md`:

```markdown
---
description: Increment a number in a file until a limit is reached
---

Read the file $1 and increment the number inside it by 1. Write the new value back to the file.

After writing, check if the value is less than $2. If it is, output :::RUNNER::REPEAT_STEP::: to continue incrementing.

Only output plain numbers in the file, no other text.
```

## Command Executed

```
claude-code-runner -m haiku command increment /tmp/counter.txt 3
```

Equivalent to `/increment /tmp/counter.txt 3` in Claude Code. Arguments: `$1` = `/tmp/counter.txt`, `$2` = `3`.

## Initial State

Before execution, `/tmp/counter.txt` contains:

```
0
```

## Execution Log

Every line in the log starts with a timestamp and a prefix in brackets. The prefix tells you who is "speaking": `[RUNNER]` is the orchestrator, `[CLAUDE]` is the model's reasoning, and `[TOOL]` is a tool being executed.

### Initialization

```
21:20:16.848 [RUNNER] Mode: command | Verbosity: normal
21:20:16.849 [RUNNER] Model: haiku
21:20:16.849 [RUNNER] Log: logs/haiku-2026-01-12T05-20-16.log
```

The runner starts by announcing its configuration. It's running in command mode using the haiku model, and will write detailed logs to a file for later inspection.

### Step 1: 0 → 1

```
21:20:16.849 [RUNNER] Running step 1: increment /tmp/counter.txt 3
```

The runner spawns a fresh Claude session with the command prompt. Claude has no memory of previous runs—it only knows what the command definition tells it.

```
21:20:20.496 [CLAUDE] I'll read the file, increment the number, write it back, and check if we need to continue.
21:20:20.684 [TOOL] Read /tmp/counter.txt
21:20:21.565 [CLAUDE] The file contains `0`. I'll increment it to `1` and write it back.
21:20:21.825 [TOOL] Write /tmp/counter.txt
```

About 3.6 seconds after the step started, Claude responds with its plan. It reads the file, finds `0`, and writes `1`. Notice how Claude narrates its reasoning before each tool call—this transparency helps you understand what the model decided to do and why.

```
21:20:23.552 [CLAUDE] The value is now `1`, which is less than 3, so I'll output the repeat command: :::RUNNER::REPEAT_STEP:::
21:20:23.600 [RUNNER] Completed step 1 in 4.0s
21:20:23.922 [RUNNER] Claude requested to repeat the step
```

Here's where things get interesting. Claude checks the condition from the command: is 1 less than 3? Yes, so it outputs the magic string `:::RUNNER::REPEAT_STEP:::`. This isn't just text—it's a signal that the runner is watching for. The runner detects the signal and prepares to run another step.

### Step 2: 1 → 2

```
21:20:25.923 [RUNNER] Running step 2: increment /tmp/counter.txt 3
```

Notice the 2-second gap between `21:20:23.922` and `21:20:25.923`. This deliberate delay prevents runaway loops and gives the system time to stabilize.

```
21:20:29.622 [CLAUDE] I'll read the file, increment the number, and write it back.
21:20:29.986 [TOOL] Read /tmp/counter.txt
21:20:30.819 [CLAUDE] The file contains "1". I'll increment it to 2 and write it back.
21:20:31.072 [TOOL] Write /tmp/counter.txt
21:20:32.612 [CLAUDE] The value is now 2, which is less than 3. :::RUNNER::REPEAT_STEP:::
21:20:32.653 [RUNNER] Completed step 2 in 3.9s
21:20:33.009 [RUNNER] Claude requested to repeat the step
```

A new Claude session starts, completely unaware that step 1 ever happened. It reads the file, finds `1`, writes `2`, checks the condition (2 < 3), and outputs the repeat signal again. The file acts as shared memory between sessions that otherwise have no connection to each other.

### Step 3: 2 → 3

```
21:20:35.010 [RUNNER] Running step 3: increment /tmp/counter.txt 3
21:20:38.770 [CLAUDE] I'll read the file, increment the number, and check if we need to repeat.
21:20:38.960 [TOOL] Read /tmp/counter.txt
21:20:39.847 [CLAUDE] The current value is 2. I'll increment it to 3 and write it back.
21:20:40.095 [TOOL] Write /tmp/counter.txt
```

Same pattern: read, increment, write.

```
21:20:40.721 [CLAUDE] The value is now 3, which is not less than 3, so we stop here.
21:20:40.784 [RUNNER] Completed step 3 in 2.8s
21:20:41.170 [RUNNER] Completed run (3 steps) in 24.0s
```

This is where the loop breaks. Claude checks: is 3 less than 3? No. So it simply says "we stop here" without outputting any signal. The runner sees no `:::RUNNER::` pattern in the response and concludes the run.

## Execution Flow

| Step | Input | Output | Duration | Signal              |
| ---- | ----- | ------ | -------- | ------------------- |
| 1    | 0     | 1      | 4.0s     | `REPEAT_STEP` (1<3) |
| 2    | 1     | 2      | 3.9s     | `REPEAT_STEP` (2<3) |
| 3    | 2     | 3      | 2.8s     | None (3≥3)          |

**Total:** 3 steps in 24s

## Key Behaviors

- **Stateless execution:** Each step runs as an independent Claude session with no memory of previous steps
- **Signal-driven loops:** `:::RUNNER::REPEAT_STEP:::` triggers the runner to re-execute the same command
- **File-based state:** Persistence between steps requires external storage (files, databases)
