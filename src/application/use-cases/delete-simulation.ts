import type { SimulationRepository } from '../../domain/repositories/simulation-repository';
import { findOwnedSimulation } from './find-owned-simulation';

export interface DeleteSimulationInput {
  readonly simulationId: string;
  readonly userId: string;
}

/**
 * Remove uma simulação do próprio usuário.
 *
 * Busca antes de apagar, mesmo que o repositório pudesse fazer `DELETE ... WHERE id
 * AND userId` numa tacada só: sem a busca, apagar algo inexistente e apagar algo
 * alheio seriam ambos silenciosos, e o cliente receberia sucesso sem que nada
 * tivesse acontecido.
 */
export class DeleteSimulationUseCase {
  constructor(private readonly simulations: SimulationRepository) {}

  async execute(input: DeleteSimulationInput): Promise<void> {
    const simulation = await findOwnedSimulation(
      this.simulations,
      input.simulationId,
      input.userId,
    );

    await this.simulations.delete(simulation);
  }
}
