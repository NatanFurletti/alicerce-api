import 'dotenv/config';

import { Controller, Get, type INestApplication, Module, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { TokenService } from '../../src/application/ports/token-service';
import { AuthModule } from '../../src/infra/auth/auth.module';
import { type AuthenticatedRequest, Public } from '../../src/infra/auth/jwt-auth.guard';
import { TOKEN_SERVICE } from '../../src/infra/auth/tokens';

/** Rotas mínimas para exercitar o guard global sem depender da Etapa 5. */
@Controller('teste')
class TesteController {
  @Get('protegida')
  protegida(@Req() request: AuthenticatedRequest): { userId: string | undefined } {
    return { userId: request.user?.id };
  }

  @Public()
  @Get('publica')
  publica(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [TesteController] })
class TesteModule {}

describe('JwtAuthGuard global (e2e)', () => {
  let app: INestApplication<App>;
  let tokens: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TesteModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    tokens = moduleRef.get<TokenService>(TOKEN_SERVICE);
  });

  afterAll(async () => {
    await app.close();
  });

  it('ROTA PROTEGIDA POR PADRÃO: sem token, nega acesso', async () => {
    // A propriedade que importa: o desenvolvedor não precisa lembrar de proteger.
    await request(app.getHttpServer()).get('/teste/protegida').expect(401);
  });

  it('com access token válido, libera e identifica o usuário', async () => {
    const { accessToken } = await tokens.issuePair('user-42');

    const response = await request(app.getHttpServer())
      .get('/teste/protegida')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({ userId: 'user-42' });
  });

  it('REJEITA refresh token em rota protegida', async () => {
    const { refreshToken } = await tokens.issuePair('user-42');

    await request(app.getHttpServer())
      .get('/teste/protegida')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });

  it('rejeita token forjado com outro segredo', async () => {
    // Token com estrutura válida, assinado por quem não tem o segredo.
    const forjado =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      Buffer.from(JSON.stringify({ sub: 'atacante', type: 'access' })).toString(
        'base64url',
      ) +
      '.assinatura-invalida';

    await request(app.getHttpServer())
      .get('/teste/protegida')
      .set('Authorization', `Bearer ${forjado}`)
      .expect(401);
  });

  it('rota marcada com @Public() dispensa token', async () => {
    await request(app.getHttpServer()).get('/teste/publica').expect(200, { ok: true });
  });

  it('a resposta de negação não vaza detalhe do motivo', async () => {
    // Distinguir "expirado" de "assinatura inválida" ajudaria a calibrar tentativas.
    const { refreshToken } = await tokens.issuePair('user-42');

    const semToken = await request(app.getHttpServer()).get('/teste/protegida');
    const tipoErrado = await request(app.getHttpServer())
      .get('/teste/protegida')
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(semToken.status).toBe(tipoErrado.status);
  });
});
