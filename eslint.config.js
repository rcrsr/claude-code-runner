import eslint from '@eslint/js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
  },
  {
    rules: {
      // Import sorting
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      // Prefer optional chaining
      '@typescript-eslint/prefer-optional-chain': 'error',
      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      // Allow string concatenation with + (common for CLI output)
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Allow any in some cases for JSON parsing
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow non-null assertions where needed
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Require explicit return types on exports
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      // Prefer const
      'prefer-const': 'error',
      // No var
      'no-var': 'error',
      // Consistent arrow functions
      'arrow-body-style': ['error', 'as-needed'],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', 'coverage/'],
  }
);
