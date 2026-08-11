import { Injectable } from '@nestjs/common';

import type { Simulation } from '../../../domain/entities/simulation';
import type {
  Page,
  PageQuery,
  SimulationRepository,
} from '../../../domain/repositories/simulation-repository';
import { SimulationMapper } from '../mappers/simulation.mapper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaSimulationRepository implements SimulationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(simulation: Simulation): Promise<void> {
    await this.prisma.simulation.create({
      data: SimulationMapper.toPersistence(simulation),
    });
  }

  /**
   * O `userId` entra no `where`, não numa comparação depois da busca.
   *
   * Filtrar no banco e não em memória importa por dois motivos: a consulta usa o
   * índice `(user_id, created_at DESC)`, e o dado de outro usuário nunca chega a sair
   * do Postgres — não há como vazá-lo por um log ou um erro de fluxo.
   */
  async findByIdAndUserId(id: string, userId: string): Promise<Simulation | null> {
    const row = await this.prisma.simulation.findFirst({ where: { id, userId } });

    return row === null ? null : SimulationMapper.toDomain(row);
  }

  /**
   * `$transaction` para a contagem e a página: sem isso, uma inserção concorrente
   * entre as duas consultas produziria um `total` incoerente com os `items`.
   *
   * O `orderBy` é obrigatório, não estético — sem ele o Postgres não garante ordem
   * alguma, e a paginação passaria a repetir ou pular registros entre páginas. O
   * contrato compartilhado cobre exatamente isso.
   */
  async listByUserId(userId: string, query: PageQuery): Promise<Page<Simulation>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.simulation.count({ where: { userId } }),
      this.prisma.simulation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => SimulationMapper.toDomain(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async delete(simulation: Simulation): Promise<void> {
    // Escopado ao dono também no delete: `deleteMany` não estoura se nada casar, o
    // que é o comportamento desejado — o caso de uso já verificou a propriedade.
    await this.prisma.simulation.deleteMany({
      where: { id: simulation.id, userId: simulation.userId },
    });
  }
}
