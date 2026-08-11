import type { Simulation } from '../../domain/entities/simulation';
import { SimulationNotFoundError } from '../../domain/errors/domain-errors';
import type { SimulationRepository } from '../../domain/repositories/simulation-repository';

/**
 * Busca uma simulação garantindo que ela pertence a quem pediu, ou lança.
 *
 * Todo caso de uso que opera sobre uma simulação existente passa por aqui. Concentrar
 * a verificação num ponto único significa que "usuário A não vê dado de B" é
 * implementado **uma vez** — e não seis vezes, com cinco chances de esquecer.
 */
export async function findOwnedSimulation(
  repository: SimulationRepository,
  simulationId: string,
  userId: string,
): Promise<Simulation> {
  const simulation = await repository.findByIdAndUserId(simulationId, userId);

  if (simulation === null) {
    throw new SimulationNotFoundError(simulationId);
  }

  return simulation;
}
