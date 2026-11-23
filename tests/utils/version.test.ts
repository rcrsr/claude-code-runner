import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import { getPackageVersion } from '../../src/utils/version.js';

describe('getPackageVersion', () => {
  it('returns the version from package.json', () => {
    const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
    const expected = typeof pkg === 'object' && pkg !== null && 'version' in pkg ? pkg.version : '';
    expect(getPackageVersion()).toBe(expected);
  });
});
