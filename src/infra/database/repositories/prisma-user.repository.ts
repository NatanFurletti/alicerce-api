import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { User } from '../../../domain/entities/user';
import { EmailAlreadyInUseError } from '../../../domain/errors/domain-errors';
import type { UserRepository } from '../../../domain/repositories/user-repository';
import type { Email } from '../../../domain/value-objects/email';
import { UserMapper } from '../mappers/user.mapper';
import { PrismaService } from '../prisma/prisma.service';

/** Código do Prisma para violação de constraint UNIQUE. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria o usuário, traduzindo violação de unicidade para erro de domínio.
   *
   * **Este `catch` é a garantia real de unicidade de e-mail**, não a checagem
   * `findByEmail` do caso de uso. Entre aquela consulta e este `INSERT` existe uma
   * janela em que outra requisição pode inserir o mesmo e-mail — e a janela é larga
   * justamente porque o hash da senha é deliberadamente lento (argon2 leva centenas
   * de milissegundos).
   *
   * A checagem prévia serve para mensagem amigável e para evitar o custo do hash no
   * caso comum; a constraint `UNIQUE` é o que efetivamente impede o duplicado, porque
   * verificação e escrita são atômicas dentro do banco. Traduzir o `P2002` aqui faz
   * as duas rotas produzirem o mesmo erro de domínio.
   */
  async create(user: User): Promise<void> {
    try {
      await this.prisma.user.create({ data: UserMapper.toPersistence(user) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new EmailAlreadyInUseError(user.email.value);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    return row === null ? null : UserMapper.toDomain(row);
  }

  async findByEmail(email: Email): Promise<User | null> {
    // `email.value` já vem normalizado pelo value object, que é o que faz a busca
    // casar com o índice UNIQUE independentemente da caixa digitada pelo usuário.
    const row = await this.prisma.user.findUnique({ where: { email: email.value } });

    return row === null ? null : UserMapper.toDomain(row);
  }
}
