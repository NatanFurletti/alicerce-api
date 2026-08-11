import type { Simulation } from '../../src/domain/entities/simulation';
import type {
  Page,
  PageQuery,
  SimulationRepository,
} from '../../src/domain/repositories/simulation-repository';

/**
 * Repositório de simulações em memória.
 *
 * Replica as garantias que a implementação Prisma terá de honrar na Etapa 3: escopo
 * por usuário na busca, ordenação por data decrescente e paginação. Se o fake e o real
 * divergirem nessas garantias, os testes de caso de uso passam e a produção quebra —
 * por isso a Etapa 3 vai rodar os mesmos casos contra o Postgres.
 */
export class InMemorySimulationRepository implements SimulationRepository {
  readonly items: Simulation[] = [];

  create(simulation: Simulation): Promise<void> {
    this.items.push(simulation);
    return Promise.resolve();
  }

  findByIdAndUserId(id: string, userId: string): Promise<Simulation | null> {
    const found = this.items.find(
      (simulation) => simulation.id === id && simulation.userId === userId,
    );
    return Promise.resolve(found ?? null);
  }

  listByUserId(userId: string, query: PageQuery): Promise<Page<Simulation>> {
    const owned = this.items
      .filter((simulation) => simulation.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (query.page - 1) * query.pageSize;

    return Promise.resolve({
      items: owned.slice(start, start + query.pageSize),
      total: owned.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  delete(simulation: Simulation): Promise<void> {
    const index = this.items.findIndex((item) => item.id === simulation.id);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
    return Promise.resolve();
  }
}
