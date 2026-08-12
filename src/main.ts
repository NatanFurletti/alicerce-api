import 'reflect-metadata';
// Carrega o .env antes de qualquer outro import ler process.env.
// A ordem importa: `loadEnv()` roda no boot e falha se DATABASE_URL não existir.
import 'dotenv/config';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { setupSwagger } from './infra/http/swagger';
import { loadEnv } from './shared/config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta propriedades não declaradas no DTO...
      whitelist: true,
      // ...e REJEITA a requisição se elas existirem, em vez de ignorá-las em silêncio.
      // É a mitigação registrada na ADR-007 para o risco de um campo sem decorator
      // passar batido: mandar `userId` no corpo de POST /simulations agora dá 400,
      // em vez de ser descartado sem aviso.
      forbidNonWhitelisted: true,
      // Converte tipos primitivos conforme o DTO — indispensável para query strings,
      // que chegam sempre como texto.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  setupSwagger(app);

  // 0.0.0.0 e não localhost: dentro de um container, escutar só na interface de
  // loopback torna a aplicação inalcançável de fora dele.
  await app.listen(env.port, '0.0.0.0');
  Logger.log(`Alicerce ouvindo em http://localhost:${env.port}`, 'Bootstrap');
  Logger.log(`Documentação em http://localhost:${env.port}/docs`, 'Bootstrap');
}

void bootstrap();
