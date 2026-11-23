import { describe, expect, it } from 'vitest';

import { argList, argNumber, argString } from '../../src/rill/host-args.js';

describe('argString', () => {
  it('returns a string argument', () => {
    expect(argString({ text: 'hi' }, 'text')).toBe('hi');
  });

  it('throws a TypeError naming the argument for a non-string', () => {
    expect(() => argString({ text: 1 }, 'text')).toThrow(
      "Host argument 'text' must be a string, got number"
    );
  });

  it('throws for a missing argument', () => {
    expect(() => argString({}, 'text')).toThrow(TypeError);
  });
});

describe('argNumber', () => {
  it('returns a number argument', () => {
    expect(argNumber({ timeout: 5 }, 'timeout')).toBe(5);
  });

  it('throws a TypeError for a non-number', () => {
    expect(() => argNumber({ timeout: '5' }, 'timeout')).toThrow(
      "Host argument 'timeout' must be a number, got string"
    );
  });
});

describe('argList', () => {
  it('returns a list argument', () => {
    expect(argList({ args: ['a', 'b'] }, 'args')).toEqual(['a', 'b']);
  });

  it('throws a TypeError for a non-list', () => {
    expect(() => argList({ args: 'a' }, 'args')).toThrow(
      "Host argument 'args' must be a list, got string"
    );
  });
});
