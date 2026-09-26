import base from './base.js';

/**
 * NestJS needs runtime (value) imports for classes injected through constructors,
 * because emitDecoratorMetadata reads them. `consistent-type-imports` would turn
 * them into `import type` and break dependency injection, so it is off here.
 */
export default [
  ...base,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      'no-console': 'off',
    },
  },
];
