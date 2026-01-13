/**
 * Shared argument parsing utilities
 */

/**
 * Parsed argument hint result
 */
export interface ArgumentHintResult {
  requiredCount: number;
  optionalPositions: Set<number>;
}

/**
 * Parse argument-hint to determine required vs optional args
 * Convention: <arg> = required, [arg] = optional
 *
 * @param hint - Argument hint string like "<file> [options]"
 * @returns Object with requiredCount and set of optional positions
 */
export function parseArgumentHint(
  hint: string | undefined
): ArgumentHintResult {
  if (!hint) {
    return { requiredCount: 0, optionalPositions: new Set() };
  }

  const optionalPositions = new Set<number>();
  let position = 0;
  let requiredCount = 0;

  const argPattern = /<[^>]+>|\[[^\]]+\]/g;
  let match;
  while ((match = argPattern.exec(hint)) !== null) {
    position++;
    if (match[0].startsWith('[')) {
      optionalPositions.add(position);
    } else {
      requiredCount = position;
    }
  }

  return { requiredCount, optionalPositions };
}
