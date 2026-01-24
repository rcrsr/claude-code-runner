# Examples

Practical workflow patterns for Claude Code Runner.

## Basic Patterns

### Variable Capture

Capture output and reference it in subsequent steps:

```rill
---
description: Basic variable capture
---

# Capture output to named variable
ccr::prompt("Name three programming languages") :> $languages

# Reference named variable
ccr::prompt("Which of these is best for beginners: {$languages}")

# Chain another prompt
ccr::prompt("Create a hello world example in one of: {$languages}")
```

### Command Template

Reusable prompt stored in `.claude/commands/review-code.md`:

```markdown
---
description: Review code for issues
argument-hint: <file> [severity]
model: sonnet
---

Review the code in $1 for:
- Security vulnerabilities
- Performance issues
- Code style violations

Severity level: $2 (default: medium)

Output findings as a numbered list.
```

Run with:

```bash
claude-code-runner command review-code src/auth.ts high
```

## Code Review Workflow

Multi-step analysis with heredocs:

```rill
---
description: Code review workflow
args: path: string
---

# Analyze the code
ccr::prompt("Review the code in {$path} for bugs and issues") :> $issues

# Get improvement suggestions based on issues found
ccr::prompt(<<EOF
Based on these issues:
{$issues}

Suggest specific fixes with code examples.
EOF
) :> $fixes

# Summarize for the developer
ccr::prompt(<<EOF
Create a brief summary of the review:

Issues: {$issues}

Fixes: {$fixes}
EOF
)
```

## Test-and-Fix Loop

Command template that signals for retry:

`.claude/commands/fix-tests.md`:

```markdown
---
description: Fix failing tests
argument-hint: <directory>
---

Run the test suite for $1.

- If tests pass: output <ccr:result type="done"/>
- If tests fail and fixable: fix them, output <ccr:result type="repeat"/>
- If stuck: output <ccr:result type="blocked" reason="...">explanation</ccr:result>
```

Script using the command:

```rill
ccr::command("fix-tests", ["src/"]) :> $result
ccr::get_result($result) :> $result

($result.?type) ? {
  ($result.type == "repeat") ? log("More fixes needed")
  ($result.type == "blocked") ? ccr::error($result.reason)
  ($result.type == "done") ? log("All tests passing")
}
```

## Checklist-Driven Implementation

Work through a task list using signals:

**PLAN.md:**

```markdown
# Feature: User Authentication

- [ ] Create `src/auth/types.ts` with User and Session interfaces
- [ ] Implement `src/auth/session.ts` with createSession and validateSession
- [ ] Add JWT signing in `src/auth/jwt.ts`
- [ ] Write tests in `src/auth/__tests__/session.test.ts`
- [ ] Update `src/index.ts` to export auth module
```

**Command template** `.claude/commands/work-plan.md`:

```markdown
---
description: Work through a plan file
argument-hint: <plan-file>
---

Read $1 and find the first unchecked item (- [ ]).

1. Implement that single item
2. Mark it complete by changing `- [ ]` to `- [x]`
3. Check if any unchecked items remain:
   - If YES: output <ccr:result type="repeat"/>
   - If NO: output <ccr:result type="done"/>

If blocked, output <ccr:result type="blocked" reason="...">what you need</ccr:result>
```

**Script:**

```rill
ccr::command("work-plan", ["PLAN.md"]) :> $result
ccr::get_result($result) :> $result

# Each invocation: find next item -> implement -> mark done -> signal
# The document becomes persistent state across runs
```

## Feature Development Pipeline

End-to-end workflow for user-facing features:

```rill
---
args: initiative: string
---

# Step 1: Create spec from requirements
ccr::command("create-spec", [$initiative])

# Step 2: Review spec
ccr::command("review-spec", [$initiative]) :> $spec_review

# Step 3: Improve spec if needed
ccr::command("improve-spec", [$initiative, $spec_review])

# Step 4: Create implementation plan
ccr::command("create-plan", [$initiative])

# Step 5: Review plan
ccr::command("review-plan", [$initiative]) :> $plan_review

# Step 6: Improve plan if needed
ccr::command("improve-plan", [$initiative, $plan_review])

# Step 7: Implement (may signal repeat for multiple phases)
ccr::command("implement-plan", [$initiative])

# Step 8: Review implementation
ccr::command("review-implementation", [$initiative])

# Step 9: Create retrospective
ccr::command("review-implementation-notes", [$initiative])

ccr::prompt("Pipeline complete for {$initiative}")
```

## Lint Fix Loop

Self-correcting lint cleanup:

```bash
claude-code-runner prompt "Fix all lint errors in src/. Run the linter after each fix. Output <ccr:result type='repeat'/> if errors remain, <ccr:result type='done'/> if clean."
```

Or as a script:

```rill
---
description: Fix lint errors iteratively
args: path: string
---

ccr::prompt(<<EOF
Fix lint errors in {$path}.

1. Run the linter
2. Fix one category of errors
3. Run linter again to verify

If errors remain: output <ccr:result type="repeat"/>
If clean: output <ccr:result type="done"/>
EOF
) :> $result

ccr::get_result($result) :> $result

($result.type == "repeat") ? log("More lint errors to fix")
```

## Conditional Execution

Check file existence before processing:

```rill
ccr::file_exists("tsconfig.json")
  ? ccr::prompt("This is a TypeScript project. Analyze the config.")

ccr::file_exists("package.json")
  ? ccr::prompt("Check dependencies for security issues")

(!ccr::file_exists($1))
  ? ccr::error("File not found: {$1}")
```

## Reading Metadata

Extract frontmatter from plan files:

```rill
ccr::read_frontmatter("PLAN.md") :> $meta

($meta.status == "complete")
  ? log("Plan already complete")
  ! ccr::command("work-plan", ["PLAN.md"])
```

## Execution Flow Example

Real execution log showing signal-driven iteration (incrementing 0 to 3):

```
21:20:16.849 [RUNNER] Running step 1: increment /tmp/counter.txt 3
21:20:20.684 [TOOL] Read /tmp/counter.txt
21:20:21.825 [TOOL] Write /tmp/counter.txt
21:20:23.552 [CLAUDE] Value is 1, less than 3: <ccr:result type="repeat"/>
21:20:23.922 [RUNNER] Claude requested repeat

21:20:25.923 [RUNNER] Running step 2: increment /tmp/counter.txt 3
21:20:29.986 [TOOL] Read /tmp/counter.txt
21:20:31.072 [TOOL] Write /tmp/counter.txt
21:20:32.612 [CLAUDE] Value is 2, less than 3: <ccr:result type="repeat"/>

21:20:35.010 [RUNNER] Running step 3: increment /tmp/counter.txt 3
21:20:38.960 [TOOL] Read /tmp/counter.txt
21:20:40.095 [TOOL] Write /tmp/counter.txt
21:20:40.721 [CLAUDE] Value is 3, not less than 3: <ccr:result type="done"/>
21:20:41.170 [RUNNER] Completed run (3 steps) in 24.0s
```

Each step runs as an isolated Claude session. The file acts as shared state between sessions.
