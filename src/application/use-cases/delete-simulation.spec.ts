import { makeSimulation } from '../../../test/builders/simulation-builder';
import { InMemorySimulationRepository } from '../../../test/fakes/in-memory-simulation-repository';
import { SimulationNotFoundError } from '../../domain/errors/domain-errors';
import { DeleteSimulationUseCase } from './delete-simulation';

describe('DeleteSimulationUseCase', () => {
  function makeRepository(): InMemorySimulationRepository {
    const repository = new InMemorySimulationRepository();
    repository.items.push(makeSimulation({ id: 'sim-1', userId: 'user-1' }));
    repository.items.push(makeSimulation({ id: 'sim-2', userId: 'user-1' }));
    return repository;
  }

  it('remove a simulação do próprio usuário', async () => {
    const repository = makeRepository();

    await new DeleteSimulationUseCase(repository).execute({
      simulationId: 'sim-1',
      userId: 'user-1',
    });

    expect(repository.items).toHaveLength(1);
    expect(repository.items[0]?.id).toBe('sim-2');
  });

  it('apagar duas vezes falha na segunda — não é silencioso', async () => {
    // Sem a busca prévia, a segunda chamada devolveria sucesso sem ter feito nada.
    const repository = makeRepository();
    const useCase = new DeleteSimulationUseCase(repository);
    const args = { simulationId: 'sim-1', userId: 'user-1' };

    await useCase.execute(args);

    await expect(useCase.execute(args)).rejects.toThrow(SimulationNotFoundError);
  });

  it('simulação inexistente lança em vez de sucesso vazio', async () => {
    await expect(
      new DeleteSimulationUseCase(makeRepository()).execute({
        simulationId: 'nao-existe',
        userId: 'user-1',
      }),
    ).rejects.toThrow(SimulationNotFoundError);
  });
});
