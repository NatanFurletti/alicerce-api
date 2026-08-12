import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/infra/database/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/database';

/** Payload válido reutilizado: imóvel de R$ 500 mil, 20% de entrada, 360 meses. */
const simulacao = {
  propertyValueCents: 50_000_000,
  downPaymentCents: 10_000_000,
  termMonths: 360,
  annualRate: 0.0975,
  rateConvention: 'EFFECTIVE',
  amortizationSystem: 'SAC',
  charges: { mipMonthlyRate: 0.00025, dfiMonthlyRate: 0.00005, adminFeeCents: 2500 },
};

let app: INestApplication<App>;
let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

/** Cadastra, faz login e devolve o access token. */
async function signUp(email = 'natan@example.com'): Promise<string> {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Natan', email, password: 'senha-valida-123' })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'senha-valida-123' })
    .expect(200);

  return (login.body as { accessToken: string }).accessToken;
}

async function createSimulation(token: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/simulations')
    .set('Authorization', `Bearer ${token}`)
    .send(simulacao)
    .expect(201);

  return (response.body as { id: string }).id;
}

describe('API (e2e)', () => {
  describe('POST /auth/register', () => {
    it('cadastra e nunca devolve a senha nem o hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Natan', email: 'natan@example.com', password: 'senha-valida-123' })
        .expect(201);

      expect(response.body).toMatchObject({ email: 'natan@example.com' });
      expect(JSON.stringify(response.body)).not.toContain('senha-valida-123');
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    it('rejeita e-mail duplicado com 409', async () => {
      await signUp();

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Outro', email: 'natan@example.com', password: 'senha-valida-123' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'EMAIL_ALREADY_IN_USE' });
    });

    it('rejeita entrada inválida com 400 e lista os campos', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: '', email: 'nao-e-email', password: 'curta' })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('REJEITA campo não declarado no DTO em vez de ignorá-lo', async () => {
      // `forbidNonWhitelisted`: mandar um campo extra é erro explícito, não silêncio.
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Natan',
          email: 'natan@example.com',
          password: 'senha-valida-123',
          isAdmin: true,
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('devolve os dois tokens', async () => {
      await signUp();

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'natan@example.com', password: 'senha-valida-123' })
        .expect(200);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String) as string,
        refreshToken: expect.any(String) as string,
      });
    });

    it('senha errada e e-mail inexistente produzem respostas IDÊNTICAS', async () => {
      // Qualquer diferença permitiria enumerar quais e-mails estão cadastrados.
      await signUp();

      const senhaErrada = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'natan@example.com', password: 'errada' });

      const inexistente = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ninguem@example.com', password: 'errada' });

      expect(senhaErrada.status).toBe(401);
      expect(inexistente.status).toBe(401);
      expect(senhaErrada.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect((senhaErrada.body as { message: string }).message).toBe(
        (inexistente.body as { message: string }).message,
      );
    });
  });

  describe('POST /auth/refresh', () => {
    it('renova o par de tokens', async () => {
      await signUp();
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'natan@example.com', password: 'senha-valida-123' });
      const { refreshToken } = login.body as { refreshToken: string };

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('REJEITA access token na rota de refresh', async () => {
      const accessToken = await signUp();

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);
    });
  });

  describe('GET /me', () => {
    it('devolve o perfil do usuário autenticado', async () => {
      const token = await signUp();

      const response = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ email: 'natan@example.com' });
    });

    it('exige autenticação', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });
  });

  describe('POST /simulations', () => {
    it('cria e devolve o resumo calculado', async () => {
      const token = await signUp();

      const response = await request(app.getHttpServer())
        .post('/simulations')
        .set('Authorization', `Bearer ${token}`)
        .send(simulacao)
        .expect(201);

      expect(response.body).toMatchObject({
        financedAmountCents: 40_000_000,
        termMonths: 360,
      });
      expect(
        (response.body as { cet: { annualRate: number } }).cet.annualRate,
      ).toBeGreaterThan(0.0975);
    });

    it('viola LTV -> 422 com o código do erro de domínio', async () => {
      const token = await signUp();

      const response = await request(app.getHttpServer())
        .post('/simulations')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...simulacao, downPaymentCents: 1_000_000 })
        .expect(422);

      expect(response.body).toMatchObject({ code: 'LTV_EXCEEDED' });
    });

    it('422 e não 400: o corpo é válido, a regra de negócio é que falha', async () => {
      const token = await signUp();

      const semSintaxe = await request(app.getHttpServer())
        .post('/simulations')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...simulacao, termMonths: 'trezentos' });

      const semRegra = await request(app.getHttpServer())
        .post('/simulations')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...simulacao, termMonths: 500 });

      expect(semSintaxe.status).toBe(400);
      expect(semRegra.status).toBe(422);
    });

    it('exige autenticação', async () => {
      await request(app.getHttpServer()).post('/simulations').send(simulacao).expect(401);
    });
  });

  describe('GET /simulations', () => {
    it('lista paginada do próprio usuário', async () => {
      const token = await signUp();
      await createSimulation(token);
      await createSimulation(token);

      const response = await request(app.getHttpServer())
        .get('/simulations?page=1&pageSize=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect((response.body as { items: unknown[] }).items).toHaveLength(1);
    });

    it('converte page e pageSize da query string, que chegam como texto', async () => {
      const token = await signUp();

      const response = await request(app.getHttpServer())
        .get('/simulations?page=1&pageSize=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ page: 1, pageSize: 5 });
    });

    it('rejeita pageSize acima do teto — proteção contra exaustão de memória', async () => {
      const token = await signUp();

      await request(app.getHttpServer())
        .get('/simulations?pageSize=100000')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('GET /simulations/:id', () => {
    it('devolve o resumo', async () => {
      const token = await signUp();
      const id = await createSimulation(token);

      const response = await request(app.getHttpServer())
        .get(`/simulations/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ id, termMonths: 360 });
    });

    it('id malformado -> 400 antes de tocar o banco', async () => {
      const token = await signUp();

      await request(app.getHttpServer())
        .get('/simulations/nao-e-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('simulação inexistente -> 404', async () => {
      const token = await signUp();

      await request(app.getHttpServer())
        .get('/simulations/3f2504e0-4f89-41d3-9a0c-0305e82c3301')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('GET /simulations/:id/schedule', () => {
    it('devolve a tabela paginada, com 360 no total', async () => {
      const token = await signUp();
      const id = await createSimulation(token);

      const response = await request(app.getHttpServer())
        .get(`/simulations/${id}/schedule?page=1&pageSize=12`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({ total: 360, pageSize: 12 });
      expect((response.body as { items: { month: number }[] }).items[0]?.month).toBe(1);
    });

    it('a última página fecha o saldo devedor em zero', async () => {
      const token = await signUp();
      const id = await createSimulation(token);

      const response = await request(app.getHttpServer())
        .get(`/simulations/${id}/schedule?page=18&pageSize=20`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const items = (response.body as { items: { closingBalance: number }[] }).items;
      expect(items.at(-1)?.closingBalance).toBe(0);
    });
  });

  describe('POST /simulations/:id/extra-payments', () => {
    it('registra o aporte e devolve o novo prazo', async () => {
      const token = await signUp();
      const id = await createSimulation(token);

      const response = await request(app.getHttpServer())
        .post(`/simulations/${id}/extra-payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ monthNumber: 13, amountCents: 5_000_000, strategy: 'REDUCE_TERM' })
        .expect(201);

      expect((response.body as { newTermMonths: number }).newTermMonths).toBeLessThan(
        360,
      );
    });

    it('aporte fora do prazo -> 422 e nada é persistido', async () => {
      const token = await signUp();
      const id = await createSimulation(token);

      const response = await request(app.getHttpServer())
        .post(`/simulations/${id}/extra-payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ monthNumber: 400, amountCents: 5_000_000, strategy: 'REDUCE_TERM' })
        .expect(422);

      expect(response.body).toMatchObject({ code: 'EXTRA_PAYMENT_OUT_OF_RANGE' });
      expect(await prisma.extraPayment.count()).toBe(0);
    });
  });

  describe('DELETE /simulations/:id', () => {
    it('remove e devolve 204 sem corpo', async () => {
      const token = await signUp();
      const id = await createSimulation(token);

      const response = await request(app.getHttpServer())
        .delete(`/simulations/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(await prisma.simulation.count()).toBe(0);
    });
  });

  describe('POST /simulations/compare', () => {
    it('devolve SAC e Price lado a lado', async () => {
      const token = await signUp();

      const response = await request(app.getHttpServer())
        .post('/simulations/compare')
        .set('Authorization', `Bearer ${token}`)
        .send(simulacao)
        .expect(200);

      const body = response.body as {
        sac: { summary: { totalInterest: number } };
        price: { summary: { totalInterest: number } };
        interestDifferenceCents: number;
      };

      expect(body.price.summary.totalInterest).toBeGreaterThan(
        body.sac.summary.totalInterest,
      );
      expect(body.interestDifferenceCents).toBeGreaterThan(0);
    });

    it('a rota /compare não é capturada por /:id', async () => {
      // Ordem de declaração no controller: rotas literais antes da paramétrica.
      const token = await signUp();

      await request(app.getHttpServer())
        .post('/simulations/compare')
        .set('Authorization', `Bearer ${token}`)
        .send(simulacao)
        .expect(200);
    });
  });

  describe('POST /simulations/preview', () => {
    it('calcula SEM autenticação e SEM persistir', async () => {
      const response = await request(app.getHttpServer())
        .post('/simulations/preview')
        .send(simulacao)
        .expect(200);

      expect(response.body).toHaveProperty('sac');
      expect(await prisma.simulation.count()).toBe(0);
    });
  });

  describe('isolamento entre usuários pela API', () => {
    it('B recebe 404 ao pedir simulação de A', async () => {
      const tokenA = await signUp('a@example.com');
      const tokenB = await signUp('b@example.com');
      const id = await createSimulation(tokenA);

      await request(app.getHttpServer())
        .get(`/simulations/${id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('B não apaga simulação de A', async () => {
      const tokenA = await signUp('a@example.com');
      const tokenB = await signUp('b@example.com');
      const id = await createSimulation(tokenA);

      await request(app.getHttpServer())
        .delete(`/simulations/${id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      expect(await prisma.simulation.count()).toBe(1);
    });

    it('mandar userId no corpo NÃO muda o dono da simulação', async () => {
      // O ataque óbvio contra APIs que confiam no payload. Aqui o campo nem existe
      // no DTO, então o `forbidNonWhitelisted` rejeita a requisição inteira.
      const tokenA = await signUp('a@example.com');

      await request(app.getHttpServer())
        .post('/simulations')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...simulacao, userId: 'outro-usuario' })
        .expect(400);
    });
  });

  describe('formato de erro', () => {
    it('toda resposta de erro tem code, message, path e timestamp', async () => {
      const response = await request(app.getHttpServer()).get('/me').expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        code: expect.any(String) as string,
        message: expect.any(String) as string,
        path: '/me',
        timestamp: expect.any(String) as string,
      });
    });

    it('rota inexistente -> 404 no mesmo formato', async () => {
      const response = await request(app.getHttpServer()).get('/nao-existe').expect(404);

      expect(response.body).toMatchObject({ statusCode: 404, path: '/nao-existe' });
    });
  });

  describe('GET /health', () => {
    it('é público', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });
});
