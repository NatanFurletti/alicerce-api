import { InMemorySimulationRepository } from '../fakes/in-memory-simulation-repository';
import { testSimulationRepositoryContract } from './simulation-repository.contract';

/**
 * O fake sujeito ao mesmo contrato que a implementação Prisma.
 *
 * Roda na suíte unitária (sem Docker), então o contrato é verificado a cada `npm test`.
 * A versão Prisma do mesmo contrato roda no `npm run test:e2e`, contra o Postgres.
 */
testSimulationRepositoryContract('InMemory', {
  makeRepository: () => Promise.resolve(new InMemorySimulationRepository()),
});
