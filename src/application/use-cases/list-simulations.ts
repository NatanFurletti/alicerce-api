import type {
  Page,
  SimulationRepository,
} from '../../domain/repositories/simulation-repository';
import { normalizePageQuery } from './pagination';

export interface ListSimulationsInput {
  readonly userId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** Item da listagem: enxuto de propósito, sem CET nem totais. */
export interface SimulationListItem {
  readonly id: string;
  readonly propertyValueCents: number;
  readonly financedAmountCents: number;
  readonly termMonths: number;
  readonly annualRate: number;
  readonly amortizationSystem: string;
  readonly createdAt: Date;
}

/**
 * Lista as simulações do usuário, paginadas e mais recentes primeiro.
 *
 * Cada item traz só os parâmetros — **sem CET e sem totais**. Calcular o resumo de
 * cada linha custaria uma tabela de até 420 meses por simulação e uma TIR por item: um
 * `pageSize=100` faria 42 mil iterações de amortização mais 100 buscas de raiz para
 * renderizar uma lista. O detalhe tem endpoint próprio.
 */
export class ListSimulationsUseCase {
  constructor(private readonly simulations: SimulationRepository) {}

  async execute(input: ListSimulationsInput): Promise<Page<SimulationListItem>> {
    const query = normalizePageQuery(input.page, input.pageSize);
    const page = await this.simulations.listByUserId(input.userId, query);

    return {
      ...page,
      items: page.items.map((simulation) => ({
        id: simulation.id,
        propertyValueCents: simulation.propertyValue.cents,
        financedAmountCents: simulation.financedAmount.cents,
        termMonths: simulation.termMonths,
        annualRate: simulation.annualRate,
        amortizationSystem: simulation.amortizationSystem,
        createdAt: simulation.createdAt,
      })),
    };
  }
}
