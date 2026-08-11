import 'dotenv/config';

import { Test } from '@nestjs/testing';

import {
  EXTRA_PAYMENT_REPOSITORY,
  SIMULATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../src/domain/repositories/tokens';
import type { SimulationRepository } from '../../src/domain/repositories/simulation-repository';
import { DatabaseModule } from '../../src/infra/database/database.module';
import { PrismaService } from '../../src/infra/database/prisma/prisma.service';
import { PrismaExtraPaymentRepository } from '../../src/infra/database/repositories/prisma-extra-payment.repository';
import { PrismaSimulationRepository } from '../../src/infra/database/repositories/prisma-simulation.repository';
import { PrismaUserRepository } from '../../src/infra/database/repositories/prisma-user.repository';
import { makeDbSimulation } from '../builders/simulation-builder';
import { uuidFor } from '../builders/uuid';
import { truncateAll } from '../helpers/database';

/**
 * Verifica a fiação de injeção de dependência.
 *
 * Sem este teste, um token não registrado só apareceria na primeira requisição HTTP da
 * Etapa 5 — e a mensagem do Nest para provider ausente não é das mais claras. Aqui o
 * container é realmente construído e cada token resolvido.
 */
describe('DatabaseModule (fiação de DI)', () => {
  it('resolve cada token para a implementação Prisma correspondente', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile();

    expect(moduleRef.get(USER_REPOSITORY)).toBeInstanceOf(PrismaUserRepository);
    expect(moduleRef.get(SIMULATION_REPOSITORY)).toBeInstanceOf(
      PrismaSimulationRepository,
    );
    expect(moduleRef.get(EXTRA_PAYMENT_REPOSITORY)).toBeInstanceOf(
      PrismaExtraPaymentRepository,
    );

    await moduleRef.close();
  });

  it('o repositório injetado conversa com o banco de verdade', async () => {
    // Prova que a URL do datasource está resolvida e a conexão funciona — e não
    // apenas que a classe foi instanciada.
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      .overrideProvider(PrismaService)
      .useValue(
        new PrismaService({
          datasources: { db: { url: process.env.DATABASE_URL_TEST ?? '' } },
        }),
      )
      .compile();

    await moduleRef.init();
    const prisma = moduleRef.get(PrismaService);
    await truncateAll(prisma);

    await prisma.user.create({
      data: {
        id: uuidFor('user-1'),
        name: 'Natan',
        email: 'natan@example.com',
        passwordHash: 'hash',
      },
    });

    const repository = moduleRef.get<SimulationRepository>(SIMULATION_REPOSITORY);
    await repository.create(makeDbSimulation({ id: 'sim-1', userId: 'user-1' }));

    const found = await repository.findByIdAndUserId(uuidFor('sim-1'), uuidFor('user-1'));
    expect(found?.termMonths).toBe(360);

    await moduleRef.close();
  });
});
