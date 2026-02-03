import { describe, expect, it } from 'vitest';

import {
  UI_MAX_AGENTS,
  UI_MAX_DESCRIPTION_LENGTH,
  UI_MAX_TOOL_ARGS_LENGTH,
  UI_MAX_VISIBLE_LOG,
  UI_MAX_VISIBLE_TOOLS,
  UI_MIN_BOX_WIDTH,
  UI_MIN_TERMINAL_WIDTH,
  UI_RENDER_INTERVAL_MS,
  UI_SPINNER_INTERVAL_MS,
} from '../../src/utils/constants.js';

describe('UI constants', () => {
  it('exports UI_MAX_AGENTS with expected value', () => {
    expect(UI_MAX_AGENTS).toBe(10);
  });

  it('exports UI_MAX_VISIBLE_LOG with expected value', () => {
    expect(UI_MAX_VISIBLE_LOG).toBe(10);
  });

  it('exports UI_MAX_VISIBLE_TOOLS with expected value', () => {
    expect(UI_MAX_VISIBLE_TOOLS).toBe(5);
  });

  it('exports UI_RENDER_INTERVAL_MS with expected value', () => {
    expect(UI_RENDER_INTERVAL_MS).toBe(16);
  });

  it('exports UI_SPINNER_INTERVAL_MS with expected value', () => {
    expect(UI_SPINNER_INTERVAL_MS).toBe(96);
  });

  it('exports UI_MIN_TERMINAL_WIDTH with expected value', () => {
    expect(UI_MIN_TERMINAL_WIDTH).toBe(70);
  });

  it('exports UI_MIN_BOX_WIDTH with expected value', () => {
    expect(UI_MIN_BOX_WIDTH).toBe(30);
  });

  it('exports UI_MAX_DESCRIPTION_LENGTH with expected value', () => {
    expect(UI_MAX_DESCRIPTION_LENGTH).toBe(40);
  });

  it('exports UI_MAX_TOOL_ARGS_LENGTH with expected value', () => {
    expect(UI_MAX_TOOL_ARGS_LENGTH).toBe(100);
  });
});
