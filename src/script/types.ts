/**
 * Types for parsed script lines
 */

/**
 * A prompt line: prompt("text") -> $var
 */
export interface PromptLine {
  type: 'prompt';
  text: string;
  capture?: string; // Variable name without $
}

/**
 * A command line: command("name", ["arg1", "arg2"]) -> $var
 */
export interface CommandLine {
  type: 'command';
  name: string;
  args: string[];
  capture?: string; // Variable name without $
}

/**
 * Union of all script line types
 */
export type ScriptLine = PromptLine | CommandLine;

/**
 * Result of parsing a script file
 */
export interface ParsedScript {
  lines: ScriptLine[];
  frontmatter: ScriptFrontmatter;
}

/**
 * Frontmatter metadata from script files
 */
export interface ScriptFrontmatter {
  model?: string;
  description?: string;
  argumentHint?: string;
}

/**
 * Variable store for captured outputs
 */
export interface VariableStore {
  /** Named captures: $name -> value */
  named: Map<string, string>;
  /** Last output: $_ */
  last: string;
}
