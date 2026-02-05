/**
 * Documentation generation for Rill language and CCR host functions
 */

import {
  type FunctionMetadata,
  getFunctions,
  getLanguageReference,
  type RuntimeContext,
} from '@rcrsr/rill';

import { createRunnerContext } from '../rill/context.js';
import type { DocsOptions } from '../types/runner.js';

/**
 * Generate Rill documentation for LLM prompt context
 */
export function generateDocs(options: DocsOptions): string {
  const { functionsOnly, languageOnly } = options;

  // If both flags are true, treat as neither (show both)
  const showLanguage = !functionsOnly || languageOnly;
  const showFunctions = !languageOnly || functionsOnly;

  // Create minimal context with stub executor
  const stubExecutor = (): Promise<{ output: string; exitCode: number }> =>
    Promise.reject(new Error('Executor called in docs context'));

  const context: RuntimeContext = createRunnerContext({
    executeClause: stubExecutor,
  });

  const sections: string[] = [];

  // Generate language reference section
  if (showLanguage) {
    const langRef = getLanguageReference();
    sections.push('# Rill Language Reference\n\n' + langRef);
  }

  // Generate host functions section
  if (showFunctions) {
    const functions = getFunctions(context);
    sections.push(formatFunctions(functions));
  }

  return sections.join('\n\n');
}

/**
 * Format host functions as markdown
 */
function formatFunctions(functions: FunctionMetadata[]): string {
  const lines: string[] = ['# CCR Host Functions'];

  const sortedFunctions = functions
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const fn of sortedFunctions) {
    lines.push('', `## ${fn.name}`);

    if (fn.description) {
      lines.push('', fn.description);
    }

    if (fn.params.length > 0) {
      lines.push('', '**Parameters:**');
      for (const param of fn.params) {
        const required =
          param.defaultValue === undefined ? 'required' : 'optional';
        lines.push(`- \`${param.name}\` (${param.type}, ${required})`);
      }
    }
  }

  return lines.join('\n');
}
