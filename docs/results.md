# Results

Results let Claude communicate control flow decisions back to your scripts.

## XML Result Protocol

Scripts instruct Claude to emit structured results using XML. The runner does not interpret result types—your script decides how to respond.

### Result Format

```xml
<ccr:result type="typename" attr1="value1" />
<ccr:result type="typename" attr1="value1">content here</ccr:result>
```

### Common Result Types

| Type | Purpose | Common Attributes |
|------|---------|-------------------|
| `repeat` | Run step again | `max`, `delay` |
| `done` | Explicit completion | `summary` |
| `blocked` | Cannot proceed | `reason` |
| `error` | Fatal failure | content = message |

Result types are application-defined. Use any types that make sense for your workflow.

## Extracting Results

Use `ccr::get_result(text)` to extract results from Claude's output:

```rill
ccr::prompt("Fix issues. Output <ccr:result type='repeat'/> if more remain.") :> $output
ccr::get_result($output) :> $result
```

### Return Value

Returns a dict with all attributes plus a `content` key, or empty string if no result found.

For `<ccr:result type="blocked" reason="auth">Need API key</ccr:result>`:

```rill
[type: "blocked", reason: "auth", content: "Need API key"]
```

### Handling Results

```rill
ccr::get_result($output) :> $result

($result.?type) ? {
  ($result.type == "repeat") ? log("More work needed")
  ($result.type == "blocked") ? ccr::error($result.reason)
  ($result.type == "done") ? log("Completed: {$result.summary}")
}
```

## Workflow Patterns

### Self-Correcting Loop

Claude validates its own work and outputs when to retry:

```rill
ccr::prompt(<<EOF
Fix all lint errors in src/.

After fixing:
- Run the linter
- If errors remain, output <ccr:result type="repeat"/>
- If clean, output <ccr:result type="done"/>
EOF
) :> $output

ccr::get_result($output) :> $result
# Handle $result.type == "repeat" by re-running or looping
```

### Checklist-Based Execution

Claude works through a task list, outputting after each item:

**PLAN.md:**

```markdown
- [ ] Create user types
- [ ] Implement session handling
- [ ] Add JWT signing
- [ ] Write tests
```

**Script:**

```rill
ccr::prompt(<<EOF
Read PLAN.md. Find the first unchecked item (- [ ]).

1. Implement that item
2. Mark it done by changing `- [ ]` to `- [x]`
3. If unchecked items remain, output <ccr:result type="repeat"/>
4. If all done, output <ccr:result type="done"/>
5. If stuck, output <ccr:result type="blocked" reason="..."/>
EOF
) :> $output
```

### Multi-Phase Pipeline

Different phases with different result handling:

```rill
# Phase 1: Analysis (no repeat expected)
ccr::prompt("Analyze codebase for issues") :> $issues

# Phase 2: Fixes (may repeat)
ccr::prompt(<<EOF
Fix one issue from this list:
{$issues}

Output <ccr:result type="repeat"/> if more issues remain.
EOF
) :> $output

ccr::get_result($output) :> $result
($result.type == "repeat") ? log("More issues to fix")

# Phase 3: Verification
ccr::prompt("Run tests to verify fixes")
```

### Blocked Escalation

Claude outputs when human intervention is needed:

```rill
ccr::prompt(<<EOF
Deploy to production.

If deployment succeeds, output <ccr:result type="done"/>.
If blocked by permissions, output <ccr:result type="blocked" reason="permissions"/>.
If blocked by other issues, output <ccr:result type="blocked" reason="...">Details here</ccr:result>.
EOF
) :> $output

ccr::get_result($output) :> $result

($result.type == "blocked")
  ? ccr::error("Blocked: {$result.reason} - {$result.content}")
```

## Prompt Engineering Tips

1. **Be explicit about result format**: Show the exact XML Claude should output
2. **Define all branches**: Tell Claude what to output in success, failure, and edge cases
3. **Include examples**: Show sample results in your prompts
4. **One result per response**: Ask Claude to output only one result per step

### Good Prompt Example

```
Fix the failing test in src/auth.test.ts.

After attempting the fix:
- If tests pass: output <ccr:result type="done"/>
- If tests still fail but you can fix them: output <ccr:result type="repeat"/>
- If you cannot fix them: output <ccr:result type="blocked" reason="cannot-fix">Explanation</ccr:result>

Output exactly one result at the end of your response.
```
