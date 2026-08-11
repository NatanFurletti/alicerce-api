import { randomUUID } from 'node:crypto';

/**
 * Geração de identificadores.
 *
 * **Por que a aplicação gera o id, e não o banco.** Com id vindo de sequência do
 * Postgres, a entidade só existe de verdade depois do `INSERT` — o caso de uso teria
 * que criar um objeto incompleto, persistir e então preencher o id. Gerando antes, a
 * entidade nasce válida e completa, e o repositório vira um detalhe de armazenamento.
 *
 * `randomUUID` usa o CSPRNG do sistema: ids não são adivinháveis nem enumeráveis, o
 * que importa num recurso escopado por usuário.
 */
export interface IdGenerator {
  generate(): string;
}

/** Implementação de produção: UUID v4. */
export class UuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}

/** Ids previsíveis (`prefixo-1`, `prefixo-2`, ...) para testes legíveis. */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  generate(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}
