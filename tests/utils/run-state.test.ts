import * as fs from 'fs';

import { afterEach, describe, expect, it } from 'vitest';

import type { PersistedRunState } from '../../src/utils/run-state.js';
import {
  clearRunState,
  generateStableId,
  getStateFilePath,
  isPersistedRunState,
  loadRunState,
  saveRunState,
} from '../../src/utils/run-state.js';

const DEAD_PID = 999999;

function makeState(pid: number): PersistedRunState {
  return {
    version: 1,
    pid,
    startedAt: '2026-03-01T00:00:00.000Z',
    currentStep: 2,
    elapsedMs: 0,
    runStats: {
      messageCount: 5,
      tokens: { prompt: 100, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 200 },
      toolsUsed: ['Bash', 'Read'],
      toolUseCount: 3,
      outputChars: 512,
    },
  };
}

describe('generateStableId', () => {
  it('returns the same ID for the same cwd and args', () => {
    const id1 = generateStableId('/home/user/project', ['prompt', 'hello']);
    const id2 = generateStableId('/home/user/project', ['prompt', 'hello']);
    expect(id1).toBe(id2);
  });

  it('returns a different ID when args differ', () => {
    const id1 = generateStableId('/home/user/project', ['prompt', 'hello']);
    const id2 = generateStableId('/home/user/project', ['prompt', 'world']);
    expect(id1).not.toBe(id2);
  });

  it('returns a different ID when cwd differs', () => {
    const id1 = generateStableId('/home/user/project', ['prompt', 'hello']);
    const id2 = generateStableId('/home/user/other', ['prompt', 'hello']);
    expect(id1).not.toBe(id2);
  });

  it('returns exactly 16 characters', () => {
    const id = generateStableId('/home/user/project', ['prompt', 'hello']);
    expect(id).toHaveLength(16);
  });

  it('contains only lowercase hex characters [0-9a-f]', () => {
    const id = generateStableId('/home/user/project', ['prompt', 'hello']);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('saveRunState + loadRunState', () => {
  const stableId = generateStableId('/tmp/ccr-test-roundtrip', ['test']);

  afterEach(() => {
    clearRunState(stableId);
  });

  it('round-trips all state fields when pid is dead', () => {
    const state = makeState(DEAD_PID);
    saveRunState(stableId, state);

    const loaded = loadRunState(stableId);

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(1);
    expect(loaded?.pid).toBe(DEAD_PID);
    expect(loaded?.startedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(loaded?.currentStep).toBe(2);
    expect(loaded?.runStats.messageCount).toBe(5);
    expect(loaded?.runStats.tokens).toEqual({
      prompt: 100,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
      output: 200,
    });
    expect(loaded?.runStats.toolsUsed).toEqual(['Bash', 'Read']);
    expect(loaded?.runStats.toolUseCount).toBe(3);
    expect(loaded?.runStats.outputChars).toBe(512);
  });

  it('returns null when the writing process is still alive (current pid)', () => {
    const state = makeState(process.pid);
    saveRunState(stableId, state);

    const loaded = loadRunState(stableId);

    expect(loaded).toBeNull();
  });
});

describe('loadRunState with dead PID (recovery scenario)', () => {
  const stableId = generateStableId('/tmp/ccr-test-recovery', ['recover']);

  afterEach(() => {
    clearRunState(stableId);
  });

  it('returns the state when the writing process is dead', () => {
    const state = makeState(DEAD_PID);
    saveRunState(stableId, state);

    const loaded = loadRunState(stableId);

    expect(loaded).not.toBeNull();
    expect(loaded?.pid).toBe(DEAD_PID);
  });
});

describe('loadRunState file not found', () => {
  it('returns null for a stableId with no file', () => {
    const missingId = generateStableId('/tmp/ccr-test-missing', ['no-file']);
    clearRunState(missingId);

    const loaded = loadRunState(missingId);

    expect(loaded).toBeNull();
  });
});

describe('clearRunState', () => {
  const stableId = generateStableId('/tmp/ccr-test-clear', ['clear']);

  afterEach(() => {
    clearRunState(stableId);
  });

  it('removes the state file after writing', () => {
    const state = makeState(DEAD_PID);
    saveRunState(stableId, state);

    clearRunState(stableId);

    const filePath = getStateFilePath(stableId);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('does not throw when the file does not exist', () => {
    expect(() => {
      clearRunState(stableId);
    }).not.toThrow();
  });
});

describe('isPersistedRunState', () => {
  it('accepts a complete state', () => {
    expect(isPersistedRunState(makeState(DEAD_PID))).toBe(true);
  });

  it('rejects a state without runStats', () => {
    const { runStats: _runStats, ...partial } = makeState(DEAD_PID);
    expect(isPersistedRunState(partial)).toBe(false);
  });

  it('rejects old-format token counts', () => {
    const state = makeState(DEAD_PID);
    const old = { ...state, runStats: { ...state.runStats, tokens: { input: 1, output: 2 } } };
    expect(isPersistedRunState(old)).toBe(false);
  });

  it('rejects non-string toolsUsed entries', () => {
    const state = makeState(DEAD_PID);
    const bad = { ...state, runStats: { ...state.runStats, toolsUsed: [1] } };
    expect(isPersistedRunState(bad)).toBe(false);
  });

  it('rejects a missing startedAt', () => {
    const { startedAt: _startedAt, ...partial } = makeState(DEAD_PID);
    expect(isPersistedRunState(partial)).toBe(false);
  });
});

describe('loadRunState with a partial file', () => {
  const stableId = generateStableId('/tmp/ccr-test-partial', ['partial']);

  afterEach(() => {
    clearRunState(stableId);
  });

  it('returns null when runStats is missing', () => {
    fs.writeFileSync(
      getStateFilePath(stableId),
      JSON.stringify({ version: 1, pid: DEAD_PID, elapsedMs: 0 })
    );

    expect(loadRunState(stableId)).toBeNull();
  });
});
