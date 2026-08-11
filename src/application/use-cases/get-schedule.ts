import type { ScheduleEntry } from '../../domain/finance/types';
import type {
  Page,
  SimulationRepository,
} from '../../domain/repositories/simulation-repository';
import { findOwnedSimulation } from './find-owned-simulation';
import { normalizePageQuery } from './pagination';

export interface GetScheduleInput {
  readonly simulationId: string;
  readonly userId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Tabela de amortização paginada.
 *
 * **A paginação acontece em memória, não no banco** — consequência direta da ADR-003:
 * a tabela não está persistida, então não há `LIMIT/OFFSET` a fazer. O caso de uso
 * recalcula as até 420 linhas e fatia o pedaço pedido.
 *
 * Recalcular tudo para devolver 20 linhas soa desperdício, mas 420 iterações de
 * aritmética inteira custam microssegundos — muito menos que o ida e volta ao banco
 * que a alternativa exigiria. E é o preço já aceito conscientemente na ADR-003, com
 * cache previsto na Etapa 7 caso o perfil de uso mude.
 */
export class GetScheduleUseCase {
  constructor(private readonly simulations: SimulationRepository) {}

  async execute(input: GetScheduleInput): Promise<Page<ScheduleEntry>> {
    const query = normalizePageQuery(input.page, input.pageSize);
    const simulation = await findOwnedSimulation(
      this.simulations,
      input.simulationId,
      input.userId,
    );

    const schedule = simulation.buildSchedule();
    const start = (query.page - 1) * query.pageSize;

    return {
      items: schedule.slice(start, start + query.pageSize),
      total: schedule.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
