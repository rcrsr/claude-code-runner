import { describe, it, expect } from 'vitest';
import { detectRunnerSignal } from '../../src/parsers/signals.js';

describe('detectRunnerSignal', () => {
  it('detects DONE signal', () => {
    const text = 'Task completed successfully :::RUNNER::DONE:::';
    expect(detectRunnerSignal(text)).toBe('done');
  });

  it('detects CONTINUE signal', () => {
    const text = 'Moving to next step :::RUNNER::CONTINUE:::';
    expect(detectRunnerSignal(text)).toBe('continue');
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
      Done with first step
      :::RUNNER::CONTINUE:::
      More text after
    `;
    expect(detectRunnerSignal(text)).toBe('continue');
  });
});
