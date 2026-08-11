import type { User } from '../../src/domain/entities/user';
import type { UserRepository } from '../../src/domain/repositories/user-repository';
import type { Email } from '../../src/domain/value-objects/email';

/**
 * Repositório de usuários em memória, para os testes de caso de uso.
 *
 * É um **fake**, não um mock: tem comportamento real (guarda, busca, respeita
 * unicidade de e-mail) em vez de devolver respostas programadas. Isso deixa o teste
 * afirmar sobre resultado — "o usuário foi criado?" — em vez de sobre interação —
 * "o método `create` foi chamado uma vez?". Testes de interação quebram em toda
 * refatoração; testes de resultado, não.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly items: User[] = [];

  create(user: User): Promise<void> {
    this.items.push(user);
    return Promise.resolve();
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.items.find((user) => user.id === id) ?? null);
  }

  findByEmail(email: Email): Promise<User | null> {
    return Promise.resolve(this.items.find((user) => user.email.equals(email)) ?? null);
  }
}
