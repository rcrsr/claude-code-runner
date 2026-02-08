import { describe, expect, it } from 'vitest';

import {
  STATUS_LINE_ELLIPSIS,
  STATUS_LINE_MIN_WIDTH,
} from '../../src/utils/constants.js';

describe('Status Line Constants', () => {
  describe('STATUS_LINE_ELLIPSIS', () => {
    it('is defined as "..."', () => {
      expect(STATUS_LINE_ELLIPSIS).toBe('...');
    });

    it('is a string type', () => {
      expect(typeof STATUS_LINE_ELLIPSIS).toBe('string');
    });
  });

  describe('STATUS_LINE_MIN_WIDTH', () => {
    it('is defined as 20', () => {
      expect(STATUS_LINE_MIN_WIDTH).toBe(20);
    });

    it('is a number type', () => {
      expect(typeof STATUS_LINE_MIN_WIDTH).toBe('number');
    });

    it('is a positive integer', () => {
      expect(STATUS_LINE_MIN_WIDTH).toBeGreaterThan(0);
      expect(Number.isInteger(STATUS_LINE_MIN_WIDTH)).toBe(true);
    });
  });
});
