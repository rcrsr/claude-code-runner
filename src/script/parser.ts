/**
 * Script line parser
 *
 * Parses the new script syntax:
 * - prompt("text") -> $var
 * - prompt(<<EOF ... EOF) -> $var
 * - command("name", ["arg1", "arg2"]) -> $var
 */

import type { CommandLine, PromptLine, ScriptLine } from './types.js';

/** Get character at position, or empty string if out of bounds */
function charAt(input: string, pos: number): string {
  return input[pos] ?? '';
}

/**
 * Parse a quoted string, handling escape sequences
 * Returns the parsed string and the position after the closing quote
 */
export function parseQuotedString(
  input: string,
  startPos: number
): { value: string; endPos: number } {
  if (charAt(input, startPos) !== '"') {
    throw new Error(`Expected opening quote at position ${startPos}`);
  }

  let result = '';
  let i = startPos + 1;

  while (i < input.length) {
    const char = charAt(input, i);

    if (char === '\\' && i + 1 < input.length) {
      // Escape sequence
      const next = charAt(input, i + 1);
      if (next === 'n') {
        result += '\n';
        i += 2;
      } else if (next === 't') {
        result += '\t';
        i += 2;
      } else if (next === '"') {
        result += '"';
        i += 2;
      } else if (next === '\\') {
        result += '\\';
        i += 2;
      } else {
        // Unknown escape, keep as-is
        result += char;
        i++;
      }
    } else if (char === '"') {
      // End of string
      return { value: result, endPos: i + 1 };
    } else {
      result += char;
      i++;
    }
  }

  throw new Error('Unterminated string: missing closing quote');
}

/**
 * Parse a heredoc block
 * Input should start at << position
 * Returns the content and position after the closing delimiter
 */
export function parseHeredoc(
  input: string,
  startPos: number
): { value: string; endPos: number } {
  if (input.slice(startPos, startPos + 2) !== '<<') {
    throw new Error(`Expected << at position ${startPos}`);
  }

  // Find delimiter (word after <<)
  let delimStart = startPos + 2;
  while (delimStart < input.length && charAt(input, delimStart) === ' ') {
    delimStart++;
  }

  let delimEnd = delimStart;
  while (delimEnd < input.length && /\w/.test(charAt(input, delimEnd))) {
    delimEnd++;
  }

  if (delimEnd === delimStart) {
    throw new Error('Heredoc requires a delimiter (e.g., <<EOF)');
  }

  const delimiter = input.slice(delimStart, delimEnd);

  // Find the newline after delimiter
  let contentStart = delimEnd;
  while (contentStart < input.length && charAt(input, contentStart) !== '\n') {
    contentStart++;
  }
  contentStart++; // Skip the newline

  // Find closing delimiter (must be on its own line)
  const closingPattern = new RegExp(`^${delimiter}\\s*$`, 'm');
  const remaining = input.slice(contentStart);
  const match = closingPattern.exec(remaining);

  if (!match) {
    throw new Error(`Heredoc missing closing delimiter: ${delimiter}`);
  }

  const content = remaining.slice(0, match.index);
  // Remove trailing newline if present
  const trimmedContent = content.endsWith('\n')
    ? content.slice(0, -1)
    : content;

  const endPos = contentStart + match.index + match[0].length;

  return { value: trimmedContent, endPos };
}

/**
 * Parse an array of strings: ["arg1", "arg2"]
 */
export function parseStringArray(
  input: string,
  startPos: number
): { values: string[]; endPos: number } {
  if (charAt(input, startPos) !== '[') {
    throw new Error(`Expected [ at position ${startPos}`);
  }

  const values: string[] = [];
  let i = startPos + 1;

  // Skip whitespace
  while (i < input.length && /\s/.test(charAt(input, i))) i++;

  // Empty array
  if (charAt(input, i) === ']') {
    return { values: [], endPos: i + 1 };
  }

  while (i < input.length) {
    // Skip whitespace
    while (i < input.length && /\s/.test(charAt(input, i))) i++;

    if (charAt(input, i) === ']') {
      return { values, endPos: i + 1 };
    }

    // Parse string element
    if (charAt(input, i) !== '"') {
      throw new Error(`Expected string in array at position ${i}`);
    }

    const { value, endPos } = parseQuotedString(input, i);
    values.push(value);
    i = endPos;

    // Skip whitespace
    while (i < input.length && /\s/.test(charAt(input, i))) i++;

    // Expect comma or closing bracket
    if (charAt(input, i) === ',') {
      i++;
    } else if (charAt(input, i) !== ']') {
      throw new Error(`Expected , or ] at position ${i}`);
    }
  }

  throw new Error('Unterminated array: missing ]');
}

/**
 * Parse capture syntax: -> $varname
 * Returns variable name (without $) or undefined
 */
export function parseCapture(
  input: string,
  startPos: number
): { capture?: string; endPos: number } {
  let i = startPos;

  // Skip whitespace
  while (i < input.length && /\s/.test(charAt(input, i))) i++;

  // Check for ->
  if (input.slice(i, i + 2) !== '->') {
    return { endPos: i };
  }
  i += 2;

  // Skip whitespace
  while (i < input.length && /\s/.test(charAt(input, i))) i++;

  // Expect $
  if (charAt(input, i) !== '$') {
    throw new Error(`Expected $ after -> at position ${i}`);
  }
  i++;

  // Parse variable name
  let varName = '';
  while (i < input.length && /\w/.test(charAt(input, i))) {
    varName += charAt(input, i);
    i++;
  }

  if (!varName) {
    throw new Error('Variable name required after $');
  }

  return { capture: varName, endPos: i };
}

