import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default defineConfig([
  prettier,
  globalIgnores(['dist/**', 'node_modules/**']),

  // TypeScript
  ...tseslint.configs.recommended,

  // Project-wide rules
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'arrow-body-style': ['error', 'as-needed'],
      curly: ['error', 'multi'],
      eqeqeq: 'error',
      'func-style': ['error', 'expression'],
      'no-else-return': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Node built-ins
            ['^node:'],
            // External packages
            ['^[a-z@]'],
            // Internal/project imports
            ['^\\.\\./', '^\\./', '^@/'],
          ],
        },
      ],
    },
  },
])
