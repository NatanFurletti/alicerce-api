import type { Simulation } from '../entities/simulation';

/** Página de resultados. Toda listagem da API é paginada (SPEC seção 4). */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface PageQuery {
  /** Página, começando em 1. */
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Contrato de persistência de simulações.
 *
 * **`findByIdAndUserId` em vez de `findById`.** A regra transversal do SPEC é que um
 * usuário nunca acessa simulação de outro. Se o repositório expusesse busca só por id,
 * cada caso de uso teria que lembrar de comparar o `userId` depois — e um esquecimento
 * vira falha de autorização. Exigir o dono na assinatura torna o vazamento difícil de
 * escrever por acidente.
 */
export interface SimulationRepository {
  create(simulation: Simulation): Promise<void>;

  /** Busca escopada ao dono. Devolve `null` se não existe OU se é de outro usuário. */
  findByIdAndUserId(id: string, userId: string): Promise<Simulation | null>;

  /** Listagem paginada das simulações de um usuário, mais recentes primeiro. */
  listByUserId(userId: string, query: PageQuery): Promise<Page<Simulation>>;

  delete(simulation: Simulation): Promise<void>;
}