/**
 * Parse a prompt line: prompt("text") or prompt(<<EOF...EOF)
 */
export function parsePromptLine(input: string): PromptLine {
  const trimmed = input.trim();

  if (!trimmed.startsWith('prompt(')) {
    throw new Error('Expected prompt(');
  }

  let pos = 7; // After 'prompt('

  // Skip whitespace
  while (pos < trimmed.length && /\s/.test(charAt(trimmed, pos))) pos++;

  let text: string;
  let endPos: number;

  if (charAt(trimmed, pos) === '"') {
    // Quoted string
    const result = parseQuotedString(trimmed, pos);
    text = result.value;
    endPos = result.endPos;
  } else if (trimmed.slice(pos, pos + 2) === '<<') {
    // Heredoc
    const result = parseHeredoc(trimmed, pos);
    text = result.value;
    endPos = result.endPos;
  } else {
    throw new Error('Expected quoted string or heredoc after prompt(');
  }

  // Skip whitespace
  while (endPos < trimmed.length && /\s/.test(charAt(trimmed, endPos)))
    endPos++;

  // Expect closing paren
  if (charAt(trimmed, endPos) !== ')') {
    throw new Error(`Expected ) at position ${endPos}`);
  }
  endPos++;

  // Parse optional capture
  const { capture } = parseCapture(trimmed, endPos);

  const result: PromptLine = { type: 'prompt', text };
  if (capture) result.capture = capture;
  return result;
}

/**
 * Parse a command line: command("name") or command("name", ["args"])
 */
export function parseCommandLine(input: string): CommandLine {
  const trimmed = input.trim();

  if (!trimmed.startsWith('command(')) {
    throw new Error('Expected command(');
  }

  let pos = 8; // After 'command('

  // Skip whitespace
  while (pos < trimmed.length && /\s/.test(charAt(trimmed, pos))) pos++;

  // Parse command name
  if (charAt(trimmed, pos) !== '"') {
    throw new Error('Expected quoted command name');
  }

  const nameResult = parseQuotedString(trimmed, pos);
  const name = nameResult.value;
  pos = nameResult.endPos;

  // Skip whitespace
  while (pos < trimmed.length && /\s/.test(charAt(trimmed, pos))) pos++;

  let args: string[] = [];

  // Check for comma (args follow)
  if (charAt(trimmed, pos) === ',') {
    pos++;

    // Skip whitespace
    while (pos < trimmed.length && /\s/.test(charAt(trimmed, pos))) pos++;

    // Parse args array
    const argsResult = parseStringArray(trimmed, pos);
    args = argsResult.values;
    pos = argsResult.endPos;
  }

  // Skip whitespace
  while (pos < trimmed.length && /\s/.test(charAt(trimmed, pos))) pos++;

  // Expect closing paren
  if (charAt(trimmed, pos) !== ')') {
    throw new Error(`Expected ) at position ${pos}`);
  }
  pos++;

  // Parse optional capture
  const { capture } = parseCapture(trimmed, pos);

  const result: CommandLine = { type: 'command', name, args };
  if (capture) result.capture = capture;
  return result;
}

/**
 * Parse a single script line
 */
export function parseScriptLine(line: string): ScriptLine {
  const trimmed = line.trim();

  if (trimmed.startsWith('prompt(')) {
    return parsePromptLine(trimmed);
  } else if (trimmed.startsWith('command(')) {
    return parseCommandLine(trimmed);
  } else {
    throw new Error(`Unknown script line type: ${trimmed.slice(0, 20)}...`);
  }
}

/**
 * Check if a line is a comment or empty
 */
export function isCommentOrEmpty(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/**
 * Parse script content into lines, handling multi-line heredocs
 * Returns raw line strings (not parsed) for further processing
 */
export function extractScriptLines(content: string): string[] {
  const lines: string[] = [];
  const contentLines = content.split('\n');
  let i = 0;

  while (i < contentLines.length) {
    const line = contentLines[i] ?? '';
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (isCommentOrEmpty(trimmed)) {
      i++;
      continue;
    }

    // Check for heredoc
    if (trimmed.includes('<<')) {
      // Find the delimiter
      const heredocMatch = /<<(\w+)/.exec(trimmed);
      if (heredocMatch) {
        const delimiter = heredocMatch[1];
        let fullLine = line;
        i++;

        // Collect lines until we find the closing delimiter
        while (i < contentLines.length) {
          const nextLine = contentLines[i] ?? '';
          fullLine += '\n' + nextLine;

          if (nextLine.trim() === delimiter) {
            i++;
            // Also capture closing paren (and optional capture) if on next line(s)
            if (i < contentLines.length) {
              const parenLine = contentLines[i] ?? '';
              const parenTrimmed = parenLine.trim();
              // Match ) or ) -> $var
              if (parenTrimmed === ')' || parenTrimmed.startsWith(') ->')) {
                fullLine += '\n' + parenLine;
                i++;
              }
            }
            break;
          }
          i++;
        }

        lines.push(fullLine);
        continue;
      }
    }

    // Regular single line
    lines.push(line);
    i++;
  }

  return lines;
}
