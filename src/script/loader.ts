/**
 * Script file loading with frontmatter and argument validation
 */

import * as fs from 'fs';

import { parseFrontmatter } from '../templates/command.js';
import { parseArgumentHint } from '../utils/arguments.js';
import { extractScriptLines, parseScriptLine } from './parser.js';
import type { ParsedScript, ScriptFrontmatter, ScriptLine } from './types.js';

/**
 * Validate script arguments against argument-hint
 */
function validateArguments(
  frontmatter: ScriptFrontmatter,
  args: string[]
): void {
  const { requiredCount, optionalPositions } = parseArgumentHint(
    frontmatter.argumentHint
  );

  if (args.length < requiredCount) {
    const missing = [];
    for (let i = args.length + 1; i <= requiredCount; i++) {
      if (!optionalPositions.has(i)) {
        missing.push(`$${i}`);
      }
    }
    if (missing.length > 0) {
      const hint = frontmatter.argumentHint
        ? ` (usage: ${frontmatter.argumentHint})`
        : '';
      throw new Error(
        `Missing required arguments: ${missing.join(', ')}${hint}`
      );
    }
  }
}

/**
 * Load and parse a script file
 *
 * @param scriptFile - Path to the script file
 * @param scriptArgs - Arguments passed to the script (for validation only)
 * @returns Parsed script with lines and frontmatter
 */
export function loadScript(
  scriptFile: string,
  scriptArgs: string[] = []
): ParsedScript {
  if (!fs.existsSync(scriptFile)) {
    throw new Error(`Script not found: ${scriptFile}`);
  }

  const content = fs.readFileSync(scriptFile, 'utf-8');

  // Parse frontmatter (reuse from templates/command.ts)
  const { frontmatter: rawFrontmatter, body } = parseFrontmatter(content);

  // Convert to ScriptFrontmatter (handle exactOptionalPropertyTypes)
  const frontmatter: ScriptFrontmatter = {};
  if (rawFrontmatter.model) frontmatter.model = rawFrontmatter.model;
  if (rawFrontmatter.description)
    frontmatter.description = rawFrontmatter.description;
  if (rawFrontmatter.argumentHint)
    frontmatter.argumentHint = rawFrontmatter.argumentHint;

  // Validate arguments
  validateArguments(frontmatter, scriptArgs);

  // Extract raw lines (handling heredocs)
  const rawLines = extractScriptLines(body);

  // Parse each line
  const lines: ScriptLine[] = rawLines.map((line, index) => {
    try {
      return parseScriptLine(line);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Script parse error on line ${index + 1}: ${msg}`);
    }
  });

  return { lines, frontmatter };
}
