import 'dotenv/config';

import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';

/**
 * Verifica o rate limiting com os limites REAIS de produção.
 *
 * A suíte principal (`api.e2e-spec.ts`) roda com os tetos relaxados, porque dezenas de
 * cadastros do mesmo IP em segundos estourariam o limite em testes que nada têm a ver
 * com isso. Relaxar lá e verificar aqui é mais honesto que desligar o guard em teste —
 * que deixaria a funcionalidade sem cobertura alguma.
 *
 * Os limites são declarados localmente para não depender de `NODE_ENV`.
 */
@Controller('limitada')
class LimitadaController {
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Get()
  get(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('livre')
class LivreController {
  @Get()
  get(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  controllers: [LimitadaController, LivreController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleTestModule {}

describe('rate limiting (e2e, limites de produção)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // App nova a cada teste: o contador do throttler é in-memory e precisa zerar.
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottleTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('permite requisições até o limite', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).get('/limitada').expect(200);
    }
  });

  it('BLOQUEIA com 429 ao ultrapassar o limite', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).get('/limitada').expect(200);
    }

    await request(app.getHttpServer()).get('/limitada').expect(429);
  });

  it('o bloqueio persiste nas requisições seguintes da mesma janela', async () => {
    for (let i = 0; i < 4; i += 1) {
      await request(app.getHttpServer()).get('/limitada');
    }

    await request(app.getHttpServer()).get('/limitada').expect(429);
    await request(app.getHttpServer()).get('/limitada').expect(429);
  });

  it('o limite de uma rota não afeta as outras', async () => {
    // Contadores independentes por rota: estourar o login não pode derrubar o resto
    // da API para aquele IP.
    for (let i = 0; i < 4; i += 1) {
      await request(app.getHttpServer()).get('/limitada');
    }

    await request(app.getHttpServer()).get('/livre').expect(200);
  });

  it('a resposta 429 informa o limite excedido', async () => {
    for (let i = 0; i < 4; i += 1) {
      await request(app.getHttpServer()).get('/limitada');
    }

    const response = await request(app.getHttpServer()).get('/limitada').expect(429);

    expect(response.headers).toHaveProperty('retry-after');
  });
});
