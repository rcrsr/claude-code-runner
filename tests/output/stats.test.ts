import { describe, expect, it } from 'vitest';

import {
  createFormatterState,
  getActiveElapsedMs,
} from '../../src/output/formatter.js';
import { createRunStats, formatStatsSummary } from '../../src/output/stats.js';

describe('formatStatsSummary', () => {
  it('shows a single duration when no active time is given', () => {
    const stats = createRunStats();
    stats.messageCount = 14;

    const summary = formatStatsSummary(stats, 33_000);

    expect(summary).toContain('33.0s | 14 msgs');
    expect(summary).not.toContain('active');
  });

  it('shows a single duration when active time matches wall clock', () => {
    const stats = createRunStats();
    stats.messageCount = 14;

    const summary = formatStatsSummary(stats, 33_000, 32_800);

    expect(summary).toContain('33.0s | 14 msgs');
    expect(summary).not.toContain('active');
  });

  it('shows active and wall durations when a resumed run has dead time', () => {
    const stats = createRunStats();
    stats.messageCount = 2142;

    // 18h 38m 57s wall clock, but only 2h 10m of active runtime
    const wallMs = (18 * 3600 + 38 * 60 + 57) * 1000;
    const activeMs = (2 * 3600 + 10 * 60) * 1000;
    const summary = formatStatsSummary(stats, wallMs, activeMs);

    expect(summary).toContain(
      '2h 10m 0s active / 18h 38m 57s wall | 2142 msgs'
    );
  });
});

describe('getActiveElapsedMs', () => {
  it('returns accumulated time plus the delta since the last tick', () => {
    const state = createFormatterState();
    state.elapsedMs = 5_000;
    state.lastTickTime = 100_000;

    expect(getActiveElapsedMs(state, 103_000)).toBe(8_000);
  });

  it('returns accumulated time alone when the clock never started', () => {
    const state = createFormatterState();
    state.elapsedMs = 5_000;
    state.lastTickTime = null;

    expect(getActiveElapsedMs(state, 103_000)).toBe(5_000);
  });
});
