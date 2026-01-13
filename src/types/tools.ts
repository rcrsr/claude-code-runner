/**
 * Type-safe tool input handling
 * Provides discriminated union types for tool inputs
 */

/**
 * Read tool input
 */
export interface ReadToolInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

/**
 * Glob tool input
 */
export interface GlobToolInput {
  pattern: string;
  path?: string;
}

/**
 * Grep tool input
 */
export interface GrepToolInput {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
}

/**
 * Bash tool input
 */
export interface BashToolInput {
  command: string;
  description?: string;
  timeout?: number;
}

/**
 * Task tool input
 */
export interface TaskToolInput {
  description?: string;
  prompt?: string;
  subagent_type?: string;
}

/**
 * Write tool input
 */
export interface WriteToolInput {
  file_path: string;
  content: string;
}

/**
 * Edit tool input
 */
export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

/**
 * Get a string field from tool input with safe fallback
 */
export function getToolInputString(
  input: Record<string, unknown>,
  field: string,
  defaultValue = ''
): string {
  const value = input[field];
  return typeof value === 'string' ? value : defaultValue;
}
