import { describe, expect, it } from 'vitest';

import { definedEnv } from '../../src/utils/env.js';

describe('definedEnv', () => {
  it('drops undefined entries and keeps defined ones', () => {
    expect(definedEnv({ A: '1', B: undefined, C: '' })).toEqual({ A: '1', C: '' });
  });

  it('returns a copy, not the input object', () => {
    const env = { A: '1' };
    const result = definedEnv(env);
    env.A = '2';
    expect(result).toEqual({ A: '1' });
  });
});
