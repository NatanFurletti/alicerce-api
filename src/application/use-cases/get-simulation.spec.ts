import { InMemorySimulationRepository } from '../../../test/fakes/in-memory-simulation-repository';
import { Simulation, type SimulationProps } from '../../domain/entities/simulation';
import { SimulationNotFoundError } from '../../domain/errors/domain-errors';
import { Money } from '../../domain/value-objects/money.vo';
import { GetSimulationUseCase } from './get-simulation';

function makeSimulation(id: string, userId: string): Simulation {
  const props: SimulationProps = {
    id,
    userId,
    propertyValue: Money.fromReais(500_000),
    downPayment: Money.fromReais(100_000),
    termMonths: 360,
    annualRate: 0.0975,
    rateConvention: 'EFFECTIVE',
    amortizationSystem: 'SAC',
    charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
    createdAt: new Date('2026-01-15T10:00:00Z'),
  };
  return Simulation.restore(props);
}

describe('GetSimulationUseCase', () => {
  it('devolve a simulação do próprio usuário', async () => {
    const repository = new InMemorySimulationRepository();
    await repository.create(makeSimulation('sim-1', 'user-1'));

    const result = await new GetSimulationUseCase(repository).execute({
      simulationId: 'sim-1',
      userId: 'user-1',
    });

    expect(result.id).toBe('sim-1');
    expect(result.summary.months).toBe(360);
  });

  it('devolve os parâmetros persistidos, omitindo a renda quando não foi informada', async () => {
    const repository = new InMemorySimulationRepository();
    await repository.create(makeSimulation('sim-1', 'user-1'));

    const result = await new GetSimulationUseCase(repository).execute({
      simulationId: 'sim-1',
      userId: 'user-1',
    });

    expect(result.input).toEqual({
      propertyValueCents: 50_000_000,
      downPaymentCents: 10_000_000,
      termMonths: 360,
      annualRate: 0.0975,
      rateConvention: 'EFFECTIVE',
      amortizationSystem: 'SAC',
      charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
    });
    expect(result.input).not.toHaveProperty('monthlyIncomeCents');
  });

  it('ESCOPO: usuário A não acessa simulação de B', async () => {
    // A garantia central do SPEC seção 4, exercitada no nível do caso de uso — antes
    // mesmo de existir HTTP, guard ou JWT.
    const repository = new InMemorySimulationRepository();
    await repository.create(makeSimulation('sim-1', 'user-1'));

    await expect(
      new GetSimulationUseCase(repository).execute({
        simulationId: 'sim-1',
        userId: 'user-2',
      }),
    ).rejects.toThrow(SimulationNotFoundError);
  });

  it('simulação inexistente e simulação alheia produzem o MESMO erro', async () => {
    // Deliberado: distinguir os dois casos vazaria a existência de recursos de outros
    // usuários — um atacante enumeraria ids pelo código de status. A tradução para
    // HTTP acontece no filter da Etapa 5.
    const repository = new InMemorySimulationRepository();
    await repository.create(makeSimulation('sim-1', 'user-1'));
    const useCase = new GetSimulationUseCase(repository);

    const alheia = useCase
      .execute({ simulationId: 'sim-1', userId: 'user-2' })
      .catch((error: unknown) => error);
    const inexistente = useCase
      .execute({ simulationId: 'nao-existe', userId: 'user-2' })
      .catch((error: unknown) => error);

    expect(((await alheia) as Error).constructor).toBe(
      ((await inexistente) as Error).constructor,
    );
  });

  it('inclui CET e totais no resumo', async () => {
    const repository = new InMemorySimulationRepository();
    await repository.create(makeSimulation('sim-1', 'user-1'));

    const result = await new GetSimulationUseCase(repository).execute({
      simulationId: 'sim-1',
      userId: 'user-1',
    });

    expect(result.cet.annualRate).toBeGreaterThan(0.0975);
    expect(result.summary.totalAmortization).toBe(40_000_000);
  });
});
