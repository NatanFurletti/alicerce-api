import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FakeTokenService } from '../../../test/fakes/fake-token-service';
import { UnauthorizedException } from '@nestjs/common';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

function makeContext(authorization?: string): {
  context: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = { headers: { authorization } } as unknown as AuthenticatedRequest;

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { context, request };
}

function makeGuard(isPublic = false): { guard: JwtAuthGuard; tokens: FakeTokenService } {
  const tokens = new FakeTokenService();
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);

  return { guard: new JwtAuthGuard(tokens, reflector), tokens };
}

describe('JwtAuthGuard', () => {
  it('libera com access token válido e anexa o usuário à requisição', async () => {
    const { guard, tokens } = makeGuard();
    const { accessToken } = await tokens.issuePair('user-1');
    const { context, request } = makeContext(`Bearer ${accessToken}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1' });
  });

  it('REJEITA refresh token onde se espera access', async () => {
    // A assinatura é válida e o token não expirou — só o tipo está errado. Sem esta
    // checagem, um refresh token de 7 dias viraria credencial de acesso.
    const { guard, tokens } = makeGuard();
    const { refreshToken } = await tokens.issuePair('user-1');
    const { context } = makeContext(`Bearer ${refreshToken}`);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita requisição sem cabeçalho Authorization', async () => {
    const { guard } = makeGuard();

    await expect(guard.canActivate(makeContext().context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita cabeçalho malformado', async () => {
    const { guard, tokens } = makeGuard();
    const { accessToken } = await tokens.issuePair('user-1');

    const malformados = [
      accessToken, // sem o esquema
      `Basic ${accessToken}`, // esquema errado
      'Bearer', // sem valor
      'Bearer ', // valor vazio
      `Bearer ${accessToken} extra`, // partes demais
      '',
    ];

    for (const authorization of malformados) {
      await expect(guard.canActivate(makeContext(authorization).context)).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });

  it('aceita o esquema em qualquer caixa — a RFC 7235 é case-insensitive', async () => {
    const { guard, tokens } = makeGuard();
    const { accessToken } = await tokens.issuePair('user-1');

    for (const scheme of ['Bearer', 'bearer', 'BEARER', 'BeArEr']) {
      await expect(
        guard.canActivate(makeContext(`${scheme} ${accessToken}`).context),
      ).resolves.toBe(true);
    }
  });

  it('rejeita token revogado ou inválido', async () => {
    const { guard, tokens } = makeGuard();
    const { accessToken } = await tokens.issuePair('user-1');
    tokens.revoked.add(accessToken);

    await expect(
      guard.canActivate(makeContext(`Bearer ${accessToken}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('rotas públicas', () => {
    it('libera rota marcada com @Public() sem exigir token', async () => {
      const { guard } = makeGuard(true);

      await expect(guard.canActivate(makeContext().context)).resolves.toBe(true);
    });

    it('rota pública não anexa usuário à requisição', async () => {
      const { guard } = makeGuard(true);
      const { context, request } = makeContext();

      await guard.canActivate(context);

      expect(request.user).toBeUndefined();
    });
  });
});
