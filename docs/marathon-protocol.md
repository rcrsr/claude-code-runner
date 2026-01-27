# Marathon Protocol Specification

**Version:** 0.1.0 (Draft)
**Status:** Proposal

Marathon is a client-initiated WebSocket protocol for real-time activity capture and remote control of Claude Code Runner sessions. The client publishes its available message types and callable methods; servers discover and subscribe to these capabilities dynamically.

## Design Principles

1. **Client Authority** — The client defines what it can emit and what methods it exposes
2. **Dynamic Discovery** — Servers learn capabilities at runtime, not from static schemas
3. **Subscription Model** — Servers subscribe to activity types they care about
4. **RPC for Control** — Server invokes client-published methods with request/response semantics
5. **Extensible** — New activity types and methods require no protocol changes

---

## Connection Lifecycle

### Handshake

```
Client                                         Server
   │                                              │
   │  ──── WebSocket UPGRADE ──────────────────>  │
   │  <──── 101 Switching Protocols ────────────  │
   │                                              │
   │  ──── manifest ────────────────────────────> │
   │  <──── manifest_ack / error ───────────────  │
   │                                              │
   │  <──── subscribe ──────────────────────────  │
   │  ──── subscribe_ack ───────────────────────> │
   │                                              │
   │  ════ Session Established ═════════════════  │
```

---

## Manifest (Client → Server)

On connect, the client sends a **manifest** declaring its identity, published activity types, and callable methods.

```json
{
  "type": "manifest",
  "version": "0.1.0",
  "client": {
    "name": "claude-code-runner",
    "version": "1.0.0"
  },
  "runId": "a1b2c3d4",
  "auth": {
    "method": "token",
    "token": "<api-token>"
  },
  "activities": {
    "run.start": {
      "description": "Emitted when a run begins",
      "schema": {
        "mode": { "type": "string", "enum": ["prompt", "command", "skill", "script"] },
        "script": { "type": "string", "optional": true },
        "args": { "type": "array", "items": "string" },
        "config": { "type": "object" }
      }
    },
    "run.complete": {
      "description": "Emitted when a run finishes",
      "schema": {
        "exitCode": { "type": "number" },
        "duration": { "type": "number", "unit": "ms" },
        "stats": { "type": "object" }
      }
    },
    "step.start": {
      "description": "Emitted when a Rill script step begins",
      "schema": {
        "step": { "type": "number" },
        "prompt": { "type": "string" },
        "promptPreview": { "type": "string" }
      }
    },
    "step.complete": {
      "description": "Emitted when a step finishes",
      "schema": {
        "step": { "type": "number" },
        "exitCode": { "type": "number" },
        "duration": { "type": "number", "unit": "ms" },
        "outputLength": { "type": "number" },
        "stats": { "type": "object" }
      }
    },
    "tool.start": {
      "description": "Emitted when a tool invocation begins",
      "schema": {
        "step": { "type": "number" },
        "toolUseId": { "type": "string" },
        "tool": { "type": "string" },
        "input": { "type": "object" },
        "parallel": { "type": "boolean" },
        "parallelGroup": { "type": "string", "optional": true }
      }
    },
    "tool.complete": {
      "description": "Emitted when a tool invocation completes",
      "schema": {
        "step": { "type": "number" },
        "toolUseId": { "type": "string" },
        "tool": { "type": "string" },
        "duration": { "type": "number", "unit": "ms" },
        "result": { "type": "object" }
      }
    },
    "task.start": {
      "description": "Emitted when Claude spawns a sub-agent Task",
      "schema": {
        "step": { "type": "number" },
        "taskId": { "type": "string" },
        "description": { "type": "string" },
        "subagentType": { "type": "string" }
      }
    },
    "task.complete": {
      "description": "Emitted when a Task completes",
      "schema": {
        "step": { "type": "number" },
        "taskId": { "type": "string" },
        "duration": { "type": "number", "unit": "ms" },
        "stats": { "type": "object" }
      }
    },
    "claude.message": {
      "description": "Emitted for Claude assistant messages",
      "schema": {
        "step": { "type": "number" },
        "messageIndex": { "type": "number" },
        "content": { "type": "object" },
        "tokens": { "type": "object" }
      }
    },
    "output.text": {
      "description": "Emitted for Claude text output",
      "schema": {
        "step": { "type": "number" },
        "text": { "type": "string" },
        "final": { "type": "boolean" }
      }
    },
    "variable.set": {
      "description": "Emitted when a Rill variable is captured",
      "schema": {
        "step": { "type": "number" },
        "name": { "type": "string" },
        "valuePreview": { "type": "string" },
        "valueLength": { "type": "number" }
      }
    },
    "result.captured": {
      "description": "Emitted when a ccr:result is extracted",
      "schema": {
        "step": { "type": "number" },
        "result": { "type": "object" }
      }
    },
    "error": {
      "description": "Emitted on errors",
      "schema": {
        "step": { "type": "number", "optional": true },
        "code": { "type": "string" },
        "message": { "type": "string" },
        "fatal": { "type": "boolean" },
        "context": { "type": "object", "optional": true }
      }
    },
    "log": {
      "description": "Emitted for runner log messages",
      "schema": {
        "level": { "type": "string", "enum": ["debug", "info", "warn", "error"] },
        "message": { "type": "string" }
      }
    }
  },
  "methods": {
    "pause": {
      "description": "Pause execution at specified scope",
      "params": {
        "scope": { "type": "string", "enum": ["immediate", "tool", "step"], "default": "step" }
      },
      "returns": {
        "state": { "type": "string" }
      }
    },
    "resume": {
      "description": "Resume paused execution",
      "params": {},
      "returns": {
        "state": { "type": "string" }
      }
    },
    "abort": {
      "description": "Abort the current run",
      "params": {
        "reason": { "type": "string", "optional": true },
        "exitCode": { "type": "number", "default": 130 }
      },
      "returns": {
        "aborted": { "type": "boolean" }
      }
    },
    "skip": {
      "description": "Skip the current step (Rill scripts only)",
      "params": {
        "step": { "type": "number" },
        "skipValue": { "type": "any", "optional": true }
      },
      "returns": {
        "skipped": { "type": "boolean" }
      }
    },
    "inject": {
      "description": "Inject a value or override",
      "params": {
        "target": { "type": "string", "enum": ["variable", "env", "config"] },
        "name": { "type": "string" },
        "value": { "type": "any" }
      },
      "returns": {
        "injected": { "type": "boolean" }
      }
    },
    "getState": {
      "description": "Get current execution state",
      "params": {},
      "returns": {
        "state": { "type": "string" },
        "step": { "type": "number", "optional": true },
        "totalSteps": { "type": "number", "optional": true },
        "currentTool": { "type": "string", "optional": true },
        "paused": { "type": "boolean" },
        "variables": { "type": "object" },
        "stats": { "type": "object" }
      }
    },
    "getVariable": {
      "description": "Get a specific variable value",
      "params": {
        "name": { "type": "string" }
      },
      "returns": {
        "name": { "type": "string" },
        "value": { "type": "any" },
        "exists": { "type": "boolean" }
      }
    }
  },
  "config": {
    "heartbeatInterval": 30000,
    "bufferSize": 100,
    "redaction": {
      "enabled": false,
      "patterns": []
    }
  }
}
```

