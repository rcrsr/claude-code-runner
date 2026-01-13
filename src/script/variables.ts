/**
 * Variable store and substitution for script execution
 */

import { formatSize } from '../utils/formatting.js';
import type { VariableStore } from './types.js';

/**
 * Create an empty variable store
 */
export function createVariableStore(): VariableStore {
  return {
    named: new Map(),
    last: '',
  };
}

/**
 * Capture output into the variable store
 * Updates both the named variable (if provided) and $_
 */
export function captureOutput(
  store: VariableStore,
  output: string,
  varName?: string
): void {
  // Always update $_
  store.last = output;

  // Update named variable if provided
  if (varName) {
    store.named.set(varName, output);
  }
}

/**
 * Get capture log message for [RUNNER] output
 */
export function getCaptureLogMessage(output: string, varName?: string): string {
  const size = formatSize(output.length);
  if (varName) {
    return `$${varName} captured (${size})`;
  }
  return `$_ captured (${size})`;
}

/**
 * Substitute variables in a string
 * Handles: $_, $varname, $1, $2, etc.
 */
export function substituteVariables(
  text: string,
  store: VariableStore,
  scriptArgs: string[] = []
): string {
  let result = text;

  // Substitute $_ (last output)
  result = result.replace(/\$_/g, store.last);

  // Substitute $ARGUMENTS BEFORE named variables (otherwise regex catches it)
  result = result.replace(/\$ARGUMENTS/g, scriptArgs.join(' '));

  // Substitute positional args ($1, $2, etc.) BEFORE named variables
  for (const [i, arg] of scriptArgs.entries()) {
    result = result.replace(new RegExp(`\\$${i + 1}`, 'g'), arg);
  }

  // Remove any remaining unmatched $N placeholders
  result = result.replace(/\$\d+/g, '');

  // Substitute named variables ($varname) LAST
  // Match $word but not $1, $2, etc. (already handled above)
  result = result.replace(
    /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
    (_match, name: string) => store.named.get(name) ?? ''
  );

  return result;
}

/**
 * Get list of variables being substituted (for logging)
 */
export function getSubstitutionList(
  text: string,
  store: VariableStore
): string[] {
  const vars: string[] = [];

  // Check for $_
  if (text.includes('$_') && store.last) {
    vars.push('$_');
  }

  // Check for named variables
  for (const name of store.named.keys()) {
    if (text.includes(`$${name}`)) {
      vars.push(`$${name}`);
    }
  }

  return vars;
}
