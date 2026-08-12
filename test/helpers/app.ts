import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infra/database/prisma/prisma.service';
import { makePrismaService } from './database';

/**
 * Sobe a aplicação completa apontando para o banco de TESTE.
 *
 * Usa `AppModule` de verdade — mesmos pipes, filtros e guards da produção. Substituir
 * o `PrismaService` é a única diferença, e ela é o que garante que nenhum teste
 * escreva no banco de desenvolvimento.
 */
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const prisma = makePrismaService();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app: INestApplication<App> = moduleRef.createNestApplication();

  // O ValidationPipe é configurado em `main.ts`, que não roda em teste. Repetir a
  // configuração aqui mantém o comportamento idêntico ao de produção.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.init();

  return { app, prisma };
}
