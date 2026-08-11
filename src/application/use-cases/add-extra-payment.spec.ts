import { makeSimulation } from '../../../test/builders/simulation-builder';
import { InMemoryExtraPaymentRepository } from '../../../test/fakes/in-memory-extra-payment-repository';
import { InMemorySimulationRepository } from '../../../test/fakes/in-memory-simulation-repository';
import {
  ExtraPaymentExceedsBalanceError,
  ExtraPaymentOutOfRangeError,
} from '../../domain/errors/domain-errors';
import { FixedClock } from '../ports/clock';
import { SequentialIdGenerator } from '../ports/id-generator';
import { AddExtraPaymentUseCase } from './add-extra-payment';

function makeUseCase(): {
  useCase: AddExtraPaymentUseCase;
  extras: InMemoryExtraPaymentRepository;
} {
  const simulations = new InMemorySimulationRepository();
  simulations.items.push(makeSimulation({ id: 'sim-1', userId: 'user-1' }));
  const extras = new InMemoryExtraPaymentRepository();

  return {
    useCase: new AddExtraPaymentUseCase(
      simulations,
      extras,
      new SequentialIdGenerator('ep'),
      new FixedClock(new Date('2026-02-01T00:00:00Z')),
    ),
    extras,
  };
}

const aporte = {
  simulationId: 'sim-1',
  userId: 'user-1',
  monthNumber: 13,
  amountCents: 5_000_000,
  strategy: 'REDUCE_TERM' as const,
};

describe('AddExtraPaymentUseCase', () => {
  it('registra o aporte e devolve o impacto no contrato', async () => {
    const { useCase, extras } = makeUseCase();

    const result = await useCase.execute(aporte);

    expect(extras.items).toHaveLength(1);
    expect(result.summary.interestSaved).toBeGreaterThan(0);
    expect(result.summary.monthsSaved).toBeGreaterThan(0);
    expect(result.newTermMonths).toBeLessThan(360);
  });

  it('REDUCE_INSTALLMENT mantém o prazo', async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ ...aporte, strategy: 'REDUCE_INSTALLMENT' });

    expect(result.newTermMonths).toBe(360);
    expect(result.summary.monthsSaved).toBe(0);
    expect(result.summary.interestSaved).toBeGreaterThan(0);
  });

  it('o recálculo acumula aportes anteriores, não considera só o novo', async () => {
    const { useCase } = makeUseCase();

    const primeiro = await useCase.execute(aporte);
    const segundo = await useCase.execute({ ...aporte, monthNumber: 24 });

    expect(segundo.summary.interestSaved).toBeGreaterThan(primeiro.summary.interestSaved);
    expect(segundo.summary.totalExtraPaid).toBe(10_000_000);
  });

  it('VALIDA ANTES DE PERSISTIR: aporte fora do prazo não suja o banco', async () => {
    const { useCase, extras } = makeUseCase();

    await expect(useCase.execute({ ...aporte, monthNumber: 400 })).rejects.toThrow(
      ExtraPaymentOutOfRangeError,
    );

    expect(extras.items).toHaveLength(0);
  });

  it('VALIDA ANTES DE PERSISTIR: aporte maior que o saldo não suja o banco', async () => {
    const { useCase, extras } = makeUseCase();

    await expect(useCase.execute({ ...aporte, amountCents: 99_000_000 })).rejects.toThrow(
      ExtraPaymentExceedsBalanceError,
    );

    expect(extras.items).toHaveLength(0);
  });

  it('rejeita o segundo aporte quando a soma dos dois excede o saldo', async () => {
    // Só é detectável porque o recálculo considera o histórico: isolado, cada
    // aporte caberia.
    const { useCase, extras } = makeUseCase();

    await useCase.execute({ ...aporte, monthNumber: 2, amountCents: 30_000_000 });
    await expect(
      useCase.execute({ ...aporte, monthNumber: 3, amountCents: 30_000_000 }),
    ).rejects.toThrow(ExtraPaymentExceedsBalanceError);

    expect(extras.items).toHaveLength(1);
  });

  it('usa o relógio e o gerador de id injetados', async () => {
    const { useCase, extras } = makeUseCase();

    const result = await useCase.execute(aporte);

    expect(result.id).toBe('ep-1');
    expect(extras.items[0]?.createdAt).toEqual(new Date('2026-02-01T00:00:00Z'));
  });
});
