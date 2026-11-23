/**
 * Typed readers for host function arguments.
 *
 * Rill validates each argument against the declared param type before calling `fn`,
 * so these checks never fail at runtime. They narrow `RillValue` without a type assertion.
 */

import type { RillValue } from '@rcrsr/rill';

type HostArgs = Record<string, RillValue>;

function argTypeError(name: string, expected: string, value: RillValue | undefined): TypeError {
  return new TypeError(`Host argument '${name}' must be ${expected}, got ${typeof value}`);
}

/** Read a string argument */
export function argString(args: HostArgs, name: string): string {
  const value = args[name];
  if (typeof value !== 'string') {
    throw argTypeError(name, 'a string', value);
  }
  return value;
}

/** Read a number argument */
export function argNumber(args: HostArgs, name: string): number {
  const value = args[name];
  if (typeof value !== 'number') {
    throw argTypeError(name, 'a number', value);
  }
  return value;
}

/** Read a list argument */
export function argList(args: HostArgs, name: string): readonly RillValue[] {
  const value = args[name];
  if (!Array.isArray(value)) {
    throw argTypeError(name, 'a list', value);
  }
  const list: readonly RillValue[] = value;
  return list;
}
