import 'dotenv/config';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { PrismaService } from '../src/infra/database/prisma/prisma.service';
import { setupSwagger } from '../src/infra/http/swagger';
import { createTestApp } from './helpers/app';

interface OpenApiDocument {
  info: { title: string; version: string };
  paths: Record<
    string,
    Record<
      string,
      {
        security?: unknown[];
        tags?: string[];
        responses: Record<string, { content?: Record<string, { schema: unknown }> }>;
      }
    >
  >;
  components: {
    schemas: Record<string, { properties: Record<string, { example?: unknown }> }>;
    securitySchemes: Record<string, unknown>;
  };
}

let app: INestApplication<App>;
let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp(setupSwagger));
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function fetchSpec(): Promise<OpenApiDocument> {
  const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
  return response.body as OpenApiDocument;
}

describe('Swagger (e2e)', () => {
  it('serve a interface em /docs sem exigir autenticação', async () => {
    // Documentação atrás de login é inútil para quem está avaliando a API.
    await request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('expõe o schema OpenAPI em /docs-json', async () => {
    const spec = await fetchSpec();

    expect(spec.info.title).toBe('Alicerce API');
    expect(spec.info.version).toBe('1.0');
  });

  it('documenta TODAS as rotas da API', async () => {
    // Este é o teste que impede a documentação de ficar para trás: um endpoint novo
    // sem entrada no Swagger quebra aqui.
    const spec = await fetchSpec();

    const esperadas = [
      '/auth/register',
      '/auth/login',
      '/auth/refresh',
      '/me',
      '/simulations',
      '/simulations/compare',
      '/simulations/preview',
      '/simulations/{id}',
      '/simulations/{id}/summary',
      '/simulations/{id}/schedule',
      '/simulations/{id}/extra-payments',
      '/health',
    ];

    expect(Object.keys(spec.paths).sort()).toEqual(esperadas.sort());
  });

  it('declara o esquema de autenticação Bearer', async () => {
    const spec = await fetchSpec();

    expect(spec.components.securitySchemes).toHaveProperty('access-token');
  });

  it('marca as rotas protegidas como exigindo token', async () => {
    const spec = await fetchSpec();

    expect(spec.paths['/simulations']?.post?.security).toBeDefined();
    expect(spec.paths['/me']?.get?.security).toBeDefined();
  });

  it('os DTOs trazem exemplos executáveis', async () => {
    // Sem exemplos, o "Try it out" do Swagger obriga o avaliador a inventar valores —
    // e um payload de simulação tem nove campos.
    const spec = await fetchSpec();
    const dto = spec.components.schemas.CreateSimulationDto?.properties;

    expect(dto?.propertyValueCents?.example).toBe(50_000_000);
    expect(dto?.termMonths?.example).toBe(360);
    expect(dto?.annualRate?.example).toBe(0.0975);
  });

  it('documenta o corpo de TODA resposta de sucesso com conteúdo', async () => {
    // Clientes geram tipos a partir deste schema (ex.: openapi-typescript no front).
    // Uma resposta 2xx sem schema vira `unknown` do outro lado, então este teste
    // impede que um endpoint novo seja publicado sem contrato de saída.
    const spec = await fetchSpec();

    const semSchema = Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.entries(methods).flatMap(([method, operation]) =>
        Object.entries(operation.responses)
          .filter(([status]) => status.startsWith('2') && status !== '204')
          .filter(([, response]) => response.content === undefined)
          .map(([status]) => `${method.toUpperCase()} ${path} ${status}`),
      ),
    );

    expect(semSchema).toEqual([]);
  });

  it('documenta o envelope de erro', async () => {
    const spec = await fetchSpec();

    expect(spec.components.schemas.ErrorResponseDto?.properties).toHaveProperty('code');
    expect(
      spec.paths['/simulations']?.post?.responses['422']?.content?.['application/json'],
    ).toBeDefined();
  });

  it('agrupa as rotas por tag', async () => {
    const spec = await fetchSpec();

    expect(spec.paths['/auth/login']?.post?.tags).toContain('auth');
    expect(spec.paths['/simulations']?.post?.tags).toContain('simulations');
    expect(spec.paths['/health']?.get?.tags).toContain('health');
  });
});

describe('GET / (e2e)', () => {
  it('redireciona para /docs sem exigir autenticação', async () => {
    // Quem recebe o link do deploy costuma abrir a raiz; um 404 ali parece API quebrada.
    const response = await request(app.getHttpServer()).get('/').expect(302);

    expect(response.headers.location).toBe('/docs');
  });

  it('não aparece no schema OpenAPI', async () => {
    // A raiz é navegação, não contrato da API.
    const spec = await fetchSpec();

    expect(spec.paths).not.toHaveProperty('/');
  });
});
