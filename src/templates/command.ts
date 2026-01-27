/**
 * Template loading and variable substitution for commands and scripts
 */

import * as fs from 'fs';
import * as path from 'path';

import { parseArgumentHint } from '../utils/arguments.js';

/**
 * Frontmatter metadata from template files
 */
export interface TemplateFrontmatter {
  model?: string;
  description?: string;
  argumentHint?: string;
  /** Rill named args definition (e.g., "file: string, retries: number = 3") */
  args?: string;
}

/**
 * Result of processing a template
 */
interface ProcessedTemplate {
  body: string;
  frontmatter: TemplateFrontmatter;
}

/**
 * Result of loading a command template
 */
export interface CommandTemplate {
  prompt: string;
  frontmatter: TemplateFrontmatter;
}

/**
 * Result of loading a script template
 */
export interface ScriptTemplate {
  lines: string[];
  frontmatter: TemplateFrontmatter;
}

// Legacy alias for backwards compatibility
export type CommandFrontmatter = TemplateFrontmatter;

/**
 * Parse YAML frontmatter from markdown content, returning all key-value pairs
 */
export function parseGenericFrontmatter(content: string): {
  frontmatter: Record<string, string>;
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

  const frontmatter: Record<string, string> = {};
  const keyValueRegex = /^(\S+):\s*(.*)$/;
  for (const line of yamlContent.split('\n')) {
    const match = keyValueRegex.exec(line);
    if (!match) continue;

    const [, key, value] = match;
    const trimmedValue = value?.trim().replace(/^["']|["']$/g, '') ?? '';
    if (key && trimmedValue) {
      frontmatter[key] = trimmedValue;
    }
  }

  return { frontmatter, body };
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  frontmatter: TemplateFrontmatter;
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

  const frontmatter: TemplateFrontmatter = {};
  const keyValueRegex = /^(\S+):\s*(.*)$/;
  for (const line of yamlContent.split('\n')) {
    const match = keyValueRegex.exec(line);
    if (!match) continue;

    const [, key, value] = match;
    const trimmedValue = value?.trim().replace(/^["']|["']$/g, '') ?? '';
    if (!trimmedValue) continue;

    switch (key) {
      case 'model':
        frontmatter.model = trimmedValue;
        break;
      case 'description':
        frontmatter.description = trimmedValue;
        break;
      case 'argument-hint':
        frontmatter.argumentHint = trimmedValue;
        break;
      case 'args':
        frontmatter.args = trimmedValue;
        break;
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
 * Process template content: parse frontmatter, validate and substitute arguments
 */
function processTemplate(content: string, args: string[]): ProcessedTemplate {
  const { frontmatter, body } = parseFrontmatter(content);

  // Validate required arguments
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

  // Substitute arguments
  let result = body.replace(/\$ARGUMENTS/g, args.join(' '));
  for (const [i, arg] of args.entries()) {
    result = result.replace(new RegExp(`\\$${i + 1}`, 'g'), arg);
  }
  result = result.replace(/\$\d+/g, '');

  return { body: result, frontmatter };
}

/**
 * Load a template from a file path
 */
function loadTemplate(
  filePath: string,
  errorLabel: string,
  templateArgs: string[]
): CommandTemplate {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${errorLabel} not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const { body, frontmatter } = processTemplate(content, templateArgs);

  return { prompt: body, frontmatter };
}

/**
 * Load a command template from .claude/commands/<name>.md
 */
export function loadCommandTemplate(
  commandName: string,
  cmdArgs: string[],
  cwd: string = process.cwd()
): CommandTemplate {
  const commandFile = path.join(
    cwd,
    '.claude',
    'commands',
    `${commandName}.md`
  );
  return loadTemplate(commandFile, 'Command', cmdArgs);
}

/**
 * Load a skill template from .claude/skills/<name>/SKILL.md
 */
export function loadSkillTemplate(
  skillName: string,
  skillArgs: string[],
  cwd: string = process.cwd()
): CommandTemplate {
  const skillFile = path.join(cwd, '.claude', 'skills', skillName, 'SKILL.md');
  return loadTemplate(skillFile, 'Skill', skillArgs);
}

/**
 * Load a script template and substitute arguments
 */
export function loadScriptTemplate(
  scriptFile: string,
  scriptArgs: string[]
): ScriptTemplate {
  if (!fs.existsSync(scriptFile)) {
    throw new Error(`Script not found: ${scriptFile}`);
  }

  const content = fs.readFileSync(scriptFile, 'utf-8');
  const { body, frontmatter } = processTemplate(content, scriptArgs);

  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  return { lines, frontmatter };
}
