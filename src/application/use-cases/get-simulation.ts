import type { SimulationRepository } from '../../domain/repositories/simulation-repository';
import { toOutput, type CreateSimulationOutput } from './create-simulation';
import { findOwnedSimulation } from './find-owned-simulation';

export interface GetSimulationInput {
  readonly simulationId: string;
  readonly userId: string;
}

/** Resumo de uma simulação: totais, CET e parâmetros. Escopado ao dono. */
export class GetSimulationUseCase {
  constructor(private readonly simulations: SimulationRepository) {}

  async execute(input: GetSimulationInput): Promise<CreateSimulationOutput> {
    const simulation = await findOwnedSimulation(
      this.simulations,
      input.simulationId,
      input.userId,
    );

    return toOutput(simulation);
  }
}