### Manifest Acknowledgment (Server → Client)

```json
{
  "type": "manifest_ack",
  "sessionId": "sess_abc123",
  "server": {
    "name": "marathon-server",
    "version": "1.0.0"
  },
  "accepted": true,
  "config": {
    "heartbeatInterval": 30000
  }
}
```

### Manifest Error (Server → Client)

```json
{
  "type": "error",
  "code": "AUTH_FAILED",
  "message": "Invalid authentication token",
  "fatal": true
}
```

---

## Subscriptions (Server → Client)

After receiving the manifest, the server subscribes to activity types it wants to receive.

### Subscribe Request (Server → Client)

```json
{
  "type": "subscribe",
  "requestId": "sub_001",
  "activities": ["run.start", "run.complete", "step.start", "step.complete", "tool.start", "tool.complete", "error"],
  "options": {
    "includeSchema": false,
    "batchInterval": 0
  }
}
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `includeSchema` | boolean | Include schema in each activity message |
| `batchInterval` | number | Batch activities over N ms (0 = no batching) |

### Subscribe Acknowledgment (Client → Server)

```json
{
  "type": "subscribe_ack",
  "requestId": "sub_001",
  "subscribed": ["run.start", "run.complete", "step.start", "step.complete", "tool.start", "tool.complete", "error"],
  "rejected": []
}
```

### Modify Subscription (Server → Client)

Servers can update subscriptions at any time:

```json
{
  "type": "subscribe",
  "requestId": "sub_002",
  "activities": ["*"],
  "options": {}
}
```

Use `"*"` to subscribe to all published activities.

### Unsubscribe (Server → Client)

```json
{
  "type": "unsubscribe",
  "requestId": "unsub_001",
  "activities": ["log"]
}
```

---

## Activity Messages (Client → Server)

Activities are only sent for subscribed types. All share a common envelope:

```json
{
  "type": "activity",
  "seq": 1,
  "ts": 1706380800000,
  "runId": "a1b2c3d4",
  "kind": "tool.start",
  "data": {
    "step": 1,
    "toolUseId": "tu_abc123",
    "tool": "Bash",
    "input": {
      "command": "npm test",
      "description": "Run test suite"
    },
    "parallel": false,
    "parallelGroup": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `seq` | number | Monotonically increasing sequence number |
| `ts` | number | Unix timestamp (milliseconds) |
| `runId` | string | Unique run identifier |
| `kind` | string | Activity type (from manifest) |
| `data` | object | Activity payload (matches schema) |

### Batched Activities

When `batchInterval > 0`, activities are batched:

```json
{
  "type": "activity_batch",
  "activities": [
    { "seq": 1, "ts": 1706380800000, "kind": "tool.start", "data": { ... } },
    { "seq": 2, "ts": 1706380800050, "kind": "tool.start", "data": { ... } },
    { "seq": 3, "ts": 1706380800100, "kind": "tool.complete", "data": { ... } }
  ]
}
```

---

## Method Invocation (Server → Client)

Servers invoke client methods using RPC-style messages.

### Method Call (Server → Client)

```json
{
  "type": "call",
  "requestId": "req_001",
  "method": "pause",
  "params": {
    "scope": "step"
  }
}
```

### Method Response (Client → Server)

**Success:**

```json
{
  "type": "call_result",
  "requestId": "req_001",
  "success": true,
  "result": {
    "state": "pausing"
  }
}
```

**Error:**

```json
{
  "type": "call_result",
  "requestId": "req_001",
  "success": false,
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot pause: not currently running"
  }
}
```

### Method Not Found

If the server calls an unpublished method:

```json
{
  "type": "call_result",
  "requestId": "req_002",
  "success": false,
  "error": {
    "code": "METHOD_NOT_FOUND",
    "message": "Method 'restart' is not published by this client"
  }
}
```

---

## Heartbeat

Client-initiated heartbeats maintain connection health.

### Heartbeat (Client → Server)

```json
{
  "type": "heartbeat",
  "ts": 1706380800000,
  "state": "running",
  "seq": 142
}
```

### Heartbeat Ack (Server → Client)

```json
{
  "type": "heartbeat_ack",
  "ts": 1706380800050
}
```

---

## Reconnection

On disconnect, the client buffers activities and attempts reconnection.

### Reconnect Manifest (Client → Server)

```json
{
  "type": "manifest",
  "version": "0.1.0",
  "client": { ... },
  "runId": "a1b2c3d4",
  "auth": { ... },
  "reconnect": {
    "previousSessionId": "sess_abc123",
    "lastAckedSeq": 142
  },
  "activities": { ... },
  "methods": { ... }
}
```

### Reconnect Acknowledgment (Server → Client)

```json
{
  "type": "manifest_ack",
  "sessionId": "sess_def456",
  "reconnected": true,
  "replayFrom": 143,
  "subscriptions": ["run.start", "run.complete", "step.start", "step.complete", "error"]
}
```

The server restores previous subscriptions. Client replays buffered activities starting from `replayFrom`.

---

## Client State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
    ┌───────┐   connect   ┌────────────┐   run.start   ┌─────────┐
    │ IDLE  │ ──────────> │ CONNECTED  │ ────────────> │ RUNNING │
    └───────┘             └────────────┘               └─────────┘
                               ▲                          │   │
                               │                   pause  │   │ complete/abort
                               │                     │    │   │
                               │                     ▼    │   │
                               │                  ┌────────┐  │
                               │                  │ PAUSED │  │
                               │                  └────────┘  │
                               │                     │        │
                               │              resume │        │
                               │                     │        │
                               └─────────────────────┴────────┘
                                       disconnect
```

**States:**

| State | Description |
|-------|-------------|
| `idle` | Not connected |
| `connected` | Connected, manifest sent, no active run |
| `running` | Executing a prompt/script |
| `paused` | Execution paused via `pause` method |

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Authentication failed |
| `VERSION_MISMATCH` | Protocol version incompatible |
| `INVALID_MESSAGE` | Malformed message |
| `METHOD_NOT_FOUND` | Called method not in manifest |
| `INVALID_PARAMS` | Method params don't match schema |
| `INVALID_STATE` | Method cannot execute in current state |
| `ACTIVITY_NOT_FOUND` | Subscribed to unknown activity type |
| `RATE_LIMITED` | Too many messages |
| `RECONNECT_EXPIRED` | Reconnection window expired |
| `INTERNAL_ERROR` | Internal error |

---

## Security Considerations

1. **Authentication** — All connections must authenticate via token in manifest
2. **TLS Required** — WebSocket connections must use `wss://`
3. **Method Authorization** — Servers may restrict which methods can be called
4. **Redaction** — Clients can redact sensitive data before sending

### Client-Side Redaction

Configured in manifest:

```json
{
  "config": {
    "redaction": {
      "enabled": true,
      "patterns": ["password", "token", "secret", "api_key"],
      "tools": {
        "Bash": { "redactEnv": true },
        "Write": { "redactPaths": ["*.env", "*.key", "*.pem"] }
      }
    }
  }
}
```

Redacted values appear as `"[REDACTED]"` in activity data.

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MARATHON_URL` | WebSocket server URL | — |
| `MARATHON_TOKEN` | Authentication token | — |
| `MARATHON_RECONNECT` | Enable auto-reconnect | `true` |
| `MARATHON_BUFFER_SIZE` | Activity buffer size | `100` |
| `MARATHON_HEARTBEAT` | Heartbeat interval (ms) | `30000` |

### CLI Flags

```bash
claude-code-runner --marathon wss://marathon.example.com \
                   --marathon-token <token> \
                   script workflow.rill
```

---

## Wire Format

All messages are JSON-encoded UTF-8 text frames.

**Message Size Limits:**

| Direction | Limit |
|-----------|-------|
| Client → Server | 1 MB |
| Server → Client | 64 KB |

**Compression:**

WebSocket `permessage-deflate` is recommended for high-volume connections.

---

## Example Session

```
Client                                           Server
   │                                                │
   │  ──── manifest { activities, methods } ─────>  │
   │  <──── manifest_ack { sessionId } ───────────  │
   │                                                │
   │  <──── subscribe { activities: ["*"] } ──────  │
   │  ──── subscribe_ack { subscribed: [...] } ──>  │
   │                                                │
   │  ──── activity { run.start } ────────────────> │
   │  ──── activity { step.start, step: 1 } ──────> │
   │  ──── activity { tool.start, Bash } ─────────> │
   │  ──── activity { tool.complete } ────────────> │
   │                                                │
   │  <──── call { method: "pause", scope: step }   │
   │  ──── call_result { state: "pausing" } ──────> │
   │                                                │
   │  ──── activity { step.complete, step: 1 } ──>  │
   │  ──── heartbeat { state: "paused" } ─────────> │
   │  <──── heartbeat_ack ────────────────────────  │
   │                                                │
   │  <──── call { method: "getState" } ──────────  │
   │  ──── call_result { step: 1, paused: true } ─> │
   │                                                │
   │  <──── call { method: "resume" } ────────────  │
   │  ──── call_result { state: "running" } ──────> │
   │                                                │
   │  ──── activity { step.start, step: 2 } ──────> │
   │  ...                                           │
   │  ──── activity { run.complete } ─────────────> │
   │                                                │
   │  ──── close ─────────────────────────────────> │
```

---

## Type Summary

### Client → Server Messages

| Type | Description |
|------|-------------|
| `manifest` | Publish activities and methods |
| `subscribe_ack` | Confirm subscription |
| `unsubscribe_ack` | Confirm unsubscription |
| `activity` | Emit subscribed activity |
| `activity_batch` | Emit batched activities |
| `call_result` | Respond to method call |
| `heartbeat` | Connection keepalive |

### Server → Client Messages

| Type | Description |
|------|-------------|
| `manifest_ack` | Accept manifest |
| `error` | Report error |
| `subscribe` | Subscribe to activities |
| `unsubscribe` | Unsubscribe from activities |
| `call` | Invoke client method |
| `heartbeat_ack` | Acknowledge heartbeat |

---

## Future Extensions

1. **Streaming Output** — Real-time text streaming during generation
2. **File Transfer** — Binary frames for file sync
3. **Multi-Client** — Multiple clients per session (collaborative)
4. **Activity Replay** — Server requests historical activities
5. **Method Versioning** — Version methods independently
6. **Pub/Sub Channels** — Named channels for activity routing

---

## Changelog

### 0.1.0 (Draft)

- Initial protocol specification
- Client-initiated manifest with published activities and methods
- Server subscription model
- RPC-style method invocation
- Reconnection with activity replay
