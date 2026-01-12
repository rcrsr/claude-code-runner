/**
 * Command template loading and variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Strip YAML frontmatter from markdown content
 * Frontmatter can cause CLI parsing issues
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) {
    return content;
  }
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return content;
  }
  return content.slice(endIndex + 4).trimStart();
}

/**
 * Load a command template and substitute positional arguments
 * Templates are loaded from .claude/commands/<name>.md
 *
 * @param commandName - Name of the command (without .md extension)
 * @param cmdArgs - Positional arguments to substitute ($1, $2, etc.)
 */
export function loadCommandTemplate(
  commandName: string,
  cmdArgs: string[]
): string {
  const commandFile = path.join(
    process.cwd(),
    '.claude',
    'commands',
    `${commandName}.md`
  );

  if (!fs.existsSync(commandFile)) {
    console.error(`Error: command not found: ${commandFile}`);
    process.exit(1);
  }

  let template = fs.readFileSync(commandFile, 'utf-8');

  // Strip YAML frontmatter
  template = stripFrontmatter(template);

  // Substitute $1, $2, $3, ... with positional args
  for (const [i, arg] of cmdArgs.entries()) {
    template = template.replace(new RegExp(`\\$${i + 1}`, 'g'), arg);
  }

  // Warn about unsubstituted variables
  const unsubstituted = template.match(/\$\d+/g);
  if (unsubstituted) {
    const unique = [...new Set(unsubstituted)];
    console.error(`Warning: unsubstituted variables: ${unique.join(', ')}`);
  }

  return template;
}
