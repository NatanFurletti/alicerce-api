/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    // Barrels só re-exportam: contá-los mede organização de arquivo, não teste.
    '!src/**/index.ts',
    '!src/**/types.ts',
  ],
  coverageDirectory: './coverage',
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infra/(.*)$': '<rootDir>/src/infra/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  coverageThreshold: {
    global: { branches: 60, functions: 60, lines: 60, statements: 60 },
    // O núcleo financeiro é a razão de existir do projeto: 90% é exigência da Etapa 1
    // do roadmap, verificada pelo CI e não pela minha palavra.
    './src/domain/finance/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
