import { makeSimulation } from '../../../test/builders/simulation-builder';
import { InMemoryExtraPaymentRepository } from '../../../test/fakes/in-memory-extra-payment-repository';
import { InMemorySimulationRepository } from '../../../test/fakes/in-memory-simulation-repository';
import { SimulationNotFoundError } from '../../domain/errors/domain-errors';
import { FixedClock } from '../ports/clock';
import { SequentialIdGenerator } from '../ports/id-generator';
import { AddExtraPaymentUseCase } from './add-extra-payment';
import { DeleteSimulationUseCase } from './delete-simulation';
import { GetScheduleUseCase } from './get-schedule';
import { GetSimulationUseCase } from './get-simulation';

/**
 * A garantia transversal do SPEC: um usuário nunca acessa simulação de outro.
 *
 * Este arquivo existe para que a regra seja testada UMA vez contra TODOS os casos de
 * uso que operam sobre uma simulação existente. Um caso de uso novo que esqueça o
 * escopo precisa ser adicionado aqui — e se não for, o buraco fica visível na lista.
 */
describe('escopo por usuário — nenhum caso de uso vaza simulação alheia', () => {
  const DONO = 'user-1';
  const INTRUSO = 'user-2';

  function makeRepositories(): {
    simulations: InMemorySimulationRepository;
    extras: InMemoryExtraPaymentRepository;
  } {
    const simulations = new InMemorySimulationRepository();
    simulations.items.push(makeSimulation({ id: 'sim-1', userId: DONO }));
    return { simulations, extras: new InMemoryExtraPaymentRepository() };
  }

  it('GetSimulation nega acesso ao intruso', async () => {
    const { simulations } = makeRepositories();
    await expect(
      new GetSimulationUseCase(simulations).execute({
        simulationId: 'sim-1',
        userId: INTRUSO,
      }),
    ).rejects.toThrow(SimulationNotFoundError);
  });

  it('GetSchedule nega acesso ao intruso', async () => {
    const { simulations } = makeRepositories();
    await expect(
      new GetScheduleUseCase(simulations).execute({
        simulationId: 'sim-1',
        userId: INTRUSO,
      }),
    ).rejects.toThrow(SimulationNotFoundError);
  });

  it('DeleteSimulation nega — e não apaga nada', async () => {
    const { simulations } = makeRepositories();
    await expect(
      new DeleteSimulationUseCase(simulations).execute({
        simulationId: 'sim-1',
        userId: INTRUSO,
      }),
    ).rejects.toThrow(SimulationNotFoundError);
    expect(simulations.items).toHaveLength(1);
  });

  it('AddExtraPayment nega — e não registra nada', async () => {
    const { simulations, extras } = makeRepositories();
    await expect(
      new AddExtraPaymentUseCase(
        simulations,
        extras,
        new SequentialIdGenerator('ep'),
        new FixedClock(new Date('2026-02-01T00:00:00Z')),
      ).execute({
        simulationId: 'sim-1',
        userId: INTRUSO,
        monthNumber: 12,
        amountCents: 1_000_000,
        strategy: 'REDUCE_TERM',
      }),
    ).rejects.toThrow(SimulationNotFoundError);
    expect(extras.items).toHaveLength(0);
  });

  it('o dono continua acessando normalmente', async () => {
    const { simulations } = makeRepositories();
    const result = await new GetSimulationUseCase(simulations).execute({
      simulationId: 'sim-1',
      userId: DONO,
    });
    expect(result.id).toBe('sim-1');
  });
});
