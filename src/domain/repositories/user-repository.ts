import type { User } from '../entities/user';
import type { Email } from '../value-objects/email';

/**
 * Contrato de persistência de usuários.
 *
 * Vive em `domain/` e é implementado em `infra/database/` (ADR-001): a dependência
 * aponta para dentro, então o caso de uso não sabe se por trás há Postgres, memória ou
 * um arquivo. É o que permite testar toda a Etapa 2 sem subir banco.
 *
 * Sem métodos de listagem genérica de propósito — o repositório expõe as consultas que
 * o domínio realmente precisa, e não um CRUD especulativo.
 */
export interface UserRepository {
  create(user: User): Promise<void>;

  findById(id: string): Promise<User | null>;

  /** Usado no login e na checagem de e-mail duplicado no cadastro. */
  findByEmail(email: Email): Promise<User | null>;
}
