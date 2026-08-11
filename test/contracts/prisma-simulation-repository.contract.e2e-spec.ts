import 'dotenv/config';

import { PrismaSimulationRepository } from '../../src/infra/database/repositories/prisma-simulation.repository';
import { uuidFor } from '../builders/uuid';
import { makePrismaService, truncateAll } from '../helpers/database';
import { testSimulationRepositoryContract } from './simulation-repository.contract';

/**
 * O MESMO contrato do fake, agora contra o Postgres real.
 *
 * Se a implementação Prisma divergir em qualquer garantia — ordenação, escopo,
 * semântica de paginação —, este arquivo falha. É o que impede o fake de mentir para
 * os testes de caso de uso.
 *
 * As migrations são aplicadas pelo `globalSetup` do Jest, antes de qualquer suíte.
 */
const prisma = makePrismaService();

testSimulationRepositoryContract('Prisma', {
  makeRepository: async () => {
    await truncateAll(prisma);
    return new PrismaSimulationRepository(prisma);
  },
  // Simulações têm FK para `users`: os donos precisam existir antes.
  seedUsers: async (labels) => {
    await prisma.user.createMany({
      data: labels.map((label) => ({
        id: uuidFor(label),
        name: label,
        email: `${label}@example.com`,
        passwordHash: 'hash-de-teste',
      })),
    });
  },
  teardown: () => prisma.$disconnect(),
});
