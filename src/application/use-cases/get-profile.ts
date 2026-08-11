import { InvalidTokenError } from '../../domain/errors/domain-errors';
import type { UserRepository } from '../../domain/repositories/user-repository';

export interface GetProfileOutput {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;
}

/**
 * Dados do usuário autenticado (`GET /me`).
 *
 * Recebe o id já extraído do token pelo guard — o caso de uso não conhece JWT nem
 * cabeçalho HTTP, só um identificador.
 */
export class GetProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<GetProfileOutput> {
    const user = await this.users.findById(userId);

    if (user === null) {
      // Token válido para um usuário que não existe mais: a assinatura confere, mas
      // a conta foi apagada.
      throw new InvalidTokenError('Usuário do token não existe mais.');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email.value,
      createdAt: user.createdAt,
    };
  }
}
