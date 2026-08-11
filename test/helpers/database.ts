import { execSync } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../src/infra/database/prisma/prisma.service';

/**
 * URL do banco de TESTE — container separado, na porta 5433, com dados em tmpfs.
 *
 * A separação é física e não por convenção: um teste não tem como escrever no banco de
 * desenvolvimento porque aponta para outro container. Se `DATABASE_URL_TEST` não
 * estiver definida, falha alto em vez de cair no default e apagar o banco de dev.
 */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;

  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL_TEST não definida. Copie .env.example para .env — os testes de ' +
        'integração nunca devem apontar para o banco de desenvolvimento.',
    );
  }

  return url;
}

let migrated = false;

/**
 * Aplica as migrations no banco de teste, uma vez por execução da suíte.
 *
 * `migrate deploy` e não `migrate dev`: aplica o que já existe em `prisma/migrations/`
 * sem tentar gerar migration nova nem pedir confirmação. É o mesmo comando que roda em
 * produção — então o teste exercita exatamente o caminho de deploy, e uma migration
 * quebrada aparece aqui antes de aparecer no servidor.
 */
export function applyMigrations(): void {
  if (migrated) return;

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });

  migrated = true;
}

export function makePrismaService(): PrismaService {
  // Aponta explicitamente para o banco de teste, ignorando a DATABASE_URL do ambiente.
  return new PrismaService({
    datasources: { db: { url: testDatabaseUrl() } },
  });
}

/**
 * Esvazia as tabelas entre testes (ADR-017).
 *
 * `TRUNCATE ... CASCADE` numa instrução só: respeita as chaves estrangeiras sem exigir
 * ordem de deleção, e `RESTART IDENTITY` zera sequências. Cada teste começa de um
 * estado conhecido, e o caminho exercitado é o real — com `COMMIT`, e não uma
 * transação revertida que nunca chega a confirmar nada.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "extra_payments", "simulations", "users" RESTART IDENTITY CASCADE;',
  );
}
