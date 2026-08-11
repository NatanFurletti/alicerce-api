import 'dotenv/config';

import { AddExtraPaymentUseCase } from '../../src/application/use-cases/add-extra-payment';
import { FixedClock } from '../../src/application/ports/clock';
import { UuidGenerator } from '../../src/application/ports/id-generator';
import { ExtraPaymentRecord } from '../../src/domain/entities/extra-payment-record';
import { ExtraPaymentOutOfRangeError } from '../../src/domain/errors/domain-errors';
import { Money } from '../../src/domain/value-objects/money.vo';
import { PrismaExtraPaymentRepository } from '../../src/infra/database/repositories/prisma-extra-payment.repository';
import { PrismaSimulationRepository } from '../../src/infra/database/repositories/prisma-simulation.repository';
import { makeDbSimulation } from '../builders/simulation-builder';
import { uuidFor } from '../builders/uuid';
import { makePrismaService, truncateAll } from '../helpers/database';

const prisma = makePrismaService();
const extraPayments = new PrismaExtraPaymentRepository(prisma);
const simulations = new PrismaSimulationRepository(prisma);

const SIM = uuidFor('sim-1');

async function seed(): Promise<void> {
  await prisma.user.create({
    data: {
      id: uuidFor('user-1'),
      name: 'Natan',
      email: 'natan@example.com',
      passwordHash: 'hash',
    },
  });
  await simulations.create(makeDbSimulation({ id: 'sim-1', userId: 'user-1' }));
}

function makeRecord(monthNumber: number, amountCents: number): ExtraPaymentRecord {
  return ExtraPaymentRecord.create({
    id: new UuidGenerator().generate(),
    simulationId: SIM,
    monthNumber,
    amount: Money.fromCents(amountCents),
    strategy: 'REDUCE_TERM',
    createdAt: new Date('2026-02-01T00:00:00Z'),
  });
}

beforeEach(async () => {
  await truncateAll(prisma);
  await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PrismaExtraPaymentRepository', () => {
  it('persiste e recupera preservando o valor em centavos', async () => {
    await extraPayments.create(makeRecord(13, 5_000_000));

    const [found] = await extraPayments.listBySimulationId(SIM);

    expect(found?.monthNumber).toBe(13);
    expect(found?.amount.cents).toBe(5_000_000);
    expect(found?.strategy).toBe('REDUCE_TERM');
  });

  it('ordena por mês, mesmo inserindo fora de ordem', async () => {
    // A ordem importa: o recálculo aplica os aportes cronologicamente, e um aporte
    // anterior muda o saldo sobre o qual o seguinte é validado.
    for (const month of [24, 6, 36, 12]) {
      await extraPayments.create(makeRecord(month, 1_000_000));
    }

    const records = await extraPayments.listBySimulationId(SIM);

    expect(records.map((r) => r.monthNumber)).toEqual([6, 12, 24, 36]);
  });

  it('lista apenas os aportes da simulação pedida', async () => {
    await simulations.create(makeDbSimulation({ id: 'sim-2', userId: 'user-1' }));
    await extraPayments.create(makeRecord(13, 5_000_000));

    expect(await extraPayments.listBySimulationId(uuidFor('sim-2'))).toHaveLength(0);
  });

  it('simulação sem aportes devolve lista vazia', async () => {
    expect(await extraPayments.listBySimulationId(SIM)).toEqual([]);
  });

  it('CASCADE: apagar a simulação apaga os aportes', async () => {
    await extraPayments.create(makeRecord(13, 5_000_000));

    await prisma.simulation.delete({ where: { id: SIM } });

    expect(await prisma.extraPayment.count()).toBe(0);
  });

  it('CASCADE: apagar o usuário apaga simulações e aportes', async () => {
    await extraPayments.create(makeRecord(13, 5_000_000));

    await prisma.user.delete({ where: { id: uuidFor('user-1') } });

    expect(await prisma.simulation.count()).toBe(0);
    expect(await prisma.extraPayment.count()).toBe(0);
  });

  it('FK: aporte para simulação inexistente é rejeitado pelo banco', async () => {
    const orfao = ExtraPaymentRecord.create({
      id: new UuidGenerator().generate(),
      simulationId: uuidFor('nao-existe'),
      monthNumber: 1,
      amount: Money.fromCents(1000),
      strategy: 'REDUCE_TERM',
      createdAt: new Date(),
    });

    await expect(extraPayments.create(orfao)).rejects.toThrow();
  });

  describe('integrado com o caso de uso', () => {
    it('registra o aporte e devolve o impacto real no contrato', async () => {
      const useCase = new AddExtraPaymentUseCase(
        simulations,
        extraPayments,
        new UuidGenerator(),
        new FixedClock(new Date('2026-02-01T00:00:00Z')),
      );

      const result = await useCase.execute({
        simulationId: SIM,
        userId: uuidFor('user-1'),
        monthNumber: 13,
        amountCents: 5_000_000,
        strategy: 'REDUCE_TERM',
      });

      expect(result.newTermMonths).toBeLessThan(360);
      expect(result.summary.interestSaved).toBeGreaterThan(0);
      expect(await prisma.extraPayment.count()).toBe(1);
    });

    it('VALIDA ANTES DE PERSISTIR: aporte inválido não deixa rastro no banco', async () => {
      const useCase = new AddExtraPaymentUseCase(
        simulations,
        extraPayments,
        new UuidGenerator(),
        new FixedClock(new Date('2026-02-01T00:00:00Z')),
      );

      await expect(
        useCase.execute({
          simulationId: SIM,
          userId: uuidFor('user-1'),
          monthNumber: 999,
          amountCents: 5_000_000,
          strategy: 'REDUCE_TERM',
        }),
      ).rejects.toThrow(ExtraPaymentOutOfRangeError);

      expect(await prisma.extraPayment.count()).toBe(0);
    });
  });
});
