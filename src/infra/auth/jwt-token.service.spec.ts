import { JwtService } from '@nestjs/jwt';

import { InvalidTokenError } from '../../domain/errors/domain-errors';
import { JwtTokenService, type JwtConfig } from './jwt-token.service';

const config: JwtConfig = {
  accessSecret: 'segredo-de-access-para-teste',
  accessTtl: '15m',
  refreshSecret: 'segredo-de-refresh-DIFERENTE',
  refreshTtl: '7d',
};

function makeService(overrides: Partial<JwtConfig> = {}): JwtTokenService {
  return new JwtTokenService(new JwtService(), { ...config, ...overrides });
}

describe('JwtTokenService', () => {
  const service = makeService();

  it('emite um par de tokens distintos', async () => {
    const { accessToken, refreshToken } = await service.issuePair('user-1');

    expect(accessToken).not.toBe(refreshToken);
    // Formato JWT: header.payload.signature
    expect(accessToken.split('.')).toHaveLength(3);
  });

  it('verifica o próprio token e devolve o payload', async () => {
    const { accessToken } = await service.issuePair('user-1');

    expect(await service.verify(accessToken, 'access')).toMatchObject({
      sub: 'user-1',
      type: 'access',
    });
  });

  it('verifica o refresh token com o segredo de refresh', async () => {
    const { refreshToken } = await service.issuePair('user-1');

    expect(await service.verify(refreshToken, 'refresh')).toMatchObject({
      sub: 'user-1',
      type: 'refresh',
    });
  });

  describe('separação entre access e refresh', () => {
    it('REJEITA access token na verificação de refresh', async () => {
      const { accessToken } = await service.issuePair('user-1');

      await expect(service.verify(accessToken, 'refresh')).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('REJEITA refresh token na verificação de access', async () => {
      const { refreshToken } = await service.issuePair('user-1');

      await expect(service.verify(refreshToken, 'access')).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('a checagem de tipo protege mesmo se os segredos forem iguais por engano', async () => {
      // Cenário de erro de configuração: alguém aponta as duas variáveis para o mesmo
      // valor. A assinatura passaria a conferir nos dois sentidos, e só a checagem de
      // `type` impediria um refresh token de virar credencial de acesso.
      const mesmoSegredo = makeService({
        accessSecret: 'igual',
        refreshSecret: 'igual',
      });
      const { refreshToken } = await mesmoSegredo.issuePair('user-1');

      await expect(mesmoSegredo.verify(refreshToken, 'access')).rejects.toThrow(
        InvalidTokenError,
      );
    });
  });

  describe('rejeição de tokens inválidos', () => {
    it('rejeita token assinado com outro segredo', async () => {
      const intruso = makeService({ accessSecret: 'segredo-do-atacante' });
      const { accessToken } = await intruso.issuePair('user-1');

      await expect(service.verify(accessToken, 'access')).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('rejeita token com assinatura adulterada', async () => {
      const { accessToken } = await service.issuePair('user-1');
      const [header, payload] = accessToken.split('.');

      await expect(
        service.verify(`${header}.${payload}.assinatura-forjada`, 'access'),
      ).rejects.toThrow(InvalidTokenError);
    });

    it('rejeita token com payload adulterado — troca de usuário', async () => {
      // O ataque óbvio: pegar o próprio token e trocar o `sub` pelo id de outro.
      // A assinatura cobre o payload, então a adulteração é detectada.
      const { accessToken } = await service.issuePair('user-1');
      const [header, , signature] = accessToken.split('.');
      const forjado = Buffer.from(
        JSON.stringify({ sub: 'vitima', type: 'access' }),
      ).toString('base64url');

      await expect(
        service.verify(`${header}.${forjado}.${signature}`, 'access'),
      ).rejects.toThrow(InvalidTokenError);
    });

    it('rejeita token expirado', async () => {
      const expirado = makeService({ accessTtl: '-1s' });
      const { accessToken } = await expirado.issuePair('user-1');

      await expect(service.verify(accessToken, 'access')).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('rejeita algoritmo "none" — o ataque clássico contra JWT', async () => {
      // Um token com alg:none e sem assinatura seria aceito por implementações
      // ingênuas. A biblioteca precisa recusar.
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({ sub: 'atacante', type: 'access' }),
      ).toString('base64url');

      await expect(service.verify(`${header}.${payload}.`, 'access')).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('rejeita entradas malformadas sem estourar', async () => {
      for (const token of ['', 'lixo', 'a.b', 'a.b.c.d']) {
        await expect(service.verify(token, 'access')).rejects.toThrow(InvalidTokenError);
      }
    });
  });

  it('o payload não carrega dados sensíveis', async () => {
    // JWT é assinado, não criptografado: qualquer um lê o conteúdo em base64.
    const { accessToken } = await service.issuePair('user-1');
    const payload = accessToken.split('.')[1] ?? '';
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');

    expect(decoded).not.toMatch(/senha|password|hash|email/i);
    expect(decoded).toContain('user-1');
  });

  it('o access token expira antes do refresh', async () => {
    const { accessToken, refreshToken } = await service.issuePair('user-1');
    const exp = (token: string): number => {
      const payload = token.split('.')[1] ?? '';
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
        exp: number;
      };
      return parsed.exp;
    };

    expect(exp(accessToken)).toBeLessThan(exp(refreshToken));
  });
});
