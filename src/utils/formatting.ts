/**
 * Shared formatting utilities
 */

import type { RillValue } from '@rcrsr/rill';

import { SIZE_THRESHOLD_K, SIZE_THRESHOLD_M } from './constants.js';

/**
 * Format character count for display
 * @param chars - Number of characters
 * @returns Formatted string: "N chars", "N.NK chars", or "N.NM chars"
 */
export function formatSize(chars: number): string {
  if (chars < SIZE_THRESHOLD_K) {
    return `${chars} chars`;
  } else if (chars < SIZE_THRESHOLD_M) {
    return `${(chars / SIZE_THRESHOLD_K).toFixed(1)}K chars`;
  }
  return `${(chars / SIZE_THRESHOLD_M).toFixed(1)}M chars`;
}

/**
 * Format a Rill value for display or substitution
 */
export function formatRillValue(value: RillValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
