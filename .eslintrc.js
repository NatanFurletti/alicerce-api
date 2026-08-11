module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/', 'coverage/', 'node_modules/'],
  rules: {
    // O CLAUDE.md proíbe `any` e escapes de tipagem. Erro, não aviso.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      { allowExpressions: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      // A regra arquitetural central: o domínio é TypeScript puro.
      // Se alguém importar Nest ou Prisma dentro de domain/, o lint quebra o build no CI.
      files: ['src/domain/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@nestjs/*', '@prisma/client', '**/infra/**', '@infra/*'],
                message:
                  'domain/ não pode depender de framework, ORM ou infraestrutura (ADR-001).',
              },
            ],
          },
        ],
      },
    },
    {
      // Casos de uso conhecem interfaces do domínio, nunca implementações de infra.
      files: ['src/application/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@prisma/client', '**/infra/**', '@infra/*'],
                message:
                  'application/ depende de interfaces de repositório, não de implementações (ADR-001).',
              },
            ],
          },
        ],
      },
    },
  ],
};
