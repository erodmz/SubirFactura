import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.*',
      '**/.next/**',
      // El panel Next tiene su propio toolchain (React/hooks/@next), que este
      // ESLint raíz no carga: sus comentarios eslint-disable referencian reglas
      // inexistentes aquí y rompían `pnpm lint`. El web se valida con `tsc` (en
      // el build) y con su propio `next lint`; aquí se lintea el backend.
      'web/**',
      'app_flutter/**',
      'shared/prisma/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
