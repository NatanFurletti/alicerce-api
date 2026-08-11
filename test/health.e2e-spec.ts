import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';

/** Contrato de saída do endpoint, para não depender do `any` do supertest. */
interface HealthBody {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com o status da aplicação', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = response.body as HealthBody;

    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
