import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Shared rules for every TypeScript package in the monorepo. */
export default tseslint.config(
  { ignores: ['dist/**', '.next/**', 'coverage/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
