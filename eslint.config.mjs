import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default defineConfig([
  prettier,
  globalIgnores(['/dist/**', '/node_modules/**']),

  // TypeScript
  ...tseslint.configs.recommended,

  // Project-wide rules
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
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
      curly: ['error', 'multi'],
      'func-style': ['error', 'expression'],
      'simple-import-sort/exports': 'error',
    },
  },
])
