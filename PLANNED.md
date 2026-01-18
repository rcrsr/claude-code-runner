# Planned Features

Future enhancements for claude-code-runner host functions.

## LLM Evaluation

**Problem:** Conditional logic requires exact string matching. Claude can make nuanced judgments about output quality.

**Proposed syntax:**

```rill
prompt("Write unit tests for auth module") -> $tests

$tests -> evaluate("Do these tests cover edge cases?") -> $quality

$quality.pass -> ? {
  prompt("Tests approved. Run them.")
} : {
  prompt("Improve tests. Issues:\n$quality.feedback")
}
```

**Result structure:**

```json
{
  "pass": true,
  "feedback": "Tests cover happy path and error cases but miss rate limiting edge case.",
  "confidence": 0.85
}
```

**Options:**

| Option                                   | Description                       |
| ---------------------------------------- | --------------------------------- |
| `evaluate("criteria")`                   | Default threshold: 0.7 confidence |
| `evaluate("criteria", {threshold: 0.9})` | Custom confidence threshold       |
| `evaluate("criteria", {model: "haiku"})` | Use faster model for eval         |

**Use cases:**

- Validate generated code meets requirements
- Check documentation completeness
- Assess test coverage quality
- Gate deployments on quality criteria

**Open questions:**

1. Same model as main prompt or dedicated evaluator?
2. How to handle evaluation timeouts?
