/**
 * Script module - parsing, loading, and variable management
 */

// Types
export type {
  CommandLine,
  ParsedScript,
  PromptLine,
  ScriptFrontmatter,
  ScriptLine,
  VariableStore,
} from './types.js';

// Loader
export { loadScript } from './loader.js';

// Parser (for direct use if needed)
export {
  extractScriptLines,
  parseCommandLine,
  parsePromptLine,
  parseScriptLine,
} from './parser.js';

// Variables
export {
  captureOutput,
  createVariableStore,
  getCaptureLogMessage,
  getSubstitutionList,
  substituteVariables,
} from './variables.js';
