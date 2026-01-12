import { describe, it, expect } from 'vitest';
import { detectRunnerSignal } from '../../src/parsers/signals.js';

describe('detectRunnerSignal', () => {
  it('detects REPEAT_STEP signal', () => {
    const text = 'Need to retry :::RUNNER::REPEAT_STEP:::';
    expect(detectRunnerSignal(text)).toBe('repeat_step');
  });

  it('detects BLOCKED signal', () => {
    const text = 'Waiting for input :::RUNNER::BLOCKED:::';
    expect(detectRunnerSignal(text)).toBe('blocked');
  });

  it('detects ERROR signal', () => {
    const text = 'Something went wrong :::RUNNER::ERROR:::';
    expect(detectRunnerSignal(text)).toBe('error');
  });

  it('returns null when no signal present', () => {
    const text = 'Just some regular output';
    expect(detectRunnerSignal(text)).toBeNull();
  });

  it('detects signal in multiline text', () => {
    const text = `
      Processing...
      Need another pass
      :::RUNNER::REPEAT_STEP:::
      More text after
    `;
    expect(detectRunnerSignal(text)).toBe('repeat_step');
  });
});
