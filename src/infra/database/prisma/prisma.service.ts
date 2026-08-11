import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como provider do Nest.
 *
 * `$connect` no boot em vez de deixar a conexão preguiçosa: assim uma credencial
 * errada derruba a aplicação na inicialização, e não na primeira requisição de um
 * usuário. `$disconnect` no shutdown evita conexões penduradas entre os testes e2e.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
