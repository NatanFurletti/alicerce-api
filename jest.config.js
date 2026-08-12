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
    // Repositórios e mappers Prisma são cobertos pelos testes de INTEGRAÇÃO
    // (`npm run test:e2e`), contra o Postgres real — é o único lugar onde faz
    // sentido testá-los. Contá-los aqui mediria a suíte errada e mascararia a
    // cobertura real do domínio.
    '!src/infra/database/**',
    '!src/**/*.module.ts',
    '!src/domain/repositories/tokens.ts',
    // Controllers, DTOs e decorators são exercitados pelos testes e2e, contra a
    // aplicação real. O CLAUDE.md é explícito: não perseguir cobertura em
    // controllers. O que tem lógica própria aqui — o exception filter — continua
    // medido e testado unitariamente.
    '!src/infra/http/controllers/**',
    '!src/infra/http/dtos/**',
    '!src/infra/http/decorators/**',
    '!src/infra/http/health/**',
    '!src/infra/http/tokens.ts',
    '!src/infra/http/throttler.config.ts',
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
    // Entidades, value objects e casos de uso — o alvo do CLAUDE.md para
    // domain/ e application/ é acima de 80%.
    './src/domain/entities/': { branches: 90, functions: 90, lines: 95, statements: 95 },
    './src/domain/value-objects/': { branches: 90, functions: 95, lines: 95, statements: 95 },
    './src/application/': { branches: 85, functions: 90, lines: 90, statements: 90 },
  },
};
