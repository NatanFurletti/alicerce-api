import 'reflect-metadata';
// Carrega o .env antes de qualquer outro import ler process.env.
// A ordem importa: `loadEnv()` roda no boot e falha se DATABASE_URL não existir.
import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadEnv } from './shared/config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  await app.listen(env.port);
  Logger.log(`Alicerce ouvindo em http://localhost:${env.port}`, 'Bootstrap');
}

void bootstrap();
