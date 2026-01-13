/**
 * Command template loading and variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Frontmatter metadata from command template
 */
export interface CommandFrontmatter {
  model?: string;
  description?: string;
  argumentHint?: string;
}

/**
 * Result of loading a command template
 */
export interface CommandTemplate {
  prompt: string;
  frontmatter: CommandFrontmatter;
}

/**
 * Parse argument-hint to determine required vs optional args
 * Convention: <arg> = required, [arg] = optional
 * Returns set of optional argument positions (1-indexed)
 */
function parseArgumentHint(hint: string | undefined): {
  requiredCount: number;
  optionalPositions: Set<number>;
} {
  if (!hint) {
    return { requiredCount: 0, optionalPositions: new Set() };
  }

  const optionalPositions = new Set<number>();
  let position = 0;
  let requiredCount = 0;

  // Match <required> or [optional] patterns
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

/**
 * Parse YAML frontmatter from markdown content
 * Returns the frontmatter object and remaining content
 */
export function parseFrontmatter(content: string): {
  frontmatter: CommandFrontmatter;
  body: string;
} {
  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = content.slice(4, endIndex);
  const body = content.slice(endIndex + 4).trimStart();

  // Simple YAML parsing for known fields
  const frontmatter: CommandFrontmatter = {};
  const keyValueRegex = /^(\S+):\s*(.*)$/;
  for (const line of yamlContent.split('\n')) {
    const match = keyValueRegex.exec(line);
    if (match) {
      const [, key, value] = match;
      const trimmedValue = value?.trim().replace(/^["']|["']$/g, '') ?? '';
      if (key === 'model' && trimmedValue) {
        frontmatter.model = trimmedValue;
      } else if (key === 'description' && trimmedValue) {
        frontmatter.description = trimmedValue;
      } else if (key === 'argument-hint' && trimmedValue) {
        frontmatter.argumentHint = trimmedValue;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Strip YAML frontmatter from markdown content (legacy helper)
 */
export function stripFrontmatter(content: string): string {
  return parseFrontmatter(content).body;
}

/**
 * Load a command template and substitute positional arguments
 * Templates are loaded from .claude/commands/<name>.md
 *
 * Supports:
 * - $ARGUMENTS: all arguments joined with spaces
 * - $1, $2, $3...: positional arguments
 *
 * Frontmatter fields:
 * - model: default model for this command (CLI arg takes precedence)
 * - description: command description
 * - argument-hint: defines required <arg> and optional [arg] arguments
 *
 * @param commandName - Name of the command (without .md extension)
 * @param cmdArgs - Positional arguments to substitute
 */
export function loadCommandTemplate(
  commandName: string,
  cmdArgs: string[]
): CommandTemplate {
  const commandFile = path.join(
    process.cwd(),
    '.claude',
    'commands',
    `${commandName}.md`
  );

  if (!fs.existsSync(commandFile)) {
    throw new Error(`Command not found: ${commandFile}`);
  }

  const content = fs.readFileSync(commandFile, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  // Parse argument hints to determine required vs optional
  const { requiredCount, optionalPositions } = parseArgumentHint(
    frontmatter.argumentHint
  );

  // Check for missing required arguments
  if (cmdArgs.length < requiredCount) {
    const missing = [];
    for (let i = cmdArgs.length + 1; i <= requiredCount; i++) {
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

  // Substitute $ARGUMENTS with all args joined
  let prompt = body.replace(/\$ARGUMENTS/g, cmdArgs.join(' '));

  // Substitute $1, $2, $3, ... with positional args
  for (const [i, arg] of cmdArgs.entries()) {
    prompt = prompt.replace(new RegExp(`\\$${i + 1}`, 'g'), arg);
  }

  // Replace any remaining $N with empty string (optional args)
  prompt = prompt.replace(/\$\d+/g, '');

  return { prompt, frontmatter };
}
