import { makeSimulation } from '../../../test/builders/simulation-builder';
import { InMemorySimulationRepository } from '../../../test/fakes/in-memory-simulation-repository';
import { InvalidPaginationError } from '../../domain/errors/domain-errors';
import { GetScheduleUseCase } from './get-schedule';
import { ListSimulationsUseCase } from './list-simulations';
import { MAX_PAGE_SIZE, normalizePageQuery } from './pagination';

describe('ListSimulationsUseCase', () => {
  function makeRepository(): InMemorySimulationRepository {
    const repository = new InMemorySimulationRepository();
    for (let i = 1; i <= 25; i += 1) {
      repository.items.push(
        makeSimulation({
          id: `sim-${i}`,
          userId: 'user-1',
          createdAt: new Date(2026, 0, i),
        }),
      );
    }
    repository.items.push(makeSimulation({ id: 'alheia', userId: 'user-2' }));
    return repository;
  }

  it('lista apenas as simulações do próprio usuário', async () => {
    const result = await new ListSimulationsUseCase(makeRepository()).execute({
      userId: 'user-1',
      pageSize: 100,
    });

    expect(result.total).toBe(25);
    expect(result.items.every((item) => item.id !== 'alheia')).toBe(true);
  });

  it('ordena por data decrescente — mais recentes primeiro', async () => {
    const result = await new ListSimulationsUseCase(makeRepository()).execute({
      userId: 'user-1',
    });

    expect(result.items[0]?.id).toBe('sim-25');
  });

  it('pagina corretamente', async () => {
    const useCase = new ListSimulationsUseCase(makeRepository());

    const first = await useCase.execute({ userId: 'user-1', page: 1, pageSize: 10 });
    const last = await useCase.execute({ userId: 'user-1', page: 3, pageSize: 10 });

    expect(first.items).toHaveLength(10);
    expect(last.items).toHaveLength(5);
    expect(last.total).toBe(25);
  });

  it('página além do fim devolve lista vazia, não erro', async () => {
    const result = await new ListSimulationsUseCase(makeRepository()).execute({
      userId: 'user-1',
      page: 99,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(25);
  });

  it('usuário sem simulações recebe página vazia', async () => {
    const result = await new ListSimulationsUseCase(makeRepository()).execute({
      userId: 'ninguem',
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('o item da lista é enxuto: sem CET nem totais', async () => {
    // Calcular resumo de cada linha custaria uma tabela de 420 meses e uma TIR por
    // item. O detalhe tem endpoint próprio.
    const result = await new ListSimulationsUseCase(makeRepository()).execute({
      userId: 'user-1',
    });

    expect(result.items[0]).not.toHaveProperty('cet');
    expect(result.items[0]).not.toHaveProperty('summary');
    expect(result.items[0]).toHaveProperty('financedAmountCents');
  });
});

describe('normalizePageQuery', () => {
  it('aplica defaults', () => {
    expect(normalizePageQuery(undefined, undefined)).toEqual({ page: 1, pageSize: 20 });
  });

  it('rejeita página inválida', () => {
    for (const page of [0, -1, 1.5]) {
      expect(() => normalizePageQuery(page, 10)).toThrow(InvalidPaginationError);
    }
  });

  it('rejeita pageSize inválido', () => {
    for (const size of [0, -5, 2.5]) {
      expect(() => normalizePageQuery(1, size)).toThrow(InvalidPaginationError);
    }
  });

  it('rejeita pageSize acima do teto — proteção contra exaustão de memória', () => {
    expect(() => normalizePageQuery(1, MAX_PAGE_SIZE + 1)).toThrow(
      InvalidPaginationError,
    );
    expect(() => normalizePageQuery(1, MAX_PAGE_SIZE)).not.toThrow();
  });
});

describe('GetScheduleUseCase', () => {
  function makeRepository(): InMemorySimulationRepository {
    const repository = new InMemorySimulationRepository();
    repository.items.push(makeSimulation({ id: 'sim-1', userId: 'user-1' }));
    return repository;
  }

  it('devolve a tabela paginada, com o total de meses do contrato', async () => {
    const result = await new GetScheduleUseCase(makeRepository()).execute({
      simulationId: 'sim-1',
      userId: 'user-1',
      page: 1,
      pageSize: 12,
    });

    expect(result.items).toHaveLength(12);
    expect(result.total).toBe(360);
    expect(result.items[0]?.month).toBe(1);
  });

  it('a última página traz o resto e fecha o saldo em zero', async () => {
    const result = await new GetScheduleUseCase(makeRepository()).execute({
      simulationId: 'sim-1',
      userId: 'user-1',
      page: 18,
      pageSize: 20,
    });

    expect(result.items).toHaveLength(20);
    expect(result.items.at(-1)?.month).toBe(360);
    expect(result.items.at(-1)?.closingBalance).toBe(0);
  });

  it('páginas consecutivas encadeiam os saldos sem buraco', async () => {
    const useCase = new GetScheduleUseCase(makeRepository());

    const p1 = await useCase.execute({
      simulationId: 'sim-1',
      userId: 'user-1',
      page: 1,
      pageSize: 10,
    });
    const p2 = await useCase.execute({
      simulationId: 'sim-1',
      userId: 'user-1',
      page: 2,
      pageSize: 10,
    });

    expect(p2.items[0]?.openingBalance).toBe(p1.items.at(-1)?.closingBalance);
  });
});
