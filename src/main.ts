import 'reflect-metadata';

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
