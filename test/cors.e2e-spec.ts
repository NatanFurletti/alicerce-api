import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/infra/database/prisma/prisma.service';
import { setupCors } from '../src/infra/http/cors';
import { createTestApp } from './helpers/app';

const FRONT = 'http://localhost:3001';

let app: INestApplication<App>;
let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp((nest) => setupCors(nest, [FRONT])));
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('CORS (e2e)', () => {
  it('responde o preflight de uma origem autorizada, liberando o header Authorization', async () => {
    // O preflight chega SEM token: se o guard global rodasse antes do CORS, toda
    // rota protegida falharia no navegador com 401 antes mesmo da requisição real.
    const response = await request(app.getHttpServer())
      .options('/simulations')
      .set('Origin', FRONT)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(FRONT);
    expect(response.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });

  it('inclui o header também nas respostas de erro, para o front conseguir ler o `code`', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Origin', FRONT)
      .expect(401);

    expect(response.headers['access-control-allow-origin']).toBe(FRONT);
  });

  it('não libera origem fora da lista', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://site-malicioso.com')
      .expect(200);

    // A requisição é atendida (CORS não é autenticação), mas sem o header o
    // navegador impede o site de ler a resposta.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
